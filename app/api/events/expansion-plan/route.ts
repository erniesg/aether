import { NextResponse } from 'next/server';
import { authorizeEventApiRequest } from '@/lib/research/event-recap/api-auth';
import { deriveExpansionPlan } from '@/lib/research/event-recap/expand';
import { getEventBundle } from '@/lib/research/event-recap/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function boundedNumber(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : fallback;
  return Math.max(min, Math.min(max, n));
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!isObject(body) || typeof body.eventId !== 'string') {
    return NextResponse.json({ ok: false, error: 'eventId is required' }, { status: 400 });
  }
  const authResponse = await authorizeEventApiRequest(request, {
    route: '/api/events/expansion-plan',
    action: 'derive-expansion-plan',
    metadata: { eventId: body.eventId },
  });
  if (authResponse) return authResponse;

  const bundle = await getEventBundle(body.eventId);
  if (!bundle) {
    return NextResponse.json({ ok: false, error: 'event not found' }, { status: 404 });
  }

  const plan = deriveExpansionPlan(
    bundle.event.canonicalName ?? bundle.event.name,
    bundle.posts,
    {
      baseQueries: bundle.event.querySet,
      maxAnchors: boundedNumber(body.maxAnchors, 20, 1, 50),
      maxQueries: boundedNumber(body.maxQueries, 12, 1, 24),
    }
  );

  return NextResponse.json({
    ok: true,
    event: bundle.event,
    plan,
  });
}
