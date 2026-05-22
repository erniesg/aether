import { beforeEach, describe, expect, it } from 'vitest';
import {
  __resetEventRunEventsMemory,
  listEventRunEvents,
  logEventRunEvent,
} from '@/lib/research/event-recap/run-events';

describe('event recap run events', () => {
  beforeEach(() => {
    __resetEventRunEventsMemory();
  });

  it('persists run events to the in-memory fallback and lists them oldest-first', async () => {
    logEventRunEvent({ eventId: 'evt-1', runId: 'run-1', tag: 'plan.ready', message: 'frontier ready' });
    logEventRunEvent({
      eventId: 'evt-1',
      runId: 'run-1',
      tag: 'collect.x.ok',
      message: 'x collection done',
      platform: 'x',
      data: { posts: 12 },
    });
    logEventRunEvent({ eventId: 'evt-2', runId: 'run-9', tag: 'run.done', message: 'unrelated event' });

    const events = await listEventRunEvents('evt-1');

    expect(events).toHaveLength(2);
    expect(events.map((event) => event.tag)).toEqual(['plan.ready', 'collect.x.ok']);
    expect(events[0].id).toBeTruthy();
    expect(events[0].eventId).toBe('evt-1');
    expect(events[0].level).toBe('info');
    expect(events[1].platform).toBe('x');
    expect(events[1].data).toEqual({ posts: 12 });
  });

  it('filters run events by runId', async () => {
    logEventRunEvent({ eventId: 'evt-3', runId: 'run-a', tag: 'run.done', message: 'first run' });
    logEventRunEvent({ eventId: 'evt-3', runId: 'run-b', tag: 'run.done', message: 'second run' });

    const onlyB = await listEventRunEvents('evt-3', { runId: 'run-b' });

    expect(onlyB.map((event) => event.message)).toEqual(['second run']);
  });

  it('honours the severity level and defaults to info', async () => {
    logEventRunEvent({ eventId: 'evt-4', runId: 'run-x', tag: 'collect.x.fail', level: 'error', message: 'x failed' });
    logEventRunEvent({ eventId: 'evt-4', runId: 'run-x', tag: 'collect.x.start', message: 'x started' });

    const events = await listEventRunEvents('evt-4');

    expect(events.find((event) => event.tag === 'collect.x.fail')?.level).toBe('error');
    expect(events.find((event) => event.tag === 'collect.x.start')?.level).toBe('info');
  });
});
