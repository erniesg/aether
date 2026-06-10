import type { EventRecapRecord } from './types';

export interface DueRefreshSelection {
  event: EventRecapRecord;
  skipped?: 'budget';
}

export function selectDueRefreshEvents(
  events: EventRecapRecord[],
  now = Date.now()
): DueRefreshSelection[] {
  return events
    .filter((event) => typeof event.nextRefreshAt === 'number' && event.nextRefreshAt <= now)
    .map((event) => ({
      event,
      skipped: isBudgetExhausted(event) ? 'budget' : undefined,
    }));
}

function isBudgetExhausted(event: EventRecapRecord): boolean {
  return event.monthlyCreditBudget > 0 && event.usedCredits >= event.monthlyCreditBudget;
}
