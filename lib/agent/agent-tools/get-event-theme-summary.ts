import type Anthropic from '@anthropic-ai/sdk';
import type { AgentTool } from './types';

const tool: Anthropic.Messages.Tool = {
  name: 'get_event_theme_summary',
  description:
    'Read unsupervised topic clusters for a stored event recap. Returns cluster labels, summaries, keywords, and cited sample posts.',
  input_schema: {
    type: 'object',
    properties: {
      eventId: {
        type: 'string',
        description: 'Event recap id, e.g. "ai-engineer-summit-singapore".',
      },
    },
    required: ['eventId'],
  } as unknown as Anthropic.Messages.Tool['input_schema'],
};

export const getEventThemeSummary: AgentTool = {
  tool,
  dispatch: {
    registryId: 'event-theme-summary',
    path: '/api/events/themes',
    provider: 'convex',
    model: 'event-recap-clusters',
    toBody: (input) => {
      const i = input as { eventId: string };
      return { eventId: i.eventId };
    },
  },
  summarizeOutput: (output) => {
    if (!output || typeof output !== 'object') return JSON.stringify(output ?? null);
    const o = output as Record<string, unknown>;
    const themes = Array.isArray(o.themes) ? (o.themes as Array<Record<string, unknown>>) : [];
    return JSON.stringify({
      ok: o.ok,
      themes: themes.slice(0, 8).map((theme) => ({
        themeId: theme.themeId,
        label: theme.label,
        summary: theme.summary,
        keywords: theme.keywords,
        score: theme.score,
        posts: Array.isArray(theme.posts)
          ? (theme.posts as Array<Record<string, unknown>>).slice(0, 4).map((post) => ({
              postId: post.postId,
              platform: post.platform,
              author: post.authorHandle ?? post.authorName,
              url: post.url,
              text: post.text,
            }))
          : [],
      })),
    });
  },
};
