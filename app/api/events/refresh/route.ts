import { NextResponse } from 'next/server';
import { refreshEventRecap } from '@/lib/research/event-recap/pipeline';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const input = isObject(body) ? body : {};
  if (typeof input.eventId !== 'string' || !input.eventId.trim()) {
    return NextResponse.json({ ok: false, error: 'eventId is required' }, { status: 400 });
  }

  try {
    const bundle = await refreshEventRecap({
      eventId: input.eventId,
      name: typeof input.name === 'string' ? input.name : undefined,
      contextHint: typeof input.contextHint === 'string' ? input.contextHint : undefined,
      liveMode: input.liveMode === 'tinyfish' ? 'tinyfish' : undefined,
      maxItemsPerPlatform:
        typeof input.maxItemsPerPlatform === 'number' ? input.maxItemsPerPlatform : undefined,
      targetItemsPerPlatform:
        typeof input.targetItemsPerPlatform === 'number'
          ? input.targetItemsPerPlatform
          : undefined,
      dedupeAgainstExisting:
        typeof input.dedupeAgainstExisting === 'boolean'
          ? input.dedupeAgainstExisting
          : undefined,
      platforms: Array.isArray(input.platforms)
        ? input.platforms.filter((platform): platform is 'x' | 'linkedin' =>
            platform === 'x' || platform === 'linkedin'
          )
        : undefined,
      linkedinMode:
        input.linkedinMode === 'browser-direct' || input.linkedinMode === 'search-fetch'
          ? input.linkedinMode
          : undefined,
      maxQueries: typeof input.maxQueries === 'number' ? input.maxQueries : undefined,
      maxSearchPagesPerQuery:
        typeof input.maxSearchPagesPerQuery === 'number'
          ? input.maxSearchPagesPerQuery
          : undefined,
      includeMedia: typeof input.includeMedia === 'boolean' ? input.includeMedia : undefined,
      monthlyCreditBudget:
        typeof input.monthlyCreditBudget === 'number' ? input.monthlyCreditBudget : undefined,
    });
    return NextResponse.json({ ok: true, bundle });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
