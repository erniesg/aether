import { NextResponse } from 'next/server';
import { ConvexHttpClient } from 'convex/browser';
import { anyApi } from 'convex/server';
import {
  clampPostLimit,
  collectReferenceAccountPosts,
} from '@/lib/research/account-analysis-lap';
import type { ReferenceAccountPost } from '@/lib/research/account-analysis';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const presenceInsightsApi = (anyApi as unknown as {
  presenceInsights: { upsertReferencePosts: unknown };
}).presenceInsights;

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, 'invalid JSON body');
  }

  const parsed = parseBody(body);
  if (!parsed.ok) return jsonError(400, parsed.error);

  const posts = await collectReferenceAccountPosts({
    handles: parsed.handles,
    maxPostsPerHandle: parsed.maxPostsPerHandle,
    windowStart: parsed.windowStart,
    windowEnd: parsed.windowEnd,
  });
  const persistence = await persistPosts({
    workspaceId: parsed.workspaceId,
    profileId: parsed.profileId,
    posts,
  });

  console.info(
    `account-analysis.lap.posts=${posts.length} workspaceId=${parsed.workspaceId} profileId=${parsed.profileId}`
  );

  return NextResponse.json({
    ok: true,
    workspaceId: parsed.workspaceId,
    profileId: parsed.profileId,
    postsCollected: posts.length,
    ...(persistence ? { persistence } : {}),
  });
}

function parseBody(body: unknown):
  | {
      ok: true;
      workspaceId: string;
      profileId: string;
      handles: string[];
      maxPostsPerHandle: number;
      windowStart?: string;
      windowEnd?: string;
    }
  | { ok: false; error: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'body must be an object' };
  }
  const record = body as Record<string, unknown>;
  const workspaceId = stringField(record, 'workspaceId') || 'demo-ws';
  const profileId = stringField(record, 'profileId');
  const handles = Array.isArray(record.handles)
    ? record.handles
        .map((value) => (typeof value === 'string' ? value.trim() : ''))
        .filter(Boolean)
    : [];
  if (!profileId) return { ok: false, error: 'profileId is required' };
  if (handles.length === 0) return { ok: false, error: 'at least one handle is required' };
  return {
    ok: true,
    workspaceId,
    profileId,
    handles,
    maxPostsPerHandle: clampPostLimit(record.maxPostsPerHandle),
    windowStart: stringField(record, 'windowStart') || undefined,
    windowEnd: stringField(record, 'windowEnd') || undefined,
  };
}

async function persistPosts(input: {
  workspaceId: string;
  profileId: string;
  posts: ReferenceAccountPost[];
}): Promise<{ inserted: number; skipped: number } | null> {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) return null;
  const client = new ConvexHttpClient(convexUrl);
  const deployKey = process.env.CONVEX_DEPLOY_KEY;
  if (deployKey) {
    const adminClient = client as unknown as { setAdminAuth?: (key: string) => void };
    if (typeof adminClient.setAdminAuth === 'function') adminClient.setAdminAuth(deployKey);
  }
  return (await client.mutation(presenceInsightsApi.upsertReferencePosts as never, {
    workspaceId: input.workspaceId,
    profileId: input.profileId,
    posts: input.posts,
  } as never)) as { inserted: number; skipped: number };
}

function isAuthorized(request: Request): boolean {
  const expected = process.env.PRESENCE_LAP_SECRET?.trim() || process.env.CRON_SECRET?.trim();
  if (!expected) return false;
  const bearer = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  const direct = request.headers.get('x-aether-lap-secret')?.trim();
  return bearer === expected || direct === expected;
}

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

function stringField(input: Record<string, unknown>, field: string): string {
  const value = input[field];
  return typeof value === 'string' ? value.trim() : '';
}
