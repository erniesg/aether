import { NextResponse } from 'next/server';
import { getEventBundle } from '@/lib/research/event-recap/store';
import type { EventPlatform } from '@/lib/research/event-recap/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function platform(value: unknown): EventPlatform | undefined {
  return value === 'x' || value === 'linkedin' ? value : undefined;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!isObject(body) || typeof body.eventId !== 'string') {
    return NextResponse.json({ ok: false, error: 'eventId is required' }, { status: 400 });
  }

  const bundle = await getEventBundle(body.eventId);
  if (!bundle) {
    return NextResponse.json({ ok: false, error: 'event not found' }, { status: 404 });
  }

  const q = typeof body.query === 'string' ? body.query.trim().toLowerCase() : '';
  const p = platform(body.platform);
  const limit =
    typeof body.limit === 'number' && Number.isFinite(body.limit)
      ? Math.max(1, Math.min(50, Math.round(body.limit)))
      : 12;
  const posts = bundle.posts
    .filter((post) => !p || post.platform === p)
    .filter((post) => {
      if (!q) return true;
      return (
        post.text.toLowerCase().includes(q) ||
        post.authorName.toLowerCase().includes(q) ||
        (post.authorHandle ?? '').toLowerCase().includes(q) ||
        post.tags.some((tag) => tag.toLowerCase().includes(q))
      );
    })
    .sort((a, b) => b.reachScore - a.reachScore)
    .slice(0, limit);

  return NextResponse.json({
    ok: true,
    event: bundle.event,
    count: posts.length,
    posts: posts.map((post) => ({
      postId: post.postId,
      platform: post.platform,
      url: post.url,
      authorName: post.authorName,
      authorHandle: post.authorHandle,
      text: post.text,
      postedAt: post.postedAt,
      metrics: post.metrics,
      reachScore: post.reachScore,
      tags: post.tags,
    })),
  });
}
