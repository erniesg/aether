import { describe, expect, it } from 'vitest';
import { deriveExpansionPlan } from './expand';
import type { EventPost } from './types';
import { loadEventConfig } from './event-config';

const basePost = (overrides: Partial<EventPost> = {}): EventPost => ({
  postId: 'p1',
  eventId: 'aie-2026',
  runId: 'r1',
  platform: 'x',
  url: 'https://x.com/test/status/1',
  authorName: 'Test Author',
  authorHandle: 'tester',
  text: '',
  capturedAt: Date.now(),
  updatedAt: Date.now(),
  metrics: { likes: 10, reposts: 1, replies: 0, views: 500 },
  reachScore: 0.1,
  tags: [],
  raw: {},
  ...overrides,
});

describe('expand — parameterization (slice 3)', () => {
  it('honors custom corpusPhraseRules when explicitly passed', () => {
    const posts = [
      basePost({ postId: 'p1', text: 'The pineapple express delivered today.' }),
      basePost({ postId: 'p2', text: 'No specific phrase to anchor on.' }),
      basePost({ postId: 'p3', text: 'Another pineapple express sighting.' }),
    ];

    const plan = deriveExpansionPlan('Generic Event', posts, {
      corpusPhraseRules: [{ value: 'Pineapple Express', pattern: /\bpineapple express\b/i }],
      singleTokenEntityAllowlist: [],
    });

    const phraseAnchor = plan.anchors.find((a) => a.kind === 'query' && a.value === 'Pineapple Express');
    expect(phraseAnchor).toBeDefined();
    expect(phraseAnchor?.count).toBeGreaterThanOrEqual(2);
  });

  it('honors custom singleTokenEntityAllowlist when explicitly passed', () => {
    const posts = [
      basePost({ postId: 'p1', text: 'Pixel demo was great at the conference.' }),
      basePost({ postId: 'p2', text: 'Loved the Pixel keynote.' }),
    ];

    const plan = deriveExpansionPlan('Generic Event', posts, {
      corpusPhraseRules: [],
      singleTokenEntityAllowlist: ['Pixel'],
    });

    const pixelEntity = plan.anchors.find((a) => a.kind === 'entity' && a.value === 'Pixel');
    expect(pixelEntity).toBeDefined();
  });

  it('does not mine AIE-specific phrases when corpusPhraseRules is empty', () => {
    const posts = [
      basePost({ postId: 'p1', text: 'Met someone at the Pullman happy hour and saw NanoClaw demo.' }),
    ];

    const plan = deriveExpansionPlan('Generic Event', posts, {
      corpusPhraseRules: [],
      singleTokenEntityAllowlist: [],
    });

    expect(plan.anchors.find((a) => a.value === 'Pullman')).toBeUndefined();
    expect(plan.anchors.find((a) => a.value === 'NanoClaw')).toBeUndefined();
  });

  it('exposes the AIE 2026 corpus phrases via the event-config loader', async () => {
    const config = await loadEventConfig('aie-2026');
    expect(config).toBeDefined();
    expect(config?.corpusPhraseRules.length).toBeGreaterThan(0);
    expect(config?.corpusPhraseRules.some((r) => r.value === 'NanoClaw')).toBe(true);
    expect(config?.corpusPhraseRules.some((r) => r.value === 'Pullman')).toBe(true);
    expect(config?.singleTokenEntityAllowlist).toContain('NanoClaw');
    expect(config?.singleTokenEntityAllowlist).toContain('AIE');
  });

  it('uses AIE 2026 rules by default (backwards compat)', () => {
    const posts = [
      basePost({ postId: 'p1', text: 'NanoClaw was the highlight of the AI Engineer Singapore weekend.' }),
      basePost({ postId: 'p2', text: 'Met everyone at the Pullman happy hour after.' }),
    ];

    const plan = deriveExpansionPlan('AI Engineer Singapore', posts);

    expect(plan.anchors.find((a) => a.value === 'NanoClaw')).toBeDefined();
    expect(plan.anchors.find((a) => a.value === 'Pullman')).toBeDefined();
  });
});
