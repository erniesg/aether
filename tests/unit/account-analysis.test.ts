import { describe, expect, it } from 'vitest';
import {
  buildReferenceAccountDigest,
  classifyReferencePost,
  median,
  topQuartileHours,
  type ReferenceAccountPost,
} from '@/lib/research/account-analysis';

const posts: ReferenceAccountPost[] = [
  post('https://x.com/a/status/1', 'I shipped 12 agent runs overnight. The surprise was credentials.', '2026-06-01T02:00:00Z', 20, 4, 2),
  post('https://x.com/a/status/2', 'How do you evaluate agent reliability without staging data?', '2026-06-01T03:00:00Z', 12, 2, 8),
  post('https://x.com/a/status/3', '42% fewer flaky runs after tightening one tool schema.', '2026-06-01T04:00:00Z', 40, 8, 4),
  post('https://x.com/a/status/4', 'New writeup: https://example.com/agent-harness', '2026-06-01T05:00:00Z', 5, 1, 0),
  post('https://x.com/b/status/5', '1/ We rebuilt the eval harness around receipts.', '2026-06-01T06:00:00Z', 25, 5, 3),
  post('https://x.com/b/status/6', 'We learned this the hard way after a launch failed twice.', '2026-06-01T07:00:00Z', 14, 3, 2),
  post('https://x.com/b/status/7', 'A good agent harness is just a written definition of done.', '2026-06-01T08:00:00Z', 30, 6, 1),
  post('https://x.com/b/status/8', 'Should agents get their own machines?', '2026-06-01T09:00:00Z', 18, 2, 9),
  post('https://x.com/c/status/9', 'Demo video: agent creates a draft and asks for review.', '2026-06-01T10:00:00Z', 50, 10, 3, true),
  post('https://x.com/c/status/10', '7 mistakes I made moving from toy agents to production agents.', '2026-06-01T11:00:00Z', 38, 9, 5),
  post('https://x.com/c/status/11', 'We cut eval runtime from 18m to 6m by caching fixtures.', '2026-06-01T12:00:00Z', 45, 12, 2),
  post('https://x.com/c/status/12', 'The bottleneck was never the model. It was permissions.', '2026-06-01T13:00:00Z', 60, 14, 4),
];

describe('account analysis', () => {
  it('classifies 12 fixture posts deterministically', () => {
    expect(posts.map(classifyReferencePost)).toEqual([
      { format: 'single', hookShape: 'number-led', lengthBucket: 'medium', postingHourUtc: 2 },
      { format: 'single', hookShape: 'question', lengthBucket: 'short', postingHourUtc: 3 },
      { format: 'single', hookShape: 'number-led', lengthBucket: 'short', postingHourUtc: 4 },
      { format: 'link', hookShape: 'claim', lengthBucket: 'short', postingHourUtc: 5 },
      { format: 'thread', hookShape: 'number-led', lengthBucket: 'short', postingHourUtc: 6 },
      { format: 'single', hookShape: 'story', lengthBucket: 'short', postingHourUtc: 7 },
      { format: 'single', hookShape: 'claim', lengthBucket: 'short', postingHourUtc: 8 },
      { format: 'single', hookShape: 'question', lengthBucket: 'short', postingHourUtc: 9 },
      { format: 'media', hookShape: 'claim', lengthBucket: 'short', postingHourUtc: 10 },
      { format: 'single', hookShape: 'number-led', lengthBucket: 'medium', postingHourUtc: 11 },
      { format: 'single', hookShape: 'number-led', lengthBucket: 'short', postingHourUtc: 12 },
      { format: 'single', hookShape: 'claim', lengthBucket: 'short', postingHourUtc: 13 },
    ]);
  });

  it('computes median and top-quartile hours with hand-checked values', () => {
    expect(median([1, 5, 9, 20])).toBe(7);
    expect(topQuartileHours(posts)).toEqual([10, 12, 13]);
  });

  it('builds a snapshot-stable what-works digest', () => {
    expect(buildReferenceAccountDigest(posts)).toMatchInlineSnapshot(`
      {
        "exemplarPostUrls": [
          "https://x.com/c/status/12",
          "https://x.com/c/status/9",
          "https://x.com/c/status/11",
          "https://x.com/c/status/10",
          "https://x.com/a/status/3",
        ],
        "medianEngagementByFormat": {
          "link": 6,
          "media": 63,
          "single": 37,
          "thread": 33,
        },
        "medianEngagementByHook": {
          "claim": 50,
          "number-led": 52,
          "question": 25.5,
          "story": 19,
        },
        "medianEngagementByLength": {
          "medium": 39,
          "short": 35,
        },
        "postCount": 12,
        "topQuartilePostingHoursUtc": [
          10,
          12,
          13,
        ],
      }
    `);
  });
});

function post(
  postUrl: string,
  text: string,
  postedAt: string,
  likes: number,
  reposts: number,
  replies: number,
  hasMedia = false
): ReferenceAccountPost {
  return {
    handle: '@ref',
    postUrl,
    text,
    postedAt,
    capturedAt: '2026-06-02T00:00:00Z',
    hasMedia,
    metrics: { likes, reposts, replies },
  };
}
