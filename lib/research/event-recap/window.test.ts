import { beforeEach, describe, expect, it } from 'vitest';
import { createEventRecap, refreshEventRecap } from './pipeline';
import { __resetEventRunEventsMemory } from './run-events';

describe('event recap windows', () => {
  beforeEach(() => {
    __resetEventRunEventsMemory();
  });

  it('uses explicit past event dates when bracketing scrape windows', async () => {
    const eventId = 'aie-worlds-fair-2025-window';
    await createEventRecap({
      eventId,
      name: "AIE World's Fair 2025",
      liveMode: 'mock',
      startsAt: '2025-06-03',
      endsAt: '2025-06-05',
      daysBefore: 7,
      daysAfter: 14,
    });

    const bundle = await refreshEventRecap({
      eventId,
      name: "AIE World's Fair 2025",
      liveMode: 'mock',
      daysBefore: 7,
      daysAfter: 14,
    });

    expect(bundle?.event.startsAt).toBe('2025-06-03');
    expect(bundle?.event.endsAt).toBe('2025-06-05');
    expect(bundle?.runs[0]?.windowStart).toBe('2025-05-27T00:00:00.000Z');
    expect(bundle?.runs[0]?.windowEnd).toBe('2025-06-19T00:00:00.000Z');
  });
});
