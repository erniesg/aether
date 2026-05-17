import { describe, expect, it } from 'vitest';
import { buildXQueryPlan, recentSearchWindow } from './x-api';

describe('X event recap query planning', () => {
  it('fans expansion anchors out into individual X queries', () => {
    const plan = buildXQueryPlan([
      'AI Engineer Summit Singapore',
      '@aiDotEngineer Singapore',
      '@SherryYanJiang Singapore',
      '#aiengineer Singapore',
    ]);

    expect(plan.map((item) => item.source)).toEqual([
      'AI Engineer Summit Singapore',
      '@aiDotEngineer Singapore',
      '@SherryYanJiang Singapore',
      '#aiengineer Singapore',
    ]);
    expect(plan.map((item) => item.query)).toEqual([
      '"AI Engineer Summit Singapore" -is:retweet',
      '(@aiDotEngineer OR from:aiDotEngineer) (Singapore OR "AI Engineer") -is:retweet',
      '(@SherryYanJiang OR from:SherryYanJiang) (Singapore OR "AI Engineer") -is:retweet',
      '#aiengineer Singapore -is:retweet',
    ]);
  });

  it('clips recent search windows to the official 7-day window', () => {
    const now = new Date('2026-05-18T00:00:00.000Z');
    const window = recentSearchWindow(
      '2026-04-01T00:00:00.000Z',
      '2026-05-20T00:00:00.000Z',
      now
    );

    expect(window.startTime).toBe('2026-05-11T02:24:00.000Z');
    expect(window.endTime).toBe('2026-05-17T23:59:30.000Z');
  });
});
