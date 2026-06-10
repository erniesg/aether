import { NextResponse } from 'next/server';
import { refreshEventRecap } from '@/lib/research/event-recap/pipeline';
import { selectDueRefreshEvents } from '@/lib/research/event-recap/refresh-due';
import { listEventRecaps } from '@/lib/research/event-recap/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

type RefreshDueResult =
  | { eventId: string; runId: string }
  | { eventId: string; skipped: 'budget' }
  | { eventId: string; skipped: 'error'; error: string };

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const events = await listEventRecaps();
  const selections = selectDueRefreshEvents(events);
  const results: RefreshDueResult[] = [];

  for (const selection of selections) {
    const { event } = selection;
    if (selection.skipped === 'budget') {
      results.push({ eventId: event.eventId, skipped: 'budget' });
      continue;
    }

    try {
      const bundle = await refreshEventRecap({
        eventId: event.eventId,
        name: event.name,
        contextHint: event.contextHint,
        liveMode: event.liveMode,
        maxItemsPerPlatform: event.maxItemsPerPlatform,
        monthlyCreditBudget: event.monthlyCreditBudget,
        extraQuerySet: event.querySet,
        sourceUrls: event.sourceUrls,
      });
      const runId = bundle?.runs[0]?.runId ?? '';
      results.push({ eventId: event.eventId, runId });
    } catch (err) {
      results.push({
        eventId: event.eventId,
        skipped: 'error',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json(results);
}

function isAuthorized(request: Request): boolean {
  const expected = process.env.CRON_REFRESH_SECRET?.trim();
  if (!expected) return false;
  const header = request.headers.get('authorization')?.trim();
  return header === `Bearer ${expected}`;
}
