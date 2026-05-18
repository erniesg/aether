import type Anthropic from '@anthropic-ai/sdk';
import type { AgentTool } from './types';

const tool: Anthropic.Messages.Tool = {
  name: 'query_event_posts',
  description:
    'Search a stored event recap corpus across X, LinkedIn, and YouTube posts/videos. Returns cited posts with URLs, authors, media, metrics, and reach score.',
  input_schema: {
    type: 'object',
    properties: {
      eventId: {
        type: 'string',
        description: 'Event recap id, e.g. "ai-engineer-summit-singapore".',
      },
      query: {
        type: 'string',
        description: 'Search text, topic, author, hashtag, or keyword.',
      },
      platform: {
        type: 'string',
        enum: ['x', 'linkedin', 'youtube'],
        description: 'Optional platform filter.',
      },
      limit: {
        type: 'number',
        description: 'Maximum posts to return. Default 12.',
      },
    },
    required: ['eventId'],
  } as unknown as Anthropic.Messages.Tool['input_schema'],
};

export const queryEventPosts: AgentTool = {
  tool,
  dispatch: {
    registryId: 'event-posts-query',
    path: '/api/events/query',
    provider: 'convex',
    model: 'event-recap-corpus',
    toBody: (input) => {
      const i = input as {
        eventId: string;
        query?: string;
        platform?: string;
        limit?: number;
      };
      return {
        eventId: i.eventId,
        query: i.query ?? '',
        platform: i.platform,
        limit: i.limit ?? 12,
      };
    },
  },
  summarizeOutput: (output) => {
    if (!output || typeof output !== 'object') return JSON.stringify(output ?? null);
    const o = output as Record<string, unknown>;
    const posts = Array.isArray(o.posts) ? (o.posts as Array<Record<string, unknown>>) : [];
    return JSON.stringify({
      ok: o.ok,
      count: o.count,
      posts: posts.slice(0, 10).map((post) => ({
        postId: post.postId,
        platform: post.platform,
        author: post.authorHandle ?? post.authorName,
        authorMeta: post.authorMeta,
        url: post.url,
        text: post.text,
        capturedAt: post.capturedAt,
        updatedAt: post.updatedAt,
        metrics: post.metrics,
        media: post.media,
        reachScore: post.reachScore,
      })),
    });
  },
};
