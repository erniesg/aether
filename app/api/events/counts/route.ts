import { NextResponse } from 'next/server';
import { estimateEventCounts } from '@/lib/research/event-recap/counts';
import type { EventPlatform } from '@/lib/research/event-recap/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function platforms(value: unknown): EventPlatform[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((item): item is EventPlatform => item === 'x' || item === 'linkedin');
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!isObject(body)) {
    return NextResponse.json({ ok: false, error: 'JSON object body is required' }, { status: 400 });
  }
  if (typeof body.eventId !== 'string' && typeof body.eventName !== 'string') {
    return NextResponse.json(
      { ok: false, error: 'eventId or eventName is required' },
      { status: 400 }
    );
  }

  try {
    const counts = await estimateEventCounts({
      eventId: typeof body.eventId === 'string' ? body.eventId : undefined,
      eventName: typeof body.eventName === 'string' ? body.eventName : undefined,
      contextHint: typeof body.contextHint === 'string' ? body.contextHint : undefined,
      querySet: Array.isArray(body.querySet)
        ? body.querySet.filter((item): item is string => typeof item === 'string')
        : undefined,
      platforms: platforms(body.platforms),
      windowStart: typeof body.windowStart === 'string' ? body.windowStart : undefined,
      windowEnd: typeof body.windowEnd === 'string' ? body.windowEnd : undefined,
      maxQueries: typeof body.maxQueries === 'number' ? body.maxQueries : undefined,
      maxItems: typeof body.maxItems === 'number' ? body.maxItems : undefined,
      linkedinMode:
        body.linkedinMode === 'browser-direct' || body.linkedinMode === 'search-index'
          ? body.linkedinMode
          : undefined,
      syncVault: typeof body.syncVault === 'boolean' ? body.syncVault : undefined,
    });
    return NextResponse.json({ ok: true, counts });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
