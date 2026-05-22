import { beforeEach, describe, expect, it } from 'vitest';
import { createEventRecap, refreshEventRecap } from '@/lib/research/event-recap/pipeline';
import {
  __resetEventRunEventsMemory,
  listEventRunEvents,
} from '@/lib/research/event-recap/run-events';

describe('refreshEventRecap run events', () => {
  beforeEach(() => {
    __resetEventRunEventsMemory();
  });

  it('emits a phased run-event timeline for a mock refresh', async () => {
    const eventId = 'mock-run-phased';
    await createEventRecap({ eventId, name: 'Mock Phased Event', liveMode: 'mock' });
    await refreshEventRecap({
      eventId,
      name: 'Mock Phased Event',
      liveMode: 'mock',
      platforms: ['x', 'linkedin', 'youtube'],
    });

    const events = await listEventRunEvents(eventId);
    const tags = events.map((event) => event.tag);

    expect(tags[0]).toBe('plan.ready');
    expect(tags).toContain('resolve.ok');
    expect(tags).toContain('budget.ready');
    expect(tags).toContain('collect.x.start');
    expect(tags).toContain('collect.x.ok');
    expect(tags).toContain('collect.linkedin.ok');
    expect(tags).toContain('collect.youtube.ok');
    expect(tags).toContain('enrich.ok');
    expect(tags).toContain('cluster.ok');
    expect(tags).toContain('export.ready');
    expect(tags[tags.length - 1]).toBe('run.done');
  });

  it('reports zero credits and a fixed corpus for mock mode', async () => {
    const eventId = 'mock-run-budget';
    await createEventRecap({ eventId, name: 'Mock Budget Event', liveMode: 'mock' });
    await refreshEventRecap({ eventId, name: 'Mock Budget Event', liveMode: 'mock' });

    const events = await listEventRunEvents(eventId);
    const budget = events.find((event) => event.tag === 'budget.ready');
    expect(budget?.data?.estimatedCredits).toBe(0);
    expect(budget?.message).toContain('mock mode');

    const runDone = events.find((event) => event.tag === 'run.done');
    expect(runDone?.data?.status).toBe('completed');
  });

  it('exposes run events on the refreshed bundle', async () => {
    const eventId = 'mock-run-bundle';
    await createEventRecap({ eventId, name: 'Mock Bundle Event', liveMode: 'mock' });
    const bundle = await refreshEventRecap({
      eventId,
      name: 'Mock Bundle Event',
      liveMode: 'mock',
    });

    expect(bundle?.runEvents?.length ?? 0).toBeGreaterThan(0);
    expect(bundle?.runEvents?.some((event) => event.tag === 'run.done')).toBe(true);
  });
});
