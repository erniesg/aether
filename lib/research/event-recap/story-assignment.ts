import type { EventPost, EventPostStoryType, EventStoryMention, EventTheme } from './types';
import { engagement, shortExcerpt } from './utils';

type StorySignal = {
  pattern: RegExp;
  weight: number;
};

type StoryDefinition = {
  storyId: string;
  label: string;
  summary: string;
  keywords: string[];
  signals: StorySignal[];
};

export type StoryAssignmentResult = {
  posts: EventPost[];
  themes: EventTheme[];
  stats: {
    totalRefs: number;
    rootRefs: number;
    attachedRefs: number;
    multiMentionRefs: number;
    broadRecapRefs: number;
  };
};

const STORY_DEFINITIONS: StoryDefinition[] = [
  {
    storyId: 'vivian-builder-keynote',
    label: "Vivian Balakrishnan's builder keynote",
    summary:
      'Foreign Minister Vivian Balakrishnan was the dominant travelled story: Raspberry Pi, NanoClaw, WhatsApp, second-brain workflows, and the line about not governing technology you have only been briefed on.',
    keywords: ['vivian balakrishnan', 'nanoclaw', 'raspberry pi', 'second brain', 'briefed on'],
    signals: [
      { pattern: /\b(vivian|vivianbala|balakrishnan|foreign minister|minister for foreign affairs|cabinet minister)\b/i, weight: 4 },
      { pattern: /\b(nanoclaw|nano claw|raspberry pi|raspberry|second brain|personal ai|personal agent|whatsapp|sqlite|graph memory)\b/i, weight: 4 },
      { pattern: /\b(briefed on|govern a technology|outsource memory|outsource computation|learn by doing)\b/i, weight: 5 },
      { pattern: /\b(keynote|minister'?s keynote|diplomat'?s second brain)\b/i, weight: 3 },
    ],
  },
  {
    storyId: 'overall-event-recaps',
    label: 'Full-event recaps and takeaways',
    summary:
      'Broad attendee recaps pulled multiple signals together: keynote, workshops, sponsor booths, side events, hallway energy, and the sense that Singapore had a real builder room.',
    keywords: ['recaps', 'takeaways', 'highlights', 'buzzing', 'conference format'],
    signals: [
      { pattern: /\b(recap|takeaways?|highlights?|still buzzing|what stuck|sessions? that stuck|favorite talks?|favourite talks?)\b/i, weight: 4 },
      { pattern: /\b(day one|day 1|day two|day 2|past three days|3 days|weekend at ai engineer|full weekend)\b/i, weight: 3 },
      { pattern: /\b(best conference|single track|family style|builder-first|conference format|whole event)\b/i, weight: 3 },
    ],
  },
  {
    storyId: 'openai-codex-presence',
    label: 'OpenAI Codex presence',
    summary:
      'OpenAI showed up through Codex booth demos, technical workshops, Codex for Everyone, FDE lunch chat, hack-night experiments, and Gabriel Chua day-by-day recaps.',
    keywords: ['openai', 'codex', 'fde', 'gabriel chua', 'hack night'],
    signals: [
      { pattern: /\b(codex|openai codex|codex for everyone|fde|forward deployed engineer|gabriel chua|gabriel-chua|chua)\b/i, weight: 5 },
      { pattern: /\b(openai|thibault|sottiaux|gpt|realtime|hack night|realtime hack)\b/i, weight: 3 },
      { pattern: /\b(codex booth|codex workshop|codex technical workshop)\b/i, weight: 5 },
    ],
  },
  {
    storyId: 'agentic-workshops',
    label: 'Agentic workflow workshops',
    summary:
      'Workshop refs centered on practical AI engineering craft: LlamaIndex, agentic document workflows, x402/pay.sh, Vercel, Stripe, Convex, Cerebras, and hands-on implementation sessions.',
    keywords: ['workshops', 'agentic workflows', 'llamaindex', 'x402', 'vercel'],
    signals: [
      { pattern: /\b(workshop|workshops|hands-on|hands on|agentic workflow|agentic document|llamaindex|beyond rag|rag)\b/i, weight: 4 },
      { pattern: /\b(x402|pay\.sh|stripe|vercel|convex|cerebras|inference|parsing|reranking|evaluation)\b/i, weight: 3 },
      { pattern: /\b(enterprise pdf|document workflow|technical workshop|workshop-heavy)\b/i, weight: 4 },
    ],
  },
  {
    storyId: 'research-talks-model-systems',
    label: 'Research talks and model systems',
    summary:
      'Research-track posts covered world models, physical AI, sovereign AI, MoE inference, Sakana AI, Reka, Cerebras, and deeper model-system talks.',
    keywords: ['research talks', 'world models', 'physical ai', 'sovereign ai', 'inference'],
    signals: [
      { pattern: /\b(world models?|physical ai|sovereign ai|moe|mixture of experts|inference|research track|research talk)\b/i, weight: 4 },
      { pattern: /\b(sakana|reka|cerebras|luma|reactor|bifrost|alberto|aravind|model systems?)\b/i, weight: 3 },
      { pattern: /\b(understand physics|simulate|simulation|robotics research|model space)\b/i, weight: 3 },
    ],
  },
  {
    storyId: 'students-organizers-community',
    label: 'Students, organizers and community love',
    summary:
      'Community refs focused on student tickets, scholarship seats, organizer gratitude, volunteer energy, and warm posts naming Sherry Jiang, Agrim Singh, 65labs, Kaspar Hidayat, Ivan Leo, and Rachael De Foe.',
    keywords: ['students', 'organizers', '65labs', 'scholarships', 'community'],
    signals: [
      { pattern: /\b(student|students|scholarship|sponsored ticket|student seats?|waitlist|volunteer|organizers?|organisers?)\b/i, weight: 4 },
      { pattern: /\b(65labs|sherry|agrim|kaspar|ivan leo|rachael|de foe|hidayat|organizing team|organising team)\b/i, weight: 3 },
      { pattern: /\b(thank you|grateful|shout ?out|love|community|scene|you are the scene)\b/i, weight: 2 },
    ],
  },
  {
    storyId: 'sponsors-booths-hiring',
    label: 'Sponsors, booths and hiring',
    summary:
      'Sponsor and partner refs covered booth presence, hiring, credits, partner selfies, and ecosystem participation from Google DeepMind, Exa, Arize, Vercel, Cloudflare, Cursor, and others.',
    keywords: ['sponsors', 'booths', 'hiring', 'partners', 'credits'],
    signals: [
      { pattern: /\b(sponsor|sponsors|partner|partners|booth|expo|hiring|credits?|api credits?|giveaway)\b/i, weight: 4 },
      { pattern: /\b(google deepmind|deepmind|exa|arize|cloudflare|cursor|vercel|convex|aws|stripe|daytona|featherless|nebius|posthog)\b/i, weight: 3 },
      { pattern: /\b(happy hour|founder dinner|partner dinner|closed-door|closed door)\b/i, weight: 2 },
    ],
  },
  {
    storyId: 'side-events-meetups',
    label: 'Side events and meetups',
    summary:
      'Side-event refs covered AI Tinkerers, Tencent Cloud, Ralphthon, GFTN, Road to AIE meetups, Convex boba, happy hours, and the broader build-week circuit around the main conference.',
    keywords: ['side events', 'meetups', 'ai tinkerers', 'ralphthon', 'road to aie'],
    signals: [
      { pattern: /\b(side event|side events|meetup|meetups|ai tinkerers|tinkerers|ralphthon|gftn|tencent|built different)\b/i, weight: 4 },
      { pattern: /\b(road to aie|convex boba|happy hour|founder meetup|jupiter hq|network school|running with ai engineers)\b/i, weight: 4 },
      { pattern: /\b(build week|ai week|around the conference|orbiting the main conference)\b/i, weight: 2 },
    ],
  },
  {
    storyId: 'hackathon-build-week',
    label: 'Hackathons and build-week prizes',
    summary:
      'Hackathon refs captured Road to AIE build nights, prize money, sponsor challenges, API-credit offers, 300-builder rooms, and related pre-conference demos.',
    keywords: ['hackathon', 'build night', 'prizes', 'api credits', 'road to aie'],
    signals: [
      { pattern: /\b(hackathon|hackathons|build night|builder night|300 builders|7 hours|cash prizes?|sgd|\$3k|\$2k|\$1k)\b/i, weight: 5 },
      { pattern: /\b(prizes?|credits?|api credits?|adaption labs|smithery|mastra|challenge)\b/i, weight: 3 },
      { pattern: /\b(on-demand 3d panoramas|wiki ?racer|winning|won 2nd|demo vid)\b/i, weight: 3 },
    ],
  },
  {
    storyId: 'stage-demos-creative-ai',
    label: 'Stage demos and creative AI',
    summary:
      'Creative-demo refs included Reachy, robotics, rap battle moments, Synthaesthetic Art, demo-stage photos, and playful examples of AI as a visible live medium.',
    keywords: ['reachy', 'robotics', 'rap battle', 'creative ai', 'stage demos'],
    signals: [
      { pattern: /\b(reachy|pollen robotics|robot|robotics|rap battle|creative ai|synthaesthetic|demo stage|stage demo)\b/i, weight: 4 },
      { pattern: /\b(hugging face|kai-ming|live demo|dance|performance|art)\b/i, weight: 3 },
    ],
  },
  {
    storyId: 'leadership-enterprise',
    label: 'Leadership track and software factories',
    summary:
      'Leadership and enterprise refs covered software factories, deploying coding agents inside organizations, product/engineering workflow changes, and packed-house leadership-track sessions.',
    keywords: ['leadership track', 'software factories', 'enterprise', 'coding agents', 'organizations'],
    signals: [
      { pattern: /\b(leadership track|software factories|software factory|enterprise|inside organizations?|deploying coding agents|product leadership)\b/i, weight: 4 },
      { pattern: /\b(workflows? inside|organizational|management|teams|ownership|product and engineering)\b/i, weight: 2 },
    ],
  },
  {
    storyId: 'singapore-builder-scene',
    label: 'Singapore builder-scene signal',
    summary:
      'Scene-level refs debated or celebrated Singapore as an AI builder hub: room-size demand, local ownership, serious builders, regional energy, and occasional skeptical pushback.',
    keywords: ['singapore ai scene', 'builder hub', 'local scene', 'demand', 'skepticism'],
    signals: [
      { pattern: /\b(singapore (ai )?(scene|hub|builder|builders)|regional builder|locally owned|room-size problem|showed up|surface area)\b/i, weight: 4 },
      { pattern: /\b(skeptic|skeptical|reality check|delusional|trading hub|global ai hub|serious builders|access is)\b/i, weight: 4 },
      { pattern: /\b(scene-building|builder community|community energy|not a tour stop|not flown in)\b/i, weight: 3 },
    ],
  },
  {
    storyId: 'livestream-video-recordings',
    label: 'Livestreams and talk recordings',
    summary:
      'Video refs made the event visible beyond the room: official livestreams, uploaded talks, YouTube clips, source videos, and posts pointing people to recordings.',
    keywords: ['livestream', 'recordings', 'youtube', 'talk video', 'watch'],
    signals: [
      { pattern: /\b(livestream|live stream|streaming|youtube|recording|recordings|talk is now up|talk from ai engineer|watch the recording|video is up)\b/i, weight: 4 },
      { pattern: /\b(tune in live|talks kick off|source video|uploaded|41-min|41 min)\b/i, weight: 3 },
    ],
  },
];

const STORY_BY_ID = new Map(STORY_DEFINITIONS.map((story) => [story.storyId, story]));

export function buildStoryAssignedThemes(eventId: string, posts: EventPost[]): StoryAssignmentResult {
  let assignedPosts = posts.map(assignPostStories);
  const grouped = new Map<string, EventPost[]>();

  for (const post of assignedPosts) {
    const storyId = post.primaryStoryId ?? 'overall-event-recaps';
    const group = grouped.get(storyId) ?? [];
    group.push(post);
    grouped.set(storyId, group);
  }

  const smallStoryIds = new Set<string>();
  for (const [storyId, group] of grouped) {
    const rootCount = group.filter(isRootPost).length;
    if (storyId !== 'overall-event-recaps' && group.length < 6 && rootCount < 4) {
      smallStoryIds.add(storyId);
    }
  }

  if (smallStoryIds.size) {
    const overall = grouped.get('overall-event-recaps') ?? [];
    const reassignedById = new Map<string, EventPost>();
    for (const storyId of smallStoryIds) {
      const group = grouped.get(storyId) ?? [];
      const reassigned = group.map((post) => reassignPost(post, 'overall-event-recaps', 'secondary'));
      overall.push(...reassigned);
      for (const post of reassigned) {
        reassignedById.set(post.postId, post);
      }
      grouped.delete(storyId);
    }
    assignedPosts = assignedPosts.map((post) => reassignedById.get(post.postId) ?? post);
    grouped.set('overall-event-recaps', overall);
  }

  const themes = Array.from(grouped.entries())
    .map(([storyId, group]) => toStoryTheme(eventId, storyId, group))
    .filter((theme): theme is EventTheme => Boolean(theme))
    .sort((a, b) => b.postIds.length - a.postIds.length || b.score - a.score);

  const rootIds = new Set(themes.flatMap((theme) => theme.rootPostIds ?? []));
  const attachedIds = new Set(themes.flatMap((theme) => theme.attachedPostIds ?? []));
  return {
    posts: assignedPosts,
    themes,
    stats: {
      totalRefs: assignedPosts.length,
      rootRefs: rootIds.size,
      attachedRefs: attachedIds.size,
      multiMentionRefs: assignedPosts.filter((post) => (post.storyMentions?.length ?? 0) > 1).length,
      broadRecapRefs: assignedPosts.filter((post) => post.storyType === 'broad_recap').length,
    },
  };
}

function assignPostStories(post: EventPost): EventPost {
  const scores = scoreStories(post);
  const mentions = scores
    .filter((item) => item.score >= 3)
    .map((item, index) => toMention(item.story, item.score, index === 0 ? 'primary' : 'secondary'));

  const broad = isBroadRecap(post, mentions);
  const primaryStoryId = choosePrimaryStory(scores, mentions, broad);
  const primaryStory = STORY_BY_ID.get(primaryStoryId) ?? STORY_BY_ID.get('overall-event-recaps')!;
  const primaryMention = toMention(primaryStory, scores.find((item) => item.story.storyId === primaryStoryId)?.score ?? 3, 'primary');
  const finalMentions = uniqueMentions([
    primaryMention,
    ...mentions.filter((mention) => mention.storyId !== primaryStoryId).map((mention) => ({ ...mention, role: 'secondary' as const })),
  ]).slice(0, 5);
  const storyType = inferStoryType(post, primaryStoryId, broad);
  const tags = [
    ...(post.tags ?? []).filter((tag) => !tag.startsWith('story:') && !tag.startsWith('story-type:')),
    `story:${primaryStoryId}`,
    `story-type:${storyType}`,
  ];

  return {
    ...post,
    storyType,
    primaryStoryId,
    storyMentions: finalMentions,
    tags,
  };
}

function scoreStories(post: EventPost): Array<{ story: StoryDefinition; score: number }> {
  const text = storyText(post);
  return STORY_DEFINITIONS.map((story) => ({
    story,
    score: story.signals.reduce((sum, signal) => sum + (signal.pattern.test(text) ? signal.weight : 0), 0),
  })).sort((a, b) => b.score - a.score);
}

function choosePrimaryStory(
  scores: Array<{ story: StoryDefinition; score: number }>,
  mentions: EventStoryMention[],
  broad: boolean
): string {
  const top = scores[0];
  const second = scores[1];
  if (!top || top.score < 3) return 'overall-event-recaps';
  if (top.story.storyId !== 'overall-event-recaps' && (top.score >= 8 || top.score >= (second?.score ?? 0) + 3)) {
    return top.story.storyId;
  }
  if (
    broad &&
    mentions.length >= 3 &&
    top.story.storyId !== 'overall-event-recaps' &&
    top.score < Math.max(10, (second?.score ?? 0) * 1.45)
  ) {
    return 'overall-event-recaps';
  }
  return top.story.storyId;
}

function isBroadRecap(post: EventPost, mentions: EventStoryMention[]): boolean {
  const text = storyText(post);
  const longPost = text.length > 900;
  const listLike =
    /\b(favourite talks?|favorite talks?|highlights?|takeaways?|sessions? that stuck|talks i enjoyed|things that stuck|past three days|still buzzing|day [123]|full weekend)\b/i.test(
      text
    ) || /\b(1\.|2\.|3\.|4\.|5\.)\s+\w+/i.test(text);
  return (longPost && mentions.length >= 4) || (listLike && mentions.length >= 3);
}

function inferStoryType(post: EventPost, primaryStoryId: string, broad: boolean): EventPostStoryType {
  const tags = (post.tags ?? []).map((tag) => tag.toLowerCase());
  if (tags.includes('context:event') || isReplyPost(post)) return 'context';
  if (broad || primaryStoryId === 'overall-event-recaps') return 'broad_recap';
  if (primaryStoryId === 'side-events-meetups') return 'side_event';
  if (primaryStoryId === 'sponsors-booths-hiring') return 'sponsor';
  if (primaryStoryId === 'livestream-video-recordings') return 'logistics';
  return 'single_story';
}

function toStoryTheme(eventId: string, storyId: string, posts: EventPost[]): EventTheme | undefined {
  const story = STORY_BY_ID.get(storyId);
  if (!story || !posts.length) return undefined;
  const sorted = [...posts].sort((a, b) => b.reachScore - a.reachScore || postTime(b) - postTime(a));
  const rootPostIds = sorted.filter(isRootPost).map((post) => post.postId);
  const attachedPostIds = sorted.filter((post) => !isRootPost(post)).map((post) => post.postId);
  const postIds = [...rootPostIds, ...attachedPostIds];
  const score = sorted.reduce((sum, post) => sum + storyPostScore(post), 0);
  return {
    themeId: `story-${story.storyId}`,
    eventId,
    storyId: story.storyId,
    storyType: 'story_assignment',
    label: story.label,
    summary: story.summary,
    keywords: story.keywords,
    postIds,
    rootPostIds,
    attachedPostIds,
    score: Number(score.toFixed(3)),
    updatedAt: Date.now(),
  };
}

function reassignPost(post: EventPost, storyId: string, role: EventStoryMention['role']): EventPost {
  const story = STORY_BY_ID.get(storyId);
  if (!story) return post;
  const mentions = uniqueMentions([toMention(story, 3, role), ...(post.storyMentions ?? [])]);
  const storyType: EventPostStoryType = storyId === 'overall-event-recaps' ? 'broad_recap' : post.storyType ?? 'single_story';
  const tags = [
    ...(post.tags ?? []).filter((tag) => !tag.startsWith('story:') && !tag.startsWith('story-type:')),
    `story:${storyId}`,
    `story-type:${storyType}`,
  ];
  return {
    ...post,
    primaryStoryId: storyId,
    storyType,
    storyMentions: mentions,
    tags,
  };
}

function toMention(story: StoryDefinition, score: number, role: EventStoryMention['role']): EventStoryMention {
  return {
    storyId: story.storyId,
    label: story.label,
    role,
    confidence: Math.max(0.35, Math.min(0.98, Number((score / 14).toFixed(2)))),
  };
}

function uniqueMentions(mentions: EventStoryMention[]): EventStoryMention[] {
  const byId = new Map<string, EventStoryMention>();
  for (const mention of mentions) {
    const current = byId.get(mention.storyId);
    if (!current || mention.role === 'primary' || mention.confidence > current.confidence) {
      byId.set(mention.storyId, mention);
    }
  }
  return Array.from(byId.values()).sort((a, b) => {
    if (a.role !== b.role) return a.role === 'primary' ? -1 : 1;
    return b.confidence - a.confidence;
  });
}

function storyPostScore(post: EventPost): number {
  return 1 + Math.log1p(engagement(post.metrics)) + Math.log1p(post.metrics.views ?? post.metrics.impressions ?? 0) / 4;
}

function isRootPost(post: EventPost): boolean {
  return !isReplyPost(post) && !(post.tags ?? []).some((tag) => tag.toLowerCase() === 'context:event');
}

function isReplyPost(post: EventPost): boolean {
  const tags = (post.tags ?? []).map((tag) => tag.toLowerCase());
  return (
    tags.includes('x-reply') ||
    tags.includes('linkedin-comment') ||
    tags.includes('youtube-comment') ||
    tags.includes('comment') ||
    post.url.includes('#comment-') ||
    (post.platform === 'youtube' && post.url.includes('&lc='))
  );
}

function storyText(post: EventPost): string {
  return `${post.text} ${post.authorName} ${post.authorHandle ?? ''} ${(post.tags ?? []).join(' ')} ${shortExcerpt(
    post.text,
    240
  )}`.toLowerCase();
}

function postTime(post: EventPost): number {
  return new Date(post.postedAt ?? post.capturedAt ?? 0).getTime() || 0;
}
