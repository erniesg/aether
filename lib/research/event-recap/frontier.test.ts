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

  it('fans out official keynote speaker names into reusable search anchors', () => {
    const plan = deriveSeedFrontier({
      eventName: 'AI Engineer Singapore',
      officialUrl: 'https://ai.engineer/singapore',
      speakers: [
        {
          name: 'Gavriel Cohen',
          company: 'NanoCo, creators of NanoClaw',
          role: 'keynote',
          sessionTitle: "NanoClaw's agent factory",
        },
        {
          name: 'Ryo Lu',
          company: 'Cursor',
          role: 'keynote',
          sessionTitle: 'Designing the Next Cursor',
        },
      ],
      maxQueries: 12,
    });

    expect(plan.querySet).toEqual(
      expect.arrayContaining([
        '"Gavriel Cohen" "AI Engineer Singapore"',
        '"Ryo Lu" "AI Engineer Singapore"',
      ])
    );
    expect(plan.anchors.find((anchor) => anchor.value === 'Gavriel Cohen')).toMatchObject({
      sourceKind: 'official-schedule',
      bias: expect.stringContaining('keynote-speaker-biased'),
    });
  });
});
