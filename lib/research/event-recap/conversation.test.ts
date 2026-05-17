import { describe, expect, it } from 'vitest';
import { classifyConversationPost, enrichPostConversationTags } from './conversation';
import type { EventPost } from './types';

function sample(text: string, tags: string[] = []) {
  return { text, tags };
}

describe('event recap conversation classification', () => {
  it('separates attendee sentiment from announcements', () => {
    expect(
      classifyConversationPost(sample('I loved the practical evals discussion at AI Engineer Singapore.'))
    ).toMatchObject({ intent: 'sentiment', sentiment: 'positive' });

    expect(
      classifyConversationPost(sample('Join us at AI Engineer Singapore for a keynote and panel. Register now.'))
    ).toMatchObject({ intent: 'announcement', sentiment: 'neutral' });
  });

  it('tags stored posts with intent and sentiment', () => {
    const post = {
      postId: 'x1',
      eventId: 'event',
      runId: 'run',
      platform: 'x',
      url: 'https://x.com/a/status/1',
      authorName: 'A',
      text: 'Curious why everyone at AI Engineer Singapore is talking about evals?',
      capturedAt: Date.now(),
      metrics: {},
      reachScore: 0,
      tags: ['x-api'],
      raw: {},
    } satisfies EventPost;

    expect(enrichPostConversationTags(post).tags).toEqual(
      expect.arrayContaining(['x-api', 'intent:question', 'sentiment:neutral', 'conversation'])
    );
  });
});
