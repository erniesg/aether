import { NextResponse } from 'next/server';
import { resolvePublisher } from '@/lib/providers/publisher/registry';
import type {
  PublishPlatform,
  ScheduledPost,
} from '@/lib/providers/publisher/types';
import {
  PUBLISH_PLATFORMS,
  PublisherUnavailableError,
} from '@/lib/providers/publisher/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type PublishScheduleStatus = 'scheduled' | 'preview-only' | 'skipped' | 'failed';

interface PublishScheduleResult {
  platform: PublishPlatform;
  status: PublishScheduleStatus;
  previewUrl?: string;
  externalId?: string;
  error?: string;
}

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

function isPlatform(value: unknown): value is PublishPlatform {
  return (
    typeof value === 'string' &&
    (PUBLISH_PLATFORMS as readonly string[]).includes(value)
  );
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((x): x is string => typeof x === 'string');
}

function parsePost(value: unknown): ScheduledPost | null {
  if (typeof value !== 'object' || value === null) return null;
  const b = value as Record<string, unknown>;
  if (!isPlatform(b.platform)) return null;
  const mediaUrls = stringArray(b.mediaUrls).filter(Boolean);
  if (mediaUrls.length === 0) return null;
  const scheduledAt =
    typeof b.scheduledAt === 'string' && b.scheduledAt
      ? b.scheduledAt
      : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  return {
    id: typeof b.id === 'string' ? b.id : '',
    platform: b.platform,
    mediaUrls,
    caption: typeof b.caption === 'string' ? b.caption : '',
    hashtags: stringArray(b.hashtags).map((tag) => tag.replace(/^#+/, '')),
    scheduledAt,
    accountId: typeof b.accountId === 'string' ? b.accountId : undefined,
  };
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, 'invalid JSON body');
  }

  if (typeof body !== 'object' || body === null) {
    return jsonError(400, 'body must be an object');
  }

  const b = body as Record<string, unknown>;
  const workspaceId =
    typeof b.workspaceId === 'string' && b.workspaceId.trim()
      ? b.workspaceId.trim()
      : '';
  if (!workspaceId) {
    return jsonError(400, 'workspaceId is required');
  }

  const posts = Array.isArray(b.posts)
    ? b.posts.map(parsePost).filter((post): post is ScheduledPost => Boolean(post))
    : [];
  if (posts.length === 0) {
    return jsonError(400, 'posts with mediaUrls are required');
  }

  let publisher;
  try {
    publisher = resolvePublisher({
      workspaceId,
      baseUrl: new URL(request.url).origin,
      preferredId: typeof b.providerId === 'string' ? b.providerId : undefined,
    });
  } catch (err) {
    if (err instanceof PublisherUnavailableError) {
      return NextResponse.json({
        ok: true,
        providerId: 'preview',
        results: posts.map((post): PublishScheduleResult => ({
          platform: post.platform,
          status: 'preview-only',
          error: err.message,
        })),
      });
    }
    const message = err instanceof Error ? err.message : String(err);
    return jsonError(500, message);
  }

  if (publisher.id === 'preview') {
    return NextResponse.json({
      ok: true,
      providerId: publisher.id,
      results: posts.map((post): PublishScheduleResult => ({
        platform: post.platform,
        status: 'preview-only',
      })),
    });
  }

  const results: PublishScheduleResult[] = [];
  for (const post of posts) {
    if (!publisher.canPublish(post)) {
      results.push({
        platform: post.platform,
        status: 'skipped',
        error: `${publisher.id} is not configured for ${post.platform}`,
      });
      continue;
    }
    try {
      const result = await publisher.schedule(post);
      results.push({
        platform: post.platform,
        status: 'scheduled',
        previewUrl: result.previewUrl,
        externalId: result.externalId,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({ platform: post.platform, status: 'failed', error: message });
    }
  }

  return NextResponse.json({
    ok: results.every((result) => result.status === 'scheduled'),
    providerId: publisher.id,
    results,
  });
}
