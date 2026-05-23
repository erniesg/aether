import { describe, expect, it } from 'vitest';
import { loadEventConfig, type EventConfig } from './event-config';

describe('event config loader', () => {
  it('returns a typed config for a known eventId (aie-2026)', async () => {
    const config = await loadEventConfig('aie-2026');
    expect(config).toBeDefined();
    expect(config?.eventId).toBe('aie-2026');
    expect(config?.name).toBe('AI Engineer Summit Singapore 2026');

    // Skeleton fields are present and typed correctly, even if not yet populated.
    // Subsequent slices fill these with the real AIE 2026 data.
    expect(Array.isArray(config?.stories)).toBe(true);
    expect(Array.isArray(config?.corpusPhraseRules)).toBe(true);
    expect(Array.isArray(config?.atlasLanes)).toBe(true);
    expect(typeof config?.curatedThemeCopy).toBe('object');
    expect(typeof config?.smallStoryMergeTargets).toBe('object');
    expect(['auto', 'hitl']).toContain(config?.recapMode);
  });

  it('returns undefined for unknown eventId', async () => {
    const config = await loadEventConfig('unknown-event-2099');
    expect(config).toBeUndefined();
  });

  it('the type shape preserves StoryDefinition compatibility with story-assignment.ts', () => {
    // Type-level assertion — this compiles only if EventConfig.stories[number] is
    // structurally assignable to the StoryDefinition shape consumed by
    // buildStoryAssignedThemes. Slice 2 will swap the consumer to read from here.
    const sample: EventConfig['stories'][number] = {
      storyId: 'sample',
      label: 'Sample',
      summary: 'Sample story.',
      keywords: ['sample'],
      signals: [{ pattern: /sample/i, weight: 3 }],
    };
    expect(sample.signals[0].pattern.test('sample text')).toBe(true);
  });
});
