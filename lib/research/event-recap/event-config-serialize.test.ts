import { describe, expect, it } from 'vitest';
import { serializeEventConfig, deserializeEventConfig } from './event-config-serialize';
import aie2026Config from './fixtures/aie-2026.config';

describe('event-config serialization (slice 8)', () => {
  it('round-trips the AIE 2026 fixture without losing regex behavior', () => {
    const serialized = serializeEventConfig(aie2026Config);
    const rehydrated = deserializeEventConfig(serialized);

    expect(rehydrated.eventId).toBe(aie2026Config.eventId);
    expect(rehydrated.name).toBe(aie2026Config.name);
    expect(rehydrated.stories.length).toBe(aie2026Config.stories.length);

    // Verify regex behavior survived: test one of the keynote signals.
    const vivianStory = rehydrated.stories.find((s) => s.storyId === 'vivian-builder-keynote');
    expect(vivianStory).toBeDefined();
    const briefedOnSignal = vivianStory?.signals.find((s) => s.weight === 5);
    expect(briefedOnSignal?.pattern.test('the briefed on line really lands')).toBe(true);
    expect(briefedOnSignal?.pattern.test('nothing of note here')).toBe(false);
  });

  it('preserves primaryStoryOverrides including sub-pattern routing', () => {
    const serialized = serializeEventConfig(aie2026Config);
    const rehydrated = deserializeEventConfig(serialized);

    const sponsorOverride = rehydrated.primaryStoryOverrides.find(
      (o) => o.storyId === 'sponsors-booths-hiring' && o.subPattern
    );
    expect(sponsorOverride).toBeDefined();
    expect(sponsorOverride?.pattern.test('diamond sponsor announcement today')).toBe(true);
    expect(sponsorOverride?.subPattern?.test('openai codex booth')).toBe(true);
    expect(sponsorOverride?.subStoryId).toBe('openai-codex-presence');
  });

  it('preserves corpusPhraseRules', () => {
    const serialized = serializeEventConfig(aie2026Config);
    const rehydrated = deserializeEventConfig(serialized);

    const nanoclawRule = rehydrated.corpusPhraseRules.find((r) => r.value === 'NanoClaw');
    expect(nanoclawRule).toBeDefined();
    expect(nanoclawRule?.pattern.test('saw the nanoclaw demo today')).toBe(true);
  });

  it('preserves atlasLanes with their matchers', () => {
    const serialized = serializeEventConfig(aie2026Config);
    const rehydrated = deserializeEventConfig(serialized);

    expect(rehydrated.atlasLanes.length).toBe(4);
    const keynote = rehydrated.atlasLanes.find((l) => l.id === 'keynote');
    expect(keynote?.matcher).toBeInstanceOf(RegExp);
    expect(keynote?.matcher?.test('vivian keynote')).toBe(true);
  });

  it('preserves incidentalMentionPatterns', () => {
    const serialized = serializeEventConfig(aie2026Config);
    const rehydrated = deserializeEventConfig(serialized);

    expect(rehydrated.incidentalMentionPatterns).toBeDefined();
    expect(rehydrated.incidentalMentionPatterns?.exactMentions).toBeInstanceOf(RegExp);
    expect(rehydrated.incidentalMentionPatterns?.specificEventSignal).toBeInstanceOf(RegExp);
    expect(rehydrated.incidentalMentionPatterns?.minLength).toBe(900);
  });

  it('serialized form is pure JSON (no RegExp instances)', () => {
    const serialized = serializeEventConfig(aie2026Config);
    // JSON.stringify should not throw and the result should round-trip via JSON.parse.
    const json = JSON.stringify(serialized);
    expect(typeof json).toBe('string');
    expect(json).toContain('aie-2026');
    expect(json).not.toContain('RegExp');

    // Round-trip through JSON itself to verify nothing fancy snuck through.
    const reparsed = JSON.parse(json);
    expect(reparsed.eventId).toBe('aie-2026');
    expect(typeof reparsed.stories[0].signals[0].patternSource).toBe('string');
  });

  it('captures pattern flags so the rehydrated regex matches the original', () => {
    const serialized = serializeEventConfig(aie2026Config);
    const rehydrated = deserializeEventConfig(serialized);

    // All AIE 2026 story signals are case-insensitive (/i flag) — verify that survived.
    for (const story of rehydrated.stories) {
      for (const signal of story.signals) {
        expect(signal.pattern.flags).toContain('i');
      }
    }
  });
});
