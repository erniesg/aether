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
    route: '/api/events/:eventId/top-voices',
    action: 'read-top-voices',
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
    voices: bundle.voices.sort((a, b) => b.reachScore - a.reachScore),
  });
}
