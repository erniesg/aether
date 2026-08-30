import type Anthropic from '@anthropic-ai/sdk';
import type { AgentTool } from './types';

const tool: Anthropic.Messages.Tool = {
  name: 'refresh_event_recap',
  description:
    'Delta-refresh an event recap corpus. Uses stored posts as a seen set, then fills toward targetItemsPerPlatform without re-fetching already archived X, LinkedIn, or YouTube URLs. X can use official search or Apify; LinkedIn can use Apify post search for bulk media/metadata, TinyFish Search+Fetch for cheaper indexed URL fanout, or TinyFish browser-direct for time-limited logged-in checks; YouTube uses the configured Data API and keeps video/channel metadata plus thumbnails.',
  input_schema: {
    type: 'object',
    properties: {
      eventId: {
        type: 'string',
        description: 'Stored event recap id, e.g. "ai-engineer-singapore".',
      },
      targetItemsPerPlatform: {
        type: 'number',
        description:
          'Desired stored corpus size per platform. Existing posts are counted first; only the missing delta is collected. Max 1000.',
      },
      platforms: {
        type: 'array',
        items: { type: 'string', enum: ['x', 'linkedin', 'youtube'] },
        description: 'Optional platform subset. Defaults to X, LinkedIn, and YouTube.',
      },
      maxItemsPerPlatform: {
        type: 'number',
        description:
          'Fallback per-run collection budget when targetItemsPerPlatform is not set.',
      },
      maxQueries: {
        type: 'number',
        description: 'Maximum expansion source queries to use. Default comes from the event settings.',
      },
      extraQuerySet: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Creator-reviewed keywords, hashtags, account queries, or source-derived terms to merge into this refresh.',
      },
      sourceUrls: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Creator-reviewed source links used as auditable seed context for this refresh.',
      },
      maxSearchPagesPerQuery: {
        type: 'number',
        description:
          'LinkedIn Search+Fetch only: max TinyFish Search pages per query before fetching unseen URLs. Default 2; capped at 11 because TinyFish page indexes stop at 10.',
      },
      linkedinMode: {
        type: 'string',
        enum: ['search-fetch', 'browser-direct', 'apify'],
        description:
          'LinkedIn collection mode. apify uses HarvestAPI LinkedIn Post Search for bulk public posts, engagement metadata, comments/reactions when requested, and media URLs while skipping stored activity IDs; search-fetch is cheaper indexed URL fanout; browser-direct spends TinyFish Agent credits, uses Vault/profile, can follow warm_linkedin_session human handoff, and captures visible metadata/views/impressions only when LinkedIn renders them before the remote session expires.',
      },
      xProvider: {
        type: 'string',
        enum: ['official', 'apify'],
        description:
          'X collection provider. official uses the configured X API; apify uses the configured Apify X actor and normalizes likes/views/replies/media.',
      },
      apifyActorId: {
        type: 'string',
        description:
          'Optional Apify X actor id. Defaults to the Tweet Scraper V2 actor, 61RPP7dywgiy0JPD0.',
      },
      apifySort: {
        type: 'string',
        enum: ['Top', 'Latest', 'Latest + Top'],
        description: 'Apify X sort mode. Latest is cheaper/less overlapping; Latest + Top can increase recall but may duplicate.',
      },
      apifyCandidateMultiplier: {
        type: 'number',
        description:
          'Apify X over-collection multiplier before local dedupe. Default 1 for cost control; increase when seen-set overlap is high.',
      },
      linkedinApifyActorId: {
        type: 'string',
        description:
          'Optional Apify LinkedIn actor id. Defaults to harvestapi/linkedin-post-search.',
      },
      linkedinApifySortBy: {
        type: 'string',
        enum: ['date', 'relevance'],
        description: 'Apify LinkedIn sort mode. date is best for delta refresh; relevance can broaden older/high-match posts.',
      },
      linkedinApifyContentType: {
        type: 'string',
        enum: ['all', 'documents', 'images', 'videos', 'articles'],
        description: 'Optional LinkedIn post content filter for the Apify actor. Use all for recall; images/videos/documents can enrich media-heavy passes.',
      },
      linkedinApifyCandidateMultiplier: {
        type: 'number',
        description:
          'Apify LinkedIn over-collection multiplier before local dedupe/relevance filtering. Default 1 for cost control; increase when seen-set overlap is high.',
      },
      includeLinkedInComments: {
        type: 'boolean',
        description:
          'Apify LinkedIn only: when true, request visible post comments as conversation rows. Use small maxLinkedInCommentsPerPost values for cost control.',
      },
      maxLinkedInCommentsPerPost: {
        type: 'number',
        description: 'Apify LinkedIn only: maximum comments per post to request when includeLinkedInComments is true.',
      },
      includeLinkedInReactions: {
        type: 'boolean',
        description:
          'Apify LinkedIn only: when true, request sampled reaction identities in raw provenance. Aggregate reaction counts are captured without this where the actor returns them.',
      },
      maxLinkedInReactionsPerPost: {
        type: 'number',
        description: 'Apify LinkedIn only: maximum reaction identities per post to request when includeLinkedInReactions is true.',
      },
      includeMedia: {
        type: 'boolean',
        description:
          'When true, collect post-content media. X keeps attached media, YouTube keeps video thumbnails, LinkedIn Search+Fetch can only keep indexed feedshare images, and LinkedIn browser-direct performs a richer logged-in post-card media pass while excluding page chrome/profile/cover assets.',
      },
      includeYouTubeComments: {
        type: 'boolean',
        description:
          'Defaults true. When true, collect YouTube top-level comments and API-visible live chat messages as conversation rows for clustering and sentiment.',
      },
      maxYouTubeCommentVideos: {
        type: 'number',
        description:
          'Maximum fetched YouTube videos to enrich with comments/live chat. Default 25; cap 50 to control API quota.',
      },
      maxYouTubeCommentsPerVideo: {
        type: 'number',
        description: 'Maximum top-level YouTube comments per enriched video. Default 10; cap 100.',
      },
      maxYouTubeLiveChatMessagesPerVideo: {
        type: 'number',
        description:
          'Maximum API-visible live chat messages per YouTube livestream video. Default 25; archived replay chat may require a separate browser/TinyFish pass if YouTube does not expose activeLiveChatId.',
      },
      seenPostUrls: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Optional additional seen URLs to skip before expensive collection, useful for URLs already fetched and rejected as irrelevant/noise.',
      },
      dedupeAgainstExisting: {
        type: 'boolean',
        description: 'Defaults true. When true, skips already stored post URLs/ids before expensive fetches.',
      },
      liveMode: {
        type: 'string',
        enum: ['tinyfish', 'mock'],
        description: 'Execution mode. Use tinyfish for live collection.',
      },
      monthlyCreditBudget: {
        type: 'number',
        description: 'Optional budget guard; refresh is skipped if estimated live cost would exceed it.',
      },
    },
    required: ['eventId'],
  } as unknown as Anthropic.Messages.Tool['input_schema'],
};

export const refreshEventRecap: AgentTool = {
  tool,
  dispatch: {
    registryId: 'event-recap-refresh',
    path: '/api/events/refresh',
    provider: 'event-recap-providers',
    model: 'event-recap-delta-refresh',
    toBody: (input) => input,
  },
  summarizeOutput: (output) => {
    if (!output || typeof output !== 'object') return JSON.stringify(output ?? null);
    const o = output as Record<string, unknown>;
    const bundle = o.bundle && typeof o.bundle === 'object' ? (o.bundle as Record<string, unknown>) : {};
    const event = bundle.event && typeof bundle.event === 'object' ? (bundle.event as Record<string, unknown>) : {};
    const posts = Array.isArray(bundle.posts) ? (bundle.posts as Array<Record<string, unknown>>) : [];
    const runs = Array.isArray(bundle.runs) ? (bundle.runs as Array<Record<string, unknown>>) : [];
    const latestRun = runs[0] ?? {};
    const byPlatform = posts.reduce<Record<string, number>>((acc, post) => {
      const platform = typeof post.platform === 'string' ? post.platform : 'unknown';
      acc[platform] = (acc[platform] ?? 0) + 1;
      return acc;
    }, {});
    return JSON.stringify({
      ok: o.ok,
      eventId: event.eventId,
      status: event.status,
      posts: posts.length,
      byPlatform,
      latestRun: {
        runId: latestRun.runId,
        status: latestRun.status,
        outputs: latestRun.outputs,
        warnings: latestRun.warnings,
      },
    });
  },
};
