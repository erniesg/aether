import { describe, expect, it } from 'vitest';
import {
  buildPresenceLedgerRollup,
  joinMetricsToPostedDrafts,
  type PresencePostMetric,
} from './presence-metrics';

describe('presence metrics ledger', () => {
  it('tags matched posted-draft permalinks and leaves unmatched rows untagged', () => {
    const rows = joinMetricsToPostedDrafts(
      [
        metric('https://x.com/aether/status/100', 12, 3, 1),
        metric('https://x.com/aether/status/101', 5, 1, 9),
        metric('https://x.com/aether/status/102', 30, 8, 2),
      ],
      [
        {
          profileId: 'profile_personal',
          receiptUrl: 'https://twitter.com/aether/status/100?s=20',
          pillar: 'agent harnesses',
        },
        {
          profileId: 'profile_personal',
          receiptUrl: 'https://x.com/aether/status/102',
          pillar: 'launch receipts',
        },
      ]
    );

    expect(rows.map((row) => [row.postUrl, row.pillar])).toEqual([
      ['https://x.com/aether/status/100', 'agent harnesses'],
      ['https://x.com/aether/status/101', 'untagged'],
      ['https://x.com/aether/status/102', 'launch receipts'],
    ]);
  });

  it('builds deterministic per-pillar rollups with median engagement', () => {
    const rollup = buildPresenceLedgerRollup([
      metric('https://x.com/aether/status/100', 12, 3, 1, 'agent harnesses'),
      metric('https://x.com/aether/status/101', 5, 1, 9, 'untagged'),
      metric('https://x.com/aether/status/102', 30, 8, 2, 'agent harnesses'),
      metric('https://x.com/aether/status/103', 2, 0, 0, 'launch receipts'),
    ]);

    expect(rollup).toMatchInlineSnapshot(`
      [
        {
          "medianEngagement": 28,
          "pillar": "agent harnesses",
          "posts": 2,
        },
        {
          "medianEngagement": 15,
          "pillar": "untagged",
          "posts": 1,
        },
        {
          "medianEngagement": 2,
          "pillar": "launch receipts",
          "posts": 1,
        },
      ]
    `);
  });
});

function metric(
  postUrl: string,
  likes: number,
  reposts: number,
  replies: number,
  pillar?: string
): PresencePostMetric {
  return {
    profileId: 'profile_personal',
    postUrl,
    capturedAt: '2026-06-11T00:00:00.000Z',
    likes,
    reposts,
    replies,
    impressions: 1000,
    ...(pillar ? { pillar } : {}),
  };
}
