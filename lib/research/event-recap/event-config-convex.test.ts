import { afterEach, describe, expect, it } from 'vitest';
import { loadEventConfig, setConvexConfigSource, type EventConfig } from './event-config';
import aie2026Config from './fixtures/aie-2026.config';

afterEach(() => {
  // Clean up between tests so we never leak a mock Convex source into
  // other test files.
  setConvexConfigSource(undefined);
});

describe('event-config Convex source (slice 8)', () => {
  it('falls back to the in-process registry when no Convex source is set', async () => {
    setConvexConfigSource(undefined);
    const config = await loadEventConfig('aie-2026');
    expect(config?.eventId).toBe('aie-2026');
    expect(config?.stories.length).toBeGreaterThan(0);
  });

  it('honors a Convex-backed source when one is installed', async () => {
    const stub: EventConfig = {
      ...aie2026Config,
      eventId: 'aie-2026',
      name: 'Override from Convex',
    };
    setConvexConfigSource(async (eventId) => (eventId === 'aie-2026' ? stub : undefined));

    const config = await loadEventConfig('aie-2026');
    expect(config?.name).toBe('Override from Convex');
  });

  it('falls back to the registry when Convex returns undefined for the eventId', async () => {
    setConvexConfigSource(async () => undefined);
    const config = await loadEventConfig('aie-2026');
    expect(config?.name).toBe('AI Engineer Summit Singapore 2026'); // from fixture
  });

  it('returns undefined when neither Convex nor registry has the event', async () => {
    setConvexConfigSource(async () => undefined);
    const config = await loadEventConfig('event-that-doesnt-exist');
    expect(config).toBeUndefined();
  });
});
