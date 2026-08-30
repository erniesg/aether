import { NextResponse } from 'next/server';
import { authorizeEventApiRequest } from '@/lib/research/event-recap/api-auth';
import { getEventBundle } from '@/lib/research/event-recap/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!isObject(body) || typeof body.eventId !== 'string') {
    return NextResponse.json({ ok: false, error: 'eventId is required' }, { status: 400 });
  }
  const authResponse = await authorizeEventApiRequest(request, {
    route: '/api/events/themes',
    action: 'read-themes',
    metadata: { eventId: body.eventId },
  });
  if (authResponse) return authResponse;

  const bundle = await getEventBundle(body.eventId);
  if (!bundle) {
    return NextResponse.json({ ok: false, error: 'event not found' }, { status: 404 });
  }
  return NextResponse.json({
    ok: true,
    event: bundle.event,
    themes: bundle.themes
      .map((theme) => ({
        ...theme,
        posts: theme.postIds
          .map((postId) => bundle.posts.find((post) => post.postId === postId))
          .filter(Boolean)
          .slice(0, 8),
      }))
      .sort((a, b) => b.score - a.score),
  });
}
