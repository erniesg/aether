import { describe, expect, it } from 'vitest';
import { normalizeTinyFishPosts } from './tinyfish';

describe('TinyFish event recap normalization', () => {
  it('keeps LinkedIn post metadata and flattens substantive comments', () => {
    const posts = normalizeTinyFishPosts('linkedin', {
      posts: [
        {
          url: 'https://www.linkedin.com/posts/example_1',
          author_name: 'Builder',
          author_handle: 'builder',
          author_headline: 'AI engineer',
          author_followers: 1200,
          text: 'My practical takeaway from AI Engineer Singapore was that evals need owners.',
          reactions: 12,
          comments: 2,
          comments_list: [
            {
              author_name: 'Attendee',
              author_headline: 'Founder',
              text: 'I had the same reaction, the evals talk was the most useful session.',
              reactions: 3,
            },
          ],
        },
      ],
    });

    expect(posts).toHaveLength(2);
    expect(posts[0]).toMatchObject({
      authorMeta: { headline: 'AI engineer', followers: 1200 },
      metrics: { reactions: 12, comments: 2 },
    });
    expect(posts[1]).toMatchObject({
      authorName: 'Attendee',
      authorMeta: { headline: 'Founder' },
      tags: expect.arrayContaining(['linkedin-comment', 'comment', 'conversation']),
    });
  });
});
