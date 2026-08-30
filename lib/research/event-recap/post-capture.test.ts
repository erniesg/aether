import { describe, expect, it } from 'vitest';
import {
  classifyCaptureAccess,
  resolveCaptureStatus,
  selectCaptureTargets,
} from './post-capture';
import type { EventPost } from './types';

describe('event post capture target selection', () => {
  it('selects a balanced X and LinkedIn sample while skipping irrelevant refs', () => {
    const targets = selectCaptureTargets({
      eventId: 'ai-engineer-singapore',
      posts: [
        post('x', 'https://x.com/high/status/1', 90),
        post('x', 'https://x.com/noise/status/2', 120, ['irrelevant:event']),
        post('x', 'https://x.com/low/status/3', 10),
        post('linkedin', 'https://www.linkedin.com/posts/high_1', 80),
        post('linkedin', 'https://www.linkedin.com/posts/low_2', 20),
      ],
      perPlatform: 1,
    });

    expect(targets.map((target) => target.url)).toEqual([
      'https://x.com/high/status/1',
      'https://www.linkedin.com/posts/high_1',
    ]);
  });

  it('keeps explicit URL order and infers supported platforms for unknown archive URLs', () => {
    const targets = selectCaptureTargets({
      eventId: 'ai-engineer-singapore',
      posts: [post('x', 'https://x.com/stored/status/1', 20)],
      urls: [
        'https://www.linkedin.com/posts/builder_activity-1',
        'https://x.com/stored/status/1?utm=ignored',
        'https://www.youtube.com/watch?v=ignored',
      ],
    });

    expect(targets.map((target) => [target.platform, target.url, target.postId])).toEqual([
      ['linkedin', 'https://www.linkedin.com/posts/builder_activity-1', undefined],
      ['x', 'https://x.com/stored/status/1', 'x-20'],
    ]);
  });

  it('can opt into every matching stored X and LinkedIn ref', () => {
    const targets = selectCaptureTargets({
      eventId: 'ai-engineer-singapore',
      posts: [
        post('x', 'https://x.com/a/status/1', 30),
        post('x', 'https://x.com/b/status/2', 20),
        post('linkedin', 'https://www.linkedin.com/posts/a_1', 10),
      ],
      all: true,
    });

    expect(targets).toHaveLength(3);
  });
});

describe('event post capture access classification', () => {
  it('marks LinkedIn auth walls as blocked', () => {
    expect(
      classifyCaptureAccess(
        'linkedin',
        'https://www.linkedin.com/login',
        'Sign in to LinkedIn Email or phone Password'
      )
    ).toMatchObject({ blockedReason: 'linkedin login wall' });
  });

  it('treats logged-out X chrome as a warning unless rendering failed', () => {
    expect(
      classifyCaptureAccess('x', 'https://x.com/builder/status/1', "Don’t miss what’s happening")
    ).toMatchObject({ warnings: ['X showed logged-out chrome; post card may still be visible.'] });
  });

  it('keeps a visible post capture usable when the page also reports a checkpoint', () => {
    const access = classifyCaptureAccess(
      'linkedin',
      'https://www.linkedin.com/posts/builder_activity-1',
      'Akilesh Jayakumar Over the weekend checkpoint'
    );

    expect(access).toMatchObject({ blockedReason: 'verification checkpoint' });
    expect(
      resolveCaptureStatus({
        hasPostElement: true,
        blockedReason: access.blockedReason,
      })
    ).toEqual({ status: 'captured' });
  });

  it('blocks access walls when no post card is visible', () => {
    expect(
      resolveCaptureStatus({
        hasPostElement: false,
        blockedReason: 'linkedin login wall',
      })
    ).toEqual({ status: 'blocked', blockedReason: 'linkedin login wall' });
  });
});

function post(platform: 'x' | 'linkedin', url: string, reachScore: number, tags: string[] = []): EventPost {
  return {
    postId: `${platform}-${reachScore}`,
    eventId: 'ai-engineer-singapore',
    runId: 'run-1',
    platform,
    url,
    authorName: 'Builder',
    text: 'AI Engineer Singapore reference',
    capturedAt: 1,
    updatedAt: 1,
    metrics: {},
    reachScore,
    tags,
    raw: {},
  };
}
