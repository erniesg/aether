import { NextResponse } from 'next/server';
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
  const bundle = await getEventBundle(body.eventId);
  if (!bundle) {
    return NextResponse.json({ ok: false, error: 'event not found' }, { status: 404 });
  }
  const limit =
    typeof body.limit === 'number' && Number.isFinite(body.limit)
      ? Math.max(1, Math.min(50, Math.round(body.limit)))
      : 10;
  return NextResponse.json({
    ok: true,
    event: bundle.event,
    voices: bundle.voices.sort((a, b) => b.reachScore - a.reachScore).slice(0, limit),
  });
}
