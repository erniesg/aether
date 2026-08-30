import { NextResponse } from 'next/server';
import { authorizeEventApiRequest } from '@/lib/research/event-recap/api-auth';
import { getEventBundle } from '@/lib/research/event-recap/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  const authResponse = await authorizeEventApiRequest(request, {
    route: '/api/events/:eventId/themes',
    action: 'read-themes',
    metadata: { eventId },
  });
  if (authResponse) return authResponse;

  const bundle = await getEventBundle(eventId);
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
