import { describe, expect, it } from 'vitest';
import { DEMO_CREATOR_CONTEXT } from '@/lib/context/model';
import {
  planResearch,
  recordFromResearchTarget,
} from './research';

describe('research planner', () => {
  it('decomposes creator seeds into URLs, hashtags, accounts, and platform targets', () => {
    const plan = planResearch({
      context: DEMO_CREATOR_CONTEXT,
      seedText:
        'slow morning shelf, #barrierglow, @solsticestudio https://www.pinterest.com/pin/123/',
      platforms: ['pinterest', 'tiktok'],
      limit: 8,
    });

    expect(plan.targets.some((target) => target.kind === 'url')).toBe(true);
    expect(
      plan.targets.some(
        (target) => target.kind === 'hashtag' && target.value === 'barrierglow'
      )
    ).toBe(true);
    expect(
      plan.targets.some(
        (target) => target.kind === 'account' && target.value === 'solsticestudio'
      )
    ).toBe(true);
    expect(plan.targets.some((target) => target.platform === 'tiktok')).toBe(true);
  });

  it('materializes non-URL targets as research artifacts with provenance', () => {
    const plan = planResearch({
      seedText: '#warmritual',
      platforms: ['pinterest'],
      limit: 1,
    });
    const record = recordFromResearchTarget(
      plan.targets[0]!,
      0,
      '2026-04-25T00:00:00.000Z'
    );

    expect(record.kind).toBe('image');
    expect(record.attribution.source).toBe('pinterest');
    expect(record.fullUrl).toContain('pinterest.com');
    expect(record.tags).toContain('research');
    expect(record.notes).toContain('hashtag warmritual');
  });
});
