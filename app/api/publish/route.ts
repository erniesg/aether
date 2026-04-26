import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  KNOWN_PUBLISHER_IDS,
  listAvailablePublishers,
  resolvePublisher,
  resolvePublisherForPost,
} from '@/lib/providers/publisher/registry';
import { createInMemoryScheduledPostStorage } from '@/lib/providers/publisher/memory-storage';
import {
  recordScheduledPost,
  recordScheduledPostCancel,
} from '@/lib/convex/http';
import {
  PUBLISH_PLATFORMS,
  PublisherError,
  PublisherUnavailableError,
  type PublisherProviderId,
  type ScheduledPost,
} from '@/lib/providers/publisher/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const serverStorage = createInMemoryScheduledPostStorage();

const providerIdSchema = z.enum([
  'preview',
  'postiz',
  'social-auto-upload',
]);
const platformSchema = z.enum(
  PUBLISH_PLATFORMS as [ScheduledPost['platform'], ...ScheduledPost['platform'][]]
);

const scheduledPostSchema = z.object({
  id: z.string().optional().default(''),
  platform: platformSchema,
  mediaUrls: z.array(z.string().min(1)).min(1),
  caption: z.string().default(''),
  hashtags: z.array(z.string()).default([]),
  scheduledAt: z.string().datetime(),
  accountId: z.string().optional(),
});

const scheduleSchema = z.object({
  workspaceId: z.string().min(1),
  providerId: providerIdSchema.optional(),
  allowPreviewFallback: z.boolean().optional().default(false),
  post: scheduledPostSchema,
});

const cancelSchema = z.object({
  workspaceId: z.string().min(1),
  providerId: providerIdSchema.optional(),
  id: z.string().min(1),
  externalId: z.string().optional(),
});

function jsonError(status: number, error: string, code?: string) {
  return NextResponse.json(
    code ? { ok: false, error, code } : { ok: false, error },
    { status }
  );
}

function extractPreviewId(previewUrl: string): string | null {
  try {
    return new URL(previewUrl, 'http://local').searchParams.get('publishPreview');
  } catch {
    return null;
  }
}

function fallbackId(): string {
  return `pub_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    providers: listAvailablePublishers(),
    knownProviders: KNOWN_PUBLISHER_IDS,
  });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, 'invalid JSON body');
  }

  const parsed = scheduleSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, parsed.error.issues[0]?.message ?? 'invalid body');
  }

  const { workspaceId, providerId, allowPreviewFallback } = parsed.data;
  const post: ScheduledPost = {
    ...parsed.data.post,
    id: parsed.data.post.id ?? '',
  };

  try {
    const publisher = resolvePublisherForPost({
      workspaceId,
      storage: serverStorage,
      preferredId: providerId,
      post,
    });
    if (
      publisher.id === 'preview' &&
      providerId !== 'preview' &&
      !allowPreviewFallback
    ) {
      throw new PublisherUnavailableError(
        post.platform,
        `no real publisher adapter can publish ${post.platform}`
      );
    }
    const result = await publisher.schedule(post);
    const persistedId = await recordScheduledPost({
      workspaceId,
      post,
      provider: publisher.id,
      externalId: result.externalId,
    });
    const id =
      persistedId ??
      extractPreviewId(result.previewUrl) ??
      result.externalId ??
      fallbackId();
    const scheduled: ScheduledPost = {
      ...post,
      id,
      provider: publisher.id,
      externalId: result.externalId,
      status: 'scheduled',
    };

    return NextResponse.json({
      ok: true,
      provider: { id: publisher.id },
      post: scheduled,
      result,
    });
  } catch (err) {
    const { status, message, code } = errorResponse(err);
    return jsonError(status, message, code);
  }
}

export async function DELETE(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, 'invalid JSON body');
  }

  const parsed = cancelSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, parsed.error.issues[0]?.message ?? 'invalid body');
  }

  const { workspaceId, providerId, id, externalId } = parsed.data;
  try {
    const publisher = resolvePublisher({
      workspaceId,
      storage: serverStorage,
      preferredId: providerId,
    });
    await publisher.cancel(externalId ?? id);
    await recordScheduledPostCancel(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const { status, message, code } = errorResponse(err);
    return jsonError(status, message, code);
  }
}

function errorResponse(err: unknown): {
  status: number;
  message: string;
  code?: string;
} {
  if (err instanceof PublisherUnavailableError) {
    return { status: 503, message: err.message, code: 'publisher_unavailable' };
  }
  if (err instanceof PublisherError) {
    return { status: 502, message: err.message, code: 'publisher_error' };
  }
  return {
    status: 500,
    message: err instanceof Error ? err.message : String(err),
  };
}
