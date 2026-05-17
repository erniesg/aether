import { describe, expect, it } from 'vitest';
import { deriveSeedFrontier } from './frontier';

describe('event recap seed frontier', () => {
  it('generates biased but useful initial queries before a corpus exists', () => {
    const plan = deriveSeedFrontier({
      eventName: 'AI Engineer Summit Singapore',
      contextHint: 'agentic AI, evals, production workflows',
      officialUrl: 'https://ai.engineer/singapore',
    });

    expect(plan.querySet).toEqual(
      expect.arrayContaining([
        '@aiDotEngineer Singapore',
        'AI Engineer Summit Singapore',
        '"AI Engineer Summit Singapore"',
        '"AI engineer" Singapore',
      ])
    );
    expect(plan.anchors.find((anchor) => anchor.value === '@aiDotEngineer')).toMatchObject({
      sourceKind: 'official-schedule',
      bias: expect.stringContaining('organizer-biased'),
    });
  });
});
