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

  it('prioritizes headline official speakers even when the schedule does not tag them as keynote', () => {
    const plan = deriveSeedFrontier({
      eventName: 'AI Engineer Singapore',
      sessions: [
        {
          title: "Building a 'Second Brain': Opportunities, Risks, and Implications",
          topics: ['leadership', 'software'],
          speakers: [
            {
              name: 'Dr Vivian Balakrishnan',
              company: 'Ministry of Foreign Affairs, Singapore',
              title: 'Minister for Foreign Affairs',
            },
          ],
        },
        {
          title: "NanoClaw's agent factory",
          topics: ['keynote'],
          speakers: [{ name: 'Gavriel Cohen', company: 'NanoCo' }],
        },
        {
          title: 'Simulation, Games, and the Future of Robotics',
          topics: ['main stage', 'robotics'],
          speakers: [{ name: 'Gokul Srinivasan', company: 'Antim Labs', title: 'Co-founder & President' }],
        },
      ],
      maxQueries: 12,
    });

    expect(plan.querySet.indexOf('"Dr Vivian Balakrishnan" "AI Engineer Singapore"')).toBeGreaterThanOrEqual(0);
    expect(plan.querySet.indexOf('"Dr Vivian Balakrishnan" "AI Engineer Singapore"')).toBeLessThan(
      plan.querySet.indexOf('"AI engineer" Singapore')
    );
    expect(plan.querySet).toEqual(
      expect.arrayContaining(['"Building a \'Second Brain\'" "AI Engineer Singapore"'])
    );
    expect(plan.anchors.find((anchor) => anchor.value === 'Dr Vivian Balakrishnan')).toMatchObject({
      bias: expect.stringContaining('headline-speaker-biased'),
    });
    expect(plan.anchors.find((anchor) => anchor.value === 'Gokul Srinivasan')).toMatchObject({
      bias: expect.stringContaining('speaker-biased'),
    });
  });
});
