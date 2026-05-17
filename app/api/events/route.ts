import { NextResponse } from 'next/server';
import { createEventRecap, refreshEventRecap } from '@/lib/research/event-recap/pipeline';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid JSON body' }, { status: 400 });
  }
  if (!isObject(body) || typeof body.name !== 'string' || !body.name.trim()) {
    return NextResponse.json({ ok: false, error: 'name is required' }, { status: 400 });
  }

  try {
    const event = await createEventRecap({
      name: body.name,
      contextHint: typeof body.contextHint === 'string' ? body.contextHint : undefined,
      workspaceId: typeof body.workspaceId === 'string' ? body.workspaceId : undefined,
      daysBefore: typeof body.daysBefore === 'number' ? body.daysBefore : undefined,
      daysAfter: typeof body.daysAfter === 'number' ? body.daysAfter : undefined,
      refreshIntervalHours:
        typeof body.refreshIntervalHours === 'number'
          ? body.refreshIntervalHours
          : undefined,
      maxItemsPerPlatform:
        typeof body.maxItemsPerPlatform === 'number'
          ? body.maxItemsPerPlatform
          : undefined,
      monthlyCreditBudget:
        typeof body.monthlyCreditBudget === 'number'
          ? body.monthlyCreditBudget
          : undefined,
      liveMode: body.liveMode === 'tinyfish' ? 'tinyfish' : 'mock',
    });

    const shouldRefresh = body.refresh !== false;
    if (!shouldRefresh) return NextResponse.json({ ok: true, event });

    const bundle = await refreshEventRecap({ eventId: event.eventId });
    return NextResponse.json({ ok: true, event: bundle?.event ?? event, bundle });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
