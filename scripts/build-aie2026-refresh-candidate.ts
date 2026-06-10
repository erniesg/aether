import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { rankVoices } from '../lib/research/event-recap/analyze';
import { aie2026EventScopeRejectReason, aie2026YoutubeVideoId } from '../lib/research/event-recap/aie2026-scope';
import { buildSemanticStoryAssignment } from '../lib/research/event-recap/semantic-story-assignment';
import { bestDisplayAuthorName } from '../lib/research/event-recap/utils';

type AnyRecord = Record<string, any>;

const EVENT_DIR = path.resolve(process.cwd(), 'outputs/event-recap-ai-engineer-singapore');
const PUBLIC_MEDIA_PREFIX = 'event-recap-ai-engineer-singapore/media/';
const ARCHIVE_PATH = path.join(EVENT_DIR, 'archive.json');
const PUBLIC_PATH = path.join(EVENT_DIR, 'public.json');
const SIDECAR_PATH = path.join(
  EVENT_DIR,
  'delta-refresh-tests/metrics-refresh-current-corpus-2026-05-27T05-38-59-329Z/posts.metrics-refreshed.json'
);
const SIDECAR_SUMMARY_PATH = path.join(
  EVENT_DIR,
  'delta-refresh-tests/metrics-refresh-current-corpus-2026-05-27T05-38-59-329Z/full-metrics-refresh-final-summary.json'
);
const REVIEW_DIR = path.join(
  EVENT_DIR,
  'delta-refresh-tests/relevance-review-current-sidecar-2026-05-27T06-20-00Z'
);
const HUMAN_DECISIONS_PATH = path.join(REVIEW_DIR, 'human-relevance-decisions-2026-05-27.json');
const ORPHAN_RESOLUTION_PATH = path.join(REVIEW_DIR, 'orphan-linkedin-parent-resolution.json');

function defaultRefreshId(): string {
  return `${new Date().toISOString().replace(/\.\d{3}Z$/, 'Z').replace(/:/g, '-')}-semantic-delta-candidate`;
}

const REFRESH_ID = process.env.REFRESH_ID ?? defaultRefreshId();
const REFRESH_DIR = path.join(EVENT_DIR, 'refreshes', REFRESH_ID);
const GENERATED_AT = new Date().toISOString();
const DEFAULT_OPENAI_CHAT_MODEL = 'gpt-4.1-mini';
const DEFAULT_OPENAI_EMBEDDING_MODEL = 'text-embedding-3-small';
const SEMANTIC_EMBEDDING_CACHE_DIR = path.join(EVENT_DIR, '.cache');
const EXACT_REVIEW_EXCLUSIONS = [
  {
    postId: 'linkedin_05ec3530045f',
    reason:
      'Human review: Gleb Gordeev Q2 goals post only mentions AI Engineer Singapore as a planned trip, so it is incidental rather than event recap evidence.',
  },
  {
    postId: 'linkedin_mhpypf',
    reason:
      'Human review: Max Buckley Easter road-trip reflection is pre-event speaker context, not an event recap, talk recording, or onsite Singapore evidence.',
  },
];

const REVIEWED_OFF_EVENT_CODEX_POST_IDS = ['linkedin_1nk0i10', 'linkedin_db1c35ac5e9d'] as const;
const REVIEWED_BOUNDARY_ASSIGNMENTS = [
  {
    postId: 'youtube_1n7fiax',
    storyId: 'hackathon-build-week',
    rootFit: 'root',
    reason: 'AIE/Ralphthon hackathon vlog is a hackathon/build-week artifact; Codex is only context.',
  },
  {
    postId: 'youtube_1b8miq5',
    storyId: 'hackathon-build-week',
    rootFit: 'root',
    reason: 'PokeAI demo is an AI Engineer Hackathon artifact, not a broad event recap.',
  },
  {
    postId: 'x_118j5sn',
    storyId: 'stage-demos-creative-ai',
    rootFit: 'root',
    reason: 'StickEm robot demo clip fits the stage demos and creative AI story better than broad recap.',
  },
  {
    postId: 'linkedin_1ku98rg',
    storyId: 'students-organizers-community',
    rootFit: 'root',
    reason: '65labs builder-community reflection is community evidence, not primary OpenAI/Codex evidence.',
  },
  {
    postId: 'linkedin_72elb8',
    storyId: 'students-organizers-community',
    rootFit: 'root',
    reason: 'Rachael De Foe builder-community framing belongs with students, organizers, and community.',
  },
  {
    postId: 'linkedin_1dma1lr',
    storyId: 'stage-demos-creative-ai',
    rootFit: 'context',
    reason: 'AI design-track speaker announcement is useful design/demo context, not a model-systems root.',
  },
] as const;
const SIDE_EVENTS_SUMMARY_WITHOUT_RALPHTHON =
  'Side-event refs covered AI Tinkerers, Tencent Cloud, GFTN, Road to AIE meetups, Convex boba, happy hours, and founder/community gatherings around the main conference.';

const EXACT_STORY_DECISIONS = [
  ...REVIEWED_BOUNDARY_ASSIGNMENTS,
  {
    postId: 'linkedin_1nk0i10',
    rootFit: 'exclude',
    reason:
      'Post-event OpenAI/Sea Regional Codex Hackathon announcement is adjacent follow-on, not AIE Singapore recap evidence.',
  },
  {
    postId: 'linkedin_db1c35ac5e9d',
    rootFit: 'exclude',
    reason: 'Off-region OpenAI Codex meetup / different AI Engineer Conference context is not AIE Singapore evidence.',
  },
  {
    postId: 'linkedin_15i4srb',
    rootFit: 'exclude',
    reason: 'Nebius Asia Tech x Singapore booth post is primarily a post-AIE adjacent event, not AIE Singapore evidence.',
  },
  {
    postId: 'linkedin_k9psgf',
    rootFit: 'exclude',
    reason: 'ATP Salesforce Agentforce World Tour recap is not about AIE Singapore.',
  },
  {
    postId: 'linkedin_1kod8sc',
    rootFit: 'exclude',
    reason: 'FutureCOO compute-cost prompt has no direct AIE Singapore evidence in the post body.',
  },
  {
    postId: 'x:2056428942467232140',
    storyId: 'stage-demos-creative-ai',
    rootFit: 'root',
    reason: 'Reachy rap battle is a creative/demo artifact, not a broad event recap.',
  },
  {
    postId: 'x:2055093106157003100',
    storyId: 'research-talks-model-systems',
    rootFit: 'root',
    reason: 'Sara Hooker session announcement is about a model/research talk.',
  },
  {
    postId: 'linkedin_j0ho9v',
    storyId: 'overall-event-recaps',
    rootFit: 'root',
    reason: 'Broad three-day attendee recap should not be anchored to the Vivian story alone.',
  },
  {
    postId: 'linkedin_fzqe2z',
    storyId: 'openai-codex-presence',
    rootFit: 'root',
    reason: 'Post centers on asking OpenAI Head of Codex about model/harness/skill boundaries.',
  },
  {
    postId: 'linkedin_13uw9su',
    storyId: 'overall-event-recaps',
    rootFit: 'root',
    reason: 'General first-AIE reflection is broader than the Vivian keynote.',
  },
  {
    postId: 'linkedin_1tl1qz6',
    storyId: 'students-organizers-community',
    rootFit: 'root',
    reason: 'Volunteer and appreciation post belongs with organizers/community gratitude.',
  },
  {
    postId: 'linkedin_ty13wt',
    storyId: 'overall-event-recaps',
    rootFit: 'root',
    reason: 'Broad gossip/theme recap mentions Codex but is not primarily OpenAI presence.',
  },
  {
    postId: 'x:2055457802660061603',
    storyId: 'vivian-builder-keynote',
    rootFit: 'root',
    reason: 'Post is directly about Vivian Bala opening talk and second-brain implications.',
  },
  {
    postId: 'x:2056661258007670919',
    storyId: 'vivian-builder-keynote',
    rootFit: 'root',
    reason: 'Post is directly about watching Vivian Bala and exploring NanoClaw.',
  },
  {
    postId: 'linkedin_zem44m',
    storyId: 'students-organizers-community',
    rootFit: 'root',
    reason: 'Volunteer gratitude/reflection is community evidence, not hackathon evidence.',
  },
  {
    postId: 'x:2055275516186533945',
    storyId: 'students-organizers-community',
    rootFit: 'root',
    reason: 'Volunteer team photo belongs with organizers and community gratitude.',
  },
  {
    postId: 'linkedin_1qwq8r7',
    storyId: 'stage-demos-creative-ai',
    rootFit: 'root',
    reason: 'Robot Company deployment post is robotics/demo evidence, not hackathon evidence.',
  },
  {
    postId: 'x:2055689322255507834',
    storyId: 'hackathon-build-week',
    rootFit: 'context',
    reason: 'Ambassador support mention is useful hackathon context but not a standalone AIE root artifact.',
  },
  {
    postId: 'linkedin_1ba72b4',
    storyId: 'overall-event-recaps',
    rootFit: 'root',
    reason: 'Broad attendee recap spans robotics, reasoning models, design, software, and community.',
  },
  {
    postId: 'linkedin_mu20ou',
    storyId: 'side-events-meetups',
    rootFit: 'root',
    reason: 'Travel recap leads with Daytona and surrounding side events.',
  },
  {
    postId: 'linkedin_13f842f',
    storyId: 'vivian-builder-keynote',
    rootFit: 'root',
    reason: 'Post is primarily about Vivian, adoption, and leadership learning by building.',
  },
  {
    postId: 'linkedin_1geim94',
    storyId: 'stage-demos-creative-ai',
    rootFit: 'root',
    reason: 'Design systems and Magic Patterns Screens post is a creative/product demo story.',
  },
  {
    postId: 'linkedin_9ucnfq',
    storyId: 'research-talks-model-systems',
    rootFit: 'root',
    reason: 'Adaption Labs/Sara Hooker recap belongs with research and future AI systems.',
  },
  {
    postId: 'linkedin_12e5233',
    storyId: 'overall-event-recaps',
    rootFit: 'root',
    reason: 'Speaker reflection is a general event recap rather than sponsor/booth evidence.',
  },
  {
    postId: 'linkedin_1cw3h21',
    storyId: 'overall-event-recaps',
    rootFit: 'root',
    reason: 'Korean attendee/speaker reflection is broad event evidence, not sponsor evidence.',
  },
  {
    postId: 'linkedin_v0ywg2',
    storyId: 'overall-event-recaps',
    rootFit: 'context',
    reason: 'Social-listening meta recap is useful context but should not be a primary story root.',
  },
  {
    postId: 'linkedin_vyggyu',
    storyId: 'overall-event-recaps',
    rootFit: 'root',
    reason: 'Day 2 wrap and thanks is broad recap/community evidence, not sponsor evidence.',
  },
  {
    postId: 'x:2055959854603293063',
    storyId: 'vivian-builder-keynote',
    rootFit: 'context',
    reason: 'OneCLI/NanoClaw note supports the Vivian stack story but is not an AIE/OpenAI root artifact.',
  },
  {
    postId: 'linkedin_bofbpm',
    storyId: 'overall-event-recaps',
    rootFit: 'context',
    reason: 'Organizer pre-event framing is broad context, not an OpenAI/Codex presence root.',
  },
  {
    postId: 'x:2055494200712683786',
    storyId: 'overall-event-recaps',
    rootFit: 'root',
    reason: 'YC-founder density observation is overall event texture, not a side-event or meetup artifact.',
  },
  {
    postId: 'x:2056336381077577807',
    storyId: 'overall-event-recaps',
    rootFit: 'root',
    reason: 'Goodbye Singapore reflection is broad event afterglow, not a side-event root.',
  },
  {
    postId: 'x:2055094562797064680',
    storyId: 'livestream-video-recordings',
    rootFit: 'root',
    reason: 'ATP live interview from AI Engineer Singapore belongs with live recordings/interviews.',
  },
  {
    postId: 'linkedin_cupa3y',
    storyId: 'agentic-workshops',
    rootFit: 'root',
    reason: 'Post is about simultaneous workshops and agent engineering topics, not side events.',
  },
  {
    postId: 'x:2055972755208888451',
    storyId: 'students-organizers-community',
    rootFit: 'root',
    reason: 'Organizer reflection and shoutout belongs with organizers/community gratitude, not hackathon roots.',
  },
  {
    postId: 'x:2055503602693886383',
    storyId: 'research-talks-model-systems',
    rootFit: 'root',
    reason: 'Max Buckley/Exa talk reaction is search and knowledge research, not an agentic workshop root.',
  },
] as const;

const EDITORIAL_SYNTHESIS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    lede: {
      type: 'string',
      minLength: 80,
      maxLength: 520,
      description: 'One evidence-grounded sentence that balances the dominant story with surrounding event density.',
    },
    synthesisCards: {
      type: 'array',
      minItems: 3,
      maxItems: 3,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: { type: 'string', minLength: 2, maxLength: 50 },
          body: { type: 'string', minLength: 60, maxLength: 360 },
        },
        required: ['title', 'body'],
      },
    },
    themes: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          themeId: {
            type: 'string',
            description: 'Existing theme id. Must match one supplied input theme id exactly.',
          },
          label: {
            type: 'string',
            minLength: 2,
            maxLength: 80,
            description: 'Creator-facing label, 2 to 5 words.',
          },
          summary: {
            type: 'string',
            minLength: 40,
            maxLength: 420,
            description: 'One or two evidence-grounded sentences. Do not invent facts.',
          },
          stakeholderAngles: {
            type: 'array',
            minItems: 1,
            maxItems: 5,
            items: {
              type: 'string',
              enum: ['speakers', 'sponsors', 'brands', 'highlights', 'participants'],
            },
          },
          perspectiveNote: {
            type: 'string',
            minLength: 10,
            maxLength: 260,
            description: 'How this story broadens or qualifies the recap perspective.',
          },
        },
        required: ['themeId', 'label', 'summary', 'stakeholderAngles', 'perspectiveNote'],
      },
    },
    angleLenses: {
      type: 'array',
      minItems: 5,
      maxItems: 5,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          angle: {
            type: 'string',
            enum: ['speakers', 'sponsors', 'brands', 'highlights', 'participants'],
          },
          copy: {
            type: 'string',
            minLength: 80,
            maxLength: 650,
            description: 'Two to four evidence-grounded sentences for this angle.',
          },
          namedActorsEvidenced: {
            type: 'array',
            maxItems: 18,
            items: { type: 'string', maxLength: 80 },
          },
          namedActorsThin: {
            type: 'array',
            maxItems: 12,
            items: { type: 'string', maxLength: 80 },
          },
          supportingThemeIds: {
            type: 'array',
            minItems: 1,
            maxItems: 8,
            items: { type: 'string' },
          },
        },
        required: ['angle', 'copy', 'namedActorsEvidenced', 'namedActorsThin', 'supportingThemeIds'],
      },
    },
  },
  required: ['lede', 'synthesisCards', 'themes', 'angleLenses'],
};

type NativeIds = {
  xTweetId?: string;
  linkedinActivityId?: string;
  linkedinCommentId?: string;
  youtubeVideoId?: string;
  youtubeCommentId?: string;
  parentNativeKey?: string;
};

function readJson<T = AnyRecord>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function loadEnvLocal(): void {
  const file = path.resolve('.env.local');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]]) continue;
    let value = match[2] ?? '';
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
}

function envNumber(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  const parsed = raw ? Number(raw) : fallback;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function writeJson(fileName: string, data: unknown): void {
  fs.writeFileSync(path.join(REFRESH_DIR, fileName), `${JSON.stringify(data, null, 2)}\n`);
}

function sha256(filePath: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function hashValue(value: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function sanitizeInheritedEnrichment(enrichment: AnyRecord[] = []): AnyRecord[] {
  return enrichment.map((entry) => {
    if (!entry?.analysis?.clustering) return entry;
    const next = clone(entry);
    delete next.analysis.clustering;
    if (Object.keys(next.analysis).length === 0) delete next.analysis;
    return next;
  });
}

function addTag(tags: string[], tag: string): string[] {
  return tags.some((existing) => existing.toLowerCase() === tag.toLowerCase()) ? tags : [...tags, tag];
}

function removeTags(tags: string[], prefixes: string[]): string[] {
  return tags.filter((tag) => !prefixes.some((prefix) => tag.startsWith(prefix)));
}

function isRelevant(row: AnyRecord): boolean {
  return (row.tags ?? []).some((tag: string) => tag.toLowerCase() === 'relevant:event');
}

function metricEngagement(metrics: AnyRecord = {}): number {
  return Number(metrics.likes ?? 0) + Number(metrics.reactions ?? 0) + Number(metrics.reposts ?? 0) + Number(metrics.comments ?? 0) + Number(metrics.replies ?? 0);
}

function publicSignal(row: AnyRecord): number {
  const metrics = row.metrics ?? {};
  return (
    metricEngagement(metrics) +
    Number(metrics.views ?? metrics.impressions ?? 0) / 200 +
    Number(row.reachScore ?? 0) * 12
  );
}

function cleanPromptText(value: unknown, maxLength = 900): string {
  return String(value ?? '')
    .replace(/\r/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function stakeholderAnglesForStory(storyId: unknown): string[] {
  switch (storyId) {
    case 'vivian-builder-keynote':
    case 'research-talks-model-systems':
    case 'agentic-workshops':
      return ['speakers', 'brands', 'highlights'];
    case 'openai-codex-presence':
      return ['sponsors', 'brands', 'speakers'];
    case 'students-organizers-community':
      return ['participants'];
    case 'sponsors-booths-hiring':
      return ['sponsors', 'brands'];
    case 'side-events-meetups':
    case 'hackathon-build-week':
      return ['participants', 'highlights', 'brands'];
    case 'stage-demos-creative-ai':
      return ['highlights', 'brands'];
    case 'livestream-video-recordings':
      return ['highlights', 'speakers'];
    case 'overall-event-recaps':
      return ['participants', 'speakers', 'sponsors', 'brands', 'highlights'];
    default:
      return ['participants'];
  }
}

function evidenceForTheme(theme: AnyRecord, postsById: Map<string, AnyRecord>): AnyRecord[] {
  const ids = uniqueStrings([...(theme.rootPostIds ?? []), ...(theme.postIds ?? [])]);
  return ids
    .map((postId) => postsById.get(postId))
    .filter((post): post is AnyRecord => Boolean(post))
    .sort((a, b) => publicSignal(b) - publicSignal(a))
    .slice(0, 8)
    .map((post) => ({
      postId: post.postId,
      platform: post.platform,
      author: bestDisplayAuthorName(post),
      url: post.url,
      metrics: post.metrics ?? {},
      text: cleanPromptText(post.text, 700),
    }));
}

function productionStoryAnchors(productionThemes: AnyRecord[]): AnyRecord[] {
  return productionThemes.map((theme) => ({
    themeId: theme.themeId,
    storyId: theme.storyId,
    label: theme.label,
    summary: theme.summary,
    postCount: Array.isArray(theme.postIds) ? theme.postIds.length : undefined,
  }));
}

function buildEditorialPayload(themes: AnyRecord[], posts: AnyRecord[], productionThemes: AnyRecord[]): AnyRecord {
  const postsById = new Map(posts.map((post) => [post.postId, post]));
  return {
    eventName: 'AI Engineer Singapore 2026',
    productionStoryShape: productionStoryAnchors(productionThemes),
    productionEditorialAnchor: {
      lede:
        "The strongest refs show Singapore's AI scene working in the open: Vivian Balakrishnan walking through his Raspberry Pi/NanoClaw workflow, packed workshops, booth and hallway photos, student-ticket gratitude, and side events that made the city feel like an active builder scene, not just a host city.",
      synthesisCards: [
        {
          title: 'What travelled',
          body:
            'The viral hook was Vivian\'s "briefed on" line, but the story spread because the details were concrete: Raspberry Pi, NanoClaw, WhatsApp, second-brain workflows, and accountability from someone using the stack.',
        },
        {
          title: 'What made it local',
          body:
            '65labs, student tickets, sponsor booths, founder dinners, side meetups, hallway photos, and volunteer shoutouts made the event read as Singapore builder infrastructure, not fly-in conference programming.',
        },
        {
          title: 'Where the energy sat',
          body:
            'Vivian dominated the corpus, but the surrounding signal was practical: workshops, Codex/OpenAI, sponsor rooms, research talks, build-week side events, and people posting receipts from the room.',
        },
      ],
    },
    landedThesis:
      "Vivian was the viral hook, but the surrounding density, including workshops, sponsors, organizers, side events, research talks, demos, and participant receipts, is what made AIE Singapore read as builder infrastructure rather than fly-in programming.",
    instructions: [
      'Use productionStoryShape as the north star for MECE story angles.',
      'Use productionEditorialAnchor as the tone and structure target; only change it where the refreshed evidence materially improves specificity.',
      'Do not mention ClawCon or OpenClaw in the lede or synthesis cards. Keep it inside the Road to AIE side-events theme only, and only as one example among multiple side-event examples.',
      'Do not create a standalone ClawCon/OpenClaw story; keep it inside Road to AIE side events unless evidence changes materially.',
      'Keep Ralphthon primarily in hackathons/build-week, with side-event as secondary context where useful.',
      'Use concrete evidence from the supplied posts; do not invent attendance counts, quotes, or sponsors.',
      'Avoid vague promotional language such as vibrant, globally, serious hub, ecosystem vitality, or democratize unless the supplied evidence directly supports that exact claim.',
      'Labels must be public recap copy, not raw terms.',
      'Each angle lens must name both dominant and secondary perspectives so the recap is not keynote-only.',
    ],
    themes: themes.map((theme) => ({
      themeId: theme.themeId,
      storyId: theme.storyId,
      currentLabel: theme.label,
      currentSummary: theme.summary,
      keywords: theme.keywords ?? [],
      postCount: (theme.postIds ?? []).length,
      rootCount: (theme.rootPostIds ?? theme.postIds ?? []).length,
      suggestedAngles: stakeholderAnglesForStory(theme.storyId),
      evidence: evidenceForTheme(theme, postsById),
    })),
  };
}

function headlineNeedsProductionFallback(text: unknown): boolean {
  return /\b(clawcon|openclaw|vibrant|globally|global reach|serious hub|ecosystem vitality|democratize|electric)\b/i.test(
    String(text ?? '')
  );
}

type EditorialSynthesis = {
  model?: string;
  strategy: string;
  warning?: string;
  lede?: string;
  synthesisCards?: Array<{ title: string; body: string }>;
  themes?: Array<{
    themeId: string;
    label: string;
    summary: string;
    stakeholderAngles: string[];
    perspectiveNote: string;
  }>;
  angleLenses?: Array<{
    angle: string;
    copy: string;
    namedActorsEvidenced: string[];
    namedActorsThin: string[];
    supportingThemeIds: string[];
  }>;
};

async function generateEditorialSynthesis(
  themes: AnyRecord[],
  posts: AnyRecord[],
  productionThemes: AnyRecord[]
): Promise<EditorialSynthesis> {
  if (process.env.EVENT_RECAP_CANDIDATE_LLM === '0') {
    return { strategy: 'llm-disabled' };
  }
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return { strategy: 'llm-skipped-missing-openai-api-key', warning: 'OPENAI_API_KEY was not available.' };
  }
  const model =
    process.env.EVENT_RECAP_CANDIDATE_OPENAI_MODEL?.trim() ||
    process.env.EVENT_RECAP_FINALIZE_OPENAI_MODEL?.trim() ||
    DEFAULT_OPENAI_CHAT_MODEL;
  const payload = buildEditorialPayload(themes, posts, productionThemes);
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_completion_tokens: 7200,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'aie2026_editorial_synthesis',
          strict: true,
          schema: EDITORIAL_SYNTHESIS_SCHEMA,
        },
      },
      messages: [
        {
          role: 'system',
          content:
            'You are editing an evidence-grounded event recap. Preserve MECE story boundaries, foreground diverse stakeholder angles, and write concise public copy. Do not invent facts beyond the supplied evidence.',
        },
        {
          role: 'user',
          content: JSON.stringify(payload),
        },
      ],
    }),
  });
  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`OpenAI editorial synthesis failed ${response.status}: ${raw.slice(0, 700)}`);
  }
  const decoded = JSON.parse(raw) as AnyRecord;
  const content = decoded.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('OpenAI editorial synthesis returned no structured content.');
  }
  const parsed = JSON.parse(content) as EditorialSynthesis;
  const productionAnchor = payload.productionEditorialAnchor as AnyRecord;
  if (headlineNeedsProductionFallback(parsed.lede)) {
    parsed.lede = productionAnchor.lede;
  }
  if ((parsed.synthesisCards ?? []).some((card) => headlineNeedsProductionFallback(`${card.title} ${card.body}`))) {
    parsed.synthesisCards = productionAnchor.synthesisCards;
  }
  const expectedThemeIds = new Set(themes.map((theme) => String(theme.themeId)));
  const returnedThemeIds = new Set((parsed.themes ?? []).map((theme) => String(theme.themeId)));
  const missing = Array.from(expectedThemeIds).filter((themeId) => !returnedThemeIds.has(themeId));
  const extra = Array.from(returnedThemeIds).filter((themeId) => !expectedThemeIds.has(themeId));
  const validThemes = (parsed.themes ?? []).filter((theme) => expectedThemeIds.has(theme.themeId));
  const validThemeIds = new Set(validThemes.map((theme) => theme.themeId));
  const repairedThemes = [
    ...validThemes,
    ...themes
      .filter((theme) => !validThemeIds.has(theme.themeId))
      .map((theme) => ({
        themeId: String(theme.themeId),
        label: String(theme.label ?? theme.themeId),
        summary: String(theme.summary ?? ''),
        stakeholderAngles: stakeholderAnglesForStory(theme.storyId),
        perspectiveNote: 'Retained production-aligned story copy because the structured LLM response omitted this theme id.',
      })),
  ];
  return {
    ...parsed,
    themes: repairedThemes,
    model: `openai:${model}`,
    strategy: 'openai-structured-editorial-synthesis',
    warning: [
      parsed.warning,
      missing.length ? `LLM omitted theme ids repaired from production/story copy: ${missing.join(', ')}` : undefined,
      extra.length ? `LLM returned unknown theme ids ignored: ${extra.join(', ')}` : undefined,
    ]
      .filter(Boolean)
      .join(' | '),
  };
}

function applyEditorialSynthesis(themes: AnyRecord[], editorial: EditorialSynthesis): AnyRecord[] {
  const byThemeId = new Map((editorial.themes ?? []).map((theme) => [theme.themeId, theme]));
  if (!byThemeId.size) return themes;
  return themes.map((theme) => {
    const rewrite = byThemeId.get(theme.themeId);
    if (!rewrite) {
      if (theme.storyId === 'side-events-meetups') {
        return { ...theme, summary: SIDE_EVENTS_SUMMARY_WITHOUT_RALPHTHON };
      }
      return theme;
    }
    const keepProductionCopy = themeRewriteNeedsProductionFallback(theme, rewrite);
    const summary =
      theme.storyId === 'side-events-meetups'
        ? SIDE_EVENTS_SUMMARY_WITHOUT_RALPHTHON
        : keepProductionCopy
          ? theme.summary
          : rewrite.summary;
    return {
      ...theme,
      label: keepProductionCopy ? theme.label : rewrite.label,
      summary,
      stakeholderAngles: rewrite.stakeholderAngles,
      perspectiveNote: rewrite.perspectiveNote,
      editorialModel: editorial.model,
      editorialStrategy: editorial.strategy,
    };
  });
}

function themeRewriteNeedsProductionFallback(
  theme: AnyRecord,
  rewrite: { label?: string; summary?: string }
): boolean {
  const storyId = String(theme.storyId ?? '');
  const text = `${rewrite.label ?? ''} ${rewrite.summary ?? ''}`;
  if (storyId === 'side-events-meetups' && /\b(ralphthon|hackathons?)\b/i.test(text)) {
    return true;
  }
  if (storyId === 'livestream-video-recordings' && /\bglobal audience\b/i.test(text)) {
    return true;
  }
  return false;
}

function countByPlatform(rows: AnyRecord[]): Record<string, number> {
  return rows.reduce<Record<string, number>>(
    (acc, row) => {
      const platform = String(row.platform ?? 'unknown');
      acc[platform] = (acc[platform] ?? 0) + 1;
      return acc;
    },
    { x: 0, linkedin: 0, youtube: 0 }
  );
}

function countTagPrefix(rows: AnyRecord[], prefix: string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    for (const tag of row.tags ?? []) {
      if (String(tag).startsWith(prefix)) {
        const key = String(tag).slice(prefix.length);
        counts[key] = (counts[key] ?? 0) + 1;
      }
    }
  }
  return counts;
}

function metricTotals(rows: AnyRecord[]): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  for (const row of rows) {
    const platform = String(row.platform ?? 'unknown');
    const bucket = (out[platform] ??= {});
    for (const [key, value] of Object.entries(row.metrics ?? {})) {
      if (typeof value === 'number' && Number.isFinite(value)) bucket[key] = (bucket[key] ?? 0) + value;
    }
  }
  return out;
}

function mediaStats(rows: AnyRecord[]): Record<string, { posts: number; items: number; localItems: number }> {
  const out: Record<string, { posts: number; items: number; localItems: number }> = {};
  for (const platform of ['x', 'linkedin', 'youtube']) {
    const platformRows = rows.filter((row) => row.platform === platform);
    out[platform] = {
      posts: platformRows.filter((row) => row.media?.length).length,
      items: platformRows.reduce((sum, row) => sum + (row.media?.length ?? 0), 0),
      localItems: platformRows.reduce(
        (sum, row) => sum + (row.media ?? []).filter((media: AnyRecord) => media.path || media.localPath).length,
        0
      ),
    };
  }
  return out;
}

function sourceDateRange(rows: AnyRecord[]): { start: string; end: string } | undefined {
  const times = rows
    .map((row) => {
      const value = row.postedAt ?? row.capturedAt ?? row.updatedAt;
      const time = typeof value === 'number' ? value : Date.parse(String(value ?? ''));
      return Number.isFinite(time) && time > 0 ? time : undefined;
    })
    .filter((value): value is number => typeof value === 'number');
  return times.length ? { start: new Date(Math.min(...times)).toISOString(), end: new Date(Math.max(...times)).toISOString() } : undefined;
}

function computeStats(rows: AnyRecord[]): AnyRecord {
  const relevantRows = rows.filter(isRelevant);
  const metricTotalsByPlatform = metricTotals(rows);
  const metricTotalsRelevantByPlatform = metricTotals(relevantRows);
  const xRelevant = metricTotalsRelevantByPlatform.x ?? {};
  const linkedInRelevant = metricTotalsRelevantByPlatform.linkedin ?? {};
  const youtubeRelevant = metricTotalsRelevantByPlatform.youtube ?? {};
  const xViews = xRelevant.views ?? xRelevant.impressions ?? 0;
  const youtubeViews = youtubeRelevant.views ?? youtubeRelevant.impressions ?? 0;
  const xLikes = xRelevant.likes ?? 0;
  const youtubeLikes = youtubeRelevant.likes ?? 0;
  return {
    total: rows.length,
    byPlatform: countByPlatform(rows),
    intent: countTagPrefix(relevantRows, 'intent:'),
    sentiment: countTagPrefix(relevantRows, 'sentiment:'),
    relevantByPlatform: countByPlatform(relevantRows),
    sourceDateRange: sourceDateRange(relevantRows),
    crossSurfaceObserved: {
      xViews,
      youtubeViews,
      knownViews: xViews + youtubeViews,
      xLikes,
      youtubeLikes,
      knownLikes: xLikes + youtubeLikes,
      linkedinViews: null,
      linkedinImpressionsAvailable: false,
      linkedinReactions: linkedInRelevant.reactions ?? 0,
      linkedinComments: linkedInRelevant.comments ?? 0,
      linkedinReposts: linkedInRelevant.reposts ?? 0,
      linkedinEngagementSource:
        'Relevant LinkedIn public post engagement from Apify post search plus prior logged-in/TinyFish card captures; LinkedIn impressions remain unavailable unless rendered on source posts.',
      knownLikesAndLinkedInReactions: xLikes + youtubeLikes + (linkedInRelevant.reactions ?? 0),
    },
    mediaByPlatform: mediaStats(rows),
    metricTotalsByPlatform,
    relevantTotal: relevantRows.length,
    relevanceTiers: {
      core: relevantRows.filter((row) => (row.tags ?? []).includes('relevance:core')).length,
      context: relevantRows.filter((row) => (row.tags ?? []).includes('context:event') || row.isClusterRoot === false).length,
      irrelevant: rows.length - relevantRows.length,
    },
    metricTotalsRelevantByPlatform,
    mediaRelevantByPlatform: mediaStats(relevantRows),
  };
}

function rowDate(row: AnyRecord): string {
  const value = row.postedAt ?? row.capturedAt ?? row.updatedAt;
  const time = typeof value === 'number' ? value : Date.parse(String(value ?? ''));
  return Number.isFinite(time) ? new Date(time).toISOString().slice(0, 10) : 'date-unknown';
}

function normalizedText(text: unknown): string {
  return String(text ?? '')
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function textTokens(text: unknown): Set<string> {
  return new Set(normalizedText(text).split(' ').filter(Boolean));
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  const union = a.size + b.size - intersection;
  return union > 0 ? intersection / union : 0;
}

type SemanticDoc = {
  postId: string;
  text: string;
  platform: string;
  signal: number;
};

type SemanticVector = SemanticDoc & {
  vector: number[];
};

function semanticDocumentText(row: AnyRecord, includeStorySignal = false): string {
  return cleanPromptText(
    [
      row.authorName,
      row.authorHandle,
      row.platform,
      includeStorySignal ? row.primaryStoryId : undefined,
      (row.tags ?? []).filter((tag: string) => !tag.startsWith('story:') && !tag.startsWith('story-type:')).join(' '),
      row.text,
    ].join(' '),
    1400
  );
}

function semanticDocs(
  rows: AnyRecord[],
  options: { maxDocs?: number; includeStorySignal?: boolean } = {}
): SemanticDoc[] {
  const maxDocs = options.maxDocs ?? envNumber('EVENT_RECAP_SEMANTIC_MAX_DOCS', 720, 200, 1600);
  return rows
    .filter((row) => row.rowType === 'parent' && !row.contentDuplicateOf)
    .map((row) => ({
      postId: row.postId,
      text: semanticDocumentText(row, options.includeStorySignal ?? false),
      platform: String(row.platform ?? 'unknown'),
      signal: publicSignal(row),
    }))
    .filter((doc) => doc.text.length >= 40)
    .sort((a, b) => b.signal - a.signal)
    .slice(0, maxDocs)
    .sort((a, b) => a.postId.localeCompare(b.postId));
}

function reduceAndNormalizeVector(vector: number[]): number[] {
  const dims = envNumber('EVENT_RECAP_SEMANTIC_DIMS', 384, 64, 1536);
  const reduced = vector.slice(0, Math.min(dims, vector.length));
  const norm = Math.sqrt(reduced.reduce((sum, value) => sum + value * value, 0)) || 1;
  return reduced.map((value) => value / norm);
}

function dotVector(a: number[], b: number[]): number {
  let sum = 0;
  const length = Math.min(a.length, b.length);
  for (let index = 0; index < length; index += 1) sum += a[index] * b[index];
  return sum;
}

function addVectors(a: number[], b: number[]): void {
  for (let index = 0; index < a.length; index += 1) a[index] += b[index] ?? 0;
}

function normalizedMean(vectors: SemanticVector[], indexes: number[]): number[] {
  const dims = vectors[0]?.vector.length ?? 0;
  const mean = Array.from({ length: dims }, () => 0);
  for (const index of indexes) addVectors(mean, vectors[index].vector);
  const norm = Math.sqrt(mean.reduce((sum, value) => sum + value * value, 0)) || 1;
  return mean.map((value) => value / norm);
}

function semanticCachePath(model: string, docs: SemanticDoc[]): string {
  const hash = crypto
    .createHash('sha256')
    .update(model)
    .update(JSON.stringify(docs.map((doc) => [doc.postId, doc.text])))
    .digest('hex')
    .slice(0, 24);
  return path.join(SEMANTIC_EMBEDDING_CACHE_DIR, `aie2026-embeddings-${hash}.json`);
}

async function fetchOpenAIEmbeddings(docs: SemanticDoc[], model: string): Promise<SemanticVector[]> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error('OPENAI_API_KEY is required for semantic embedding clustering.');
  fs.mkdirSync(SEMANTIC_EMBEDDING_CACHE_DIR, { recursive: true });
  const cachePath = semanticCachePath(model, docs);
  if (fs.existsSync(cachePath)) {
    const cached = readJson<{ model: string; docs: SemanticVector[] }>(cachePath);
    if (cached.model === model && Array.isArray(cached.docs) && cached.docs.length === docs.length) return cached.docs;
  }

  const batchSize = envNumber('EVENT_RECAP_EMBEDDING_BATCH_SIZE', 96, 8, 160);
  const vectors: SemanticVector[] = [];
  for (let index = 0; index < docs.length; index += batchSize) {
    const batch = docs.slice(index, index + batchSize);
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        input: batch.map((doc) => doc.text),
        encoding_format: 'float',
      }),
    });
    const raw = await response.text();
    if (!response.ok) throw new Error(`OpenAI embeddings failed ${response.status}: ${raw.slice(0, 700)}`);
    const decoded = JSON.parse(raw) as AnyRecord;
    const data = [...(decoded.data ?? [])].sort((a: AnyRecord, b: AnyRecord) => Number(a.index) - Number(b.index));
    if (data.length !== batch.length) {
      throw new Error(`OpenAI embeddings returned ${data.length} vectors for ${batch.length} inputs.`);
    }
    for (let offset = 0; offset < batch.length; offset += 1) {
      vectors.push({
        ...batch[offset],
        vector: reduceAndNormalizeVector(data[offset].embedding ?? []),
      });
    }
  }
  fs.writeFileSync(cachePath, JSON.stringify({ model, generatedAt: GENERATED_AT, docs: vectors }, null, 2));
  return vectors;
}

function semanticCandidateCounts(count: number): number[] {
  if (count < 80) return [Math.max(2, Math.min(8, Math.floor(Math.sqrt(count))))];
  const lower = envNumber('EVENT_RECAP_SEMANTIC_MIN_K', 6, 2, 24);
  const upper = Math.min(envNumber('EVENT_RECAP_SEMANTIC_MAX_K', 24, lower, 36), Math.max(lower, Math.ceil(Math.sqrt(count))));
  return Array.from({ length: upper - lower + 1 }, (_, index) => lower + index);
}

function pickSemanticAnchors(vectors: SemanticVector[], k: number): number[] {
  const anchors: number[] = [0];
  while (anchors.length < k && anchors.length < vectors.length) {
    let bestIndex = 0;
    let bestDistance = -Infinity;
    for (let index = 0; index < vectors.length; index += 1) {
      if (anchors.includes(index)) continue;
      const nearest = Math.max(...anchors.map((anchor) => dotVector(vectors[index].vector, vectors[anchor].vector)));
      const distance = 1 - nearest;
      if (distance > bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    }
    anchors.push(bestIndex);
  }
  return anchors;
}

function assignSemanticVectors(vectors: SemanticVector[], centroids: number[][]): number[][] {
  const clusters = centroids.map(() => [] as number[]);
  for (let index = 0; index < vectors.length; index += 1) {
    let bestCluster = 0;
    let bestScore = -Infinity;
    for (let clusterIndex = 0; clusterIndex < centroids.length; clusterIndex += 1) {
      const score = dotVector(vectors[index].vector, centroids[clusterIndex]);
      if (score > bestScore) {
        bestScore = score;
        bestCluster = clusterIndex;
      }
    }
    clusters[bestCluster].push(index);
  }
  return clusters;
}

function fillEmptySemanticClusters(vectors: SemanticVector[], clusters: number[][]): void {
  for (let emptyIndex = 0; emptyIndex < clusters.length; emptyIndex += 1) {
    if (clusters[emptyIndex].length) continue;
    const donorIndex = clusters.reduce(
      (best, cluster, index) => (cluster.length > clusters[best].length ? index : best),
      0
    );
    const moved = clusters[donorIndex].pop();
    if (moved !== undefined) clusters[emptyIndex].push(moved);
  }
}

function kmeansSemantic(vectors: SemanticVector[], k: number): number[][] {
  const anchors = pickSemanticAnchors(vectors, Math.min(k, vectors.length));
  let centroids = anchors.map((index) => vectors[index].vector);
  let clusters = assignSemanticVectors(vectors, centroids);
  fillEmptySemanticClusters(vectors, clusters);
  const iterations = envNumber('EVENT_RECAP_SEMANTIC_ITERATIONS', 7, 2, 20);
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    centroids = clusters.map((cluster, index) => (cluster.length ? normalizedMean(vectors, cluster) : centroids[index]));
    clusters = assignSemanticVectors(vectors, centroids);
    fillEmptySemanticClusters(vectors, clusters);
  }
  return clusters.filter((cluster) => cluster.length > 0);
}

function semanticInertia(vectors: SemanticVector[], clusters: number[][]): number {
  let total = 0;
  let count = 0;
  for (const cluster of clusters) {
    if (!cluster.length) continue;
    const centroid = normalizedMean(vectors, cluster);
    for (const index of cluster) {
      const distance = 1 - dotVector(vectors[index].vector, centroid);
      total += distance * distance;
      count += 1;
    }
  }
  return count ? total / count : 0;
}

function deterministicSample(indexes: number[], limit: number): number[] {
  if (indexes.length <= limit) return indexes;
  const step = indexes.length / limit;
  return Array.from({ length: limit }, (_, index) => indexes[Math.floor(index * step)]).filter(
    (value): value is number => value !== undefined
  );
}

function averageSemanticDistance(vectors: SemanticVector[], sourceIndex: number, targetIndexes: number[]): number {
  const sample = deterministicSample(targetIndexes.filter((index) => index !== sourceIndex), 36);
  if (!sample.length) return 0;
  let total = 0;
  for (const index of sample) total += 1 - dotVector(vectors[sourceIndex].vector, vectors[index].vector);
  return total / sample.length;
}

function semanticSilhouette(vectors: SemanticVector[], clusters: number[][]): number {
  const byIndex = new Map<number, number>();
  clusters.forEach((cluster, clusterIndex) => cluster.forEach((index) => byIndex.set(index, clusterIndex)));
  const sampleIndexes = deterministicSample(
    clusters.flatMap((cluster) => deterministicSample(cluster, 80)),
    envNumber('EVENT_RECAP_SEMANTIC_SILHOUETTE_SAMPLE', 420, 120, 1000)
  );
  if (!sampleIndexes.length) return 0;
  let total = 0;
  for (const index of sampleIndexes) {
    const ownClusterIndex = byIndex.get(index) ?? 0;
    const ownCluster = clusters[ownClusterIndex] ?? [];
    const a = averageSemanticDistance(vectors, index, ownCluster);
    let b = Infinity;
    for (let clusterIndex = 0; clusterIndex < clusters.length; clusterIndex += 1) {
      if (clusterIndex === ownClusterIndex) continue;
      b = Math.min(b, averageSemanticDistance(vectors, index, clusters[clusterIndex]));
    }
    if (!Number.isFinite(b)) b = 0;
    total += b || a ? (b - a) / Math.max(a, b, 0.0001) : 0;
  }
  return total / sampleIndexes.length;
}

function roundSemanticScore(score: AnyRecord): AnyRecord {
  return {
    requestedClusterCount: score.requestedClusterCount,
    clusterCount: score.clusterCount,
    silhouetteScore: Number(score.silhouetteScore.toFixed(4)),
    inertia: Number(score.inertia.toFixed(4)),
    elbowScore: Number(score.elbowScore.toFixed(4)),
    selectionScore: Number(score.selectionScore.toFixed(4)),
    clusterSizeMin: score.clusterSizeMin,
    clusterSizeMedian: score.clusterSizeMedian,
    clusterSizeMax: score.clusterSizeMax,
  };
}

function scoreSemanticCandidate(vectors: SemanticVector[], clusters: number[][], requestedClusterCount: number): AnyRecord {
  const sizes = clusters.map((cluster) => cluster.length).sort((a, b) => a - b);
  return {
    requestedClusterCount,
    clusterCount: clusters.length,
    silhouetteScore: semanticSilhouette(vectors, clusters),
    inertia: semanticInertia(vectors, clusters),
    elbowScore: 0,
    selectionScore: 0,
    clusterSizeMin: sizes[0] ?? 0,
    clusterSizeMedian: sizes.length ? sizes[Math.floor(sizes.length / 2)] : 0,
    clusterSizeMax: sizes.at(-1) ?? 0,
  };
}

function applySemanticElbowScores(items: Array<{ clusters: number[][]; score: AnyRecord }>): Array<{ clusters: number[][]; score: AnyRecord }> {
  if (items.length < 3) return items;
  const ordered = [...items].sort((a, b) => a.score.requestedClusterCount - b.score.requestedClusterCount);
  const first = ordered[0].score;
  const last = ordered[ordered.length - 1].score;
  const xRange = Math.max(1, last.requestedClusterCount - first.requestedClusterCount);
  const yRange = Math.max(0.0001, first.inertia - last.inertia);
  const distances = ordered.map(({ score }) => {
    const x = (score.requestedClusterCount - first.requestedClusterCount) / xRange;
    const y = (score.inertia - last.inertia) / yRange;
    return Math.abs(x + y - 1) / Math.SQRT2;
  });
  const maxDistance = Math.max(0.0001, ...distances);
  return ordered.map((item, index) => ({
    ...item,
    score: {
      ...item.score,
      elbowScore: distances[index] / maxDistance,
    },
  }));
}

function applySemanticSelectionScores(items: Array<{ clusters: number[][]; score: AnyRecord }>): Array<{ clusters: number[][]; score: AnyRecord }> {
  const silhouettes = items.map(({ score }) => score.silhouetteScore);
  const minSilhouette = Math.min(...silhouettes);
  const maxSilhouette = Math.max(...silhouettes);
  const range = Math.max(0.0001, maxSilhouette - minSilhouette);
  return items.map((item) => {
    const normalizedSilhouette = (item.score.silhouetteScore - minSilhouette) / range;
    const assignedCount = item.clusters.reduce((sum, cluster) => sum + cluster.length, 0);
    const largestShare = item.score.clusterSizeMax / Math.max(1, assignedCount);
    const fragmentationPenalty = item.score.clusterSizeMin <= 3 ? 0.08 : 0;
    const imbalancePenalty = largestShare > 0.55 ? 0.06 : 0;
    return {
      ...item,
      score: {
        ...item.score,
        selectionScore:
          item.score.elbowScore * 0.5 +
          normalizedSilhouette * 0.4 +
          Math.min(0.06, Math.log1p(item.score.clusterCount) / 60) -
          fragmentationPenalty -
          imbalancePenalty,
      },
    };
  });
}

function buildSemanticEmbeddingDiagnosticsFromVectors(vectors: SemanticVector[], model: string): AnyRecord {
  if (process.env.EVENT_RECAP_SEMANTIC_CLUSTERING === '0') {
    return { enabled: false, reason: 'semantic clustering disabled' };
  }
  if (vectors.length < 30) return { enabled: false, reason: 'not enough root documents', sampleSize: vectors.length };
  const evaluated = semanticCandidateCounts(vectors.length).map((k) => {
    const clusters = kmeansSemantic(vectors, k);
    return { clusters, score: scoreSemanticCandidate(vectors, clusters, k) };
  });
  const scored = applySemanticSelectionScores(applySemanticElbowScores(evaluated));
  const best = [...scored].sort((a, b) => {
    if (b.score.selectionScore !== a.score.selectionScore) return b.score.selectionScore - a.score.selectionScore;
    if (b.score.silhouetteScore !== a.score.silhouetteScore) return b.score.silhouetteScore - a.score.silhouetteScore;
    return a.score.clusterCount - b.score.clusterCount;
  })[0];
  const bestScore = best?.score ?? {};
  return {
    enabled: true,
    algorithm: 'OpenAI text embeddings with deterministic cosine k-means; k selected by elbow-weighted approximate silhouette',
    selectedBy: 'selectionScore = elbow 0.50 + normalized silhouette 0.40 + small cluster-count bonus - fragmentation/imbalance penalties',
    embeddingModel: model,
    vectorDimensionsUsed: vectors[0]?.vector.length ?? 0,
    documentScope: 'relevant parent/root refs only; comments, replies, and content duplicates excluded',
    sampleSize: vectors.length,
    requestedClusterCount: bestScore.requestedClusterCount,
    clusterCount: bestScore.clusterCount,
    silhouetteScore: Number((bestScore.silhouetteScore ?? 0).toFixed(4)),
    elbowClusterCount: [...scored].sort((a, b) => b.score.elbowScore - a.score.elbowScore)[0]?.score.clusterCount,
    inertia: Number((bestScore.inertia ?? 0).toFixed(4)),
    candidateScores: scored.map(({ score }) => roundSemanticScore(score)).sort((a, b) => a.requestedClusterCount - b.requestedClusterCount),
      clusterSamples: (best?.clusters ?? []).map((cluster, index) => ({
        clusterIndex: index,
        size: cluster.length,
      samplePostIds: deterministicSample(cluster, 8).map((docIndex) => vectors[docIndex].postId),
      platformMix: cluster.reduce<Record<string, number>>((acc, docIndex) => {
        const platform = vectors[docIndex].platform;
        acc[platform] = (acc[platform] ?? 0) + 1;
        return acc;
      }, {}),
    })),
  };
}

async function buildSemanticEmbeddingDiagnostics(rows: AnyRecord[]): Promise<AnyRecord> {
  if (!process.env.OPENAI_API_KEY?.trim()) {
    return { enabled: false, reason: 'OPENAI_API_KEY missing' };
  }
  const docs = semanticDocs(rows);
  const model = process.env.EVENT_RECAP_EMBEDDING_MODEL?.trim() || DEFAULT_OPENAI_EMBEDDING_MODEL;
  const vectors = await fetchOpenAIEmbeddings(docs, model);
  return buildSemanticEmbeddingDiagnosticsFromVectors(vectors, model);
}

function canonicalUrl(url: unknown): string | undefined {
  if (typeof url !== 'string' || !url.trim()) return undefined;
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    if (/^(www\.)?twitter\.com$/i.test(parsed.hostname)) parsed.hostname = 'x.com';
    parsed.hostname = parsed.hostname.toLowerCase();
    if (parsed.pathname !== '/') parsed.pathname = parsed.pathname.replace(/\/+$/, '');
    const keep = new URLSearchParams();
    for (const [key, value] of parsed.searchParams.entries()) {
      if (['commentUrn', 'replyUrn', 'lc', 'v'].includes(key)) keep.append(key, value);
    }
    parsed.search = keep.toString();
    return parsed.toString();
  } catch {
    return url.trim().replace(/\/+$/, '');
  }
}

function extractFromUrl(url: unknown, pattern: RegExp): string | undefined {
  if (typeof url !== 'string') return undefined;
  return url.match(pattern)?.[1];
}

function extractLinkedInCommentIds(url: unknown): { parentActivityId?: string; commentId?: string } {
  if (typeof url !== 'string') return {};
  const decoded = decodeURIComponent(url);
  const parentActivityId =
    decoded.match(/activity[:%3A](\d+)/i)?.[1] ??
    decoded.match(/ugcPost[:%3A](\d+)/i)?.[1] ??
    decoded.match(/activity-(\d+)/i)?.[1];
  const commentId =
    decoded.match(/comment[:%3A]\((?:activity|ugcPost)[:%3A]\d+,\s*(\d+)\)/i)?.[1] ??
    decoded.match(/fsd_comment[:%3A]\((\d+),/i)?.[1];
  return { parentActivityId, commentId };
}

function explicitXParentTag(tags: string[]): string | undefined {
  return tags.find((tag: string) => tag.startsWith('parent:'))?.slice('parent:'.length);
}

function explicitXConversationTag(tags: string[]): string | undefined {
  return tags.find((tag: string) => tag.startsWith('conversation:'))?.slice('conversation:'.length);
}

function xConversationId(row: AnyRecord): string | undefined {
  return row.raw?.tweet?.conversationId ?? row.raw?.conversation_id ?? row.raw?.enrichment?.conversation_id ?? row.raw?.previous?.conversation_id;
}

function xReplyToId(row: AnyRecord): string | undefined {
  return (
    row.raw?.tweet?.inReplyToId ??
    row.raw?.referenced_tweets?.find?.((tweet: AnyRecord) => tweet.type === 'replied_to')?.id ??
    row.raw?.tweet?.referenced_tweets?.find?.((tweet: AnyRecord) => tweet.type === 'replied_to')?.id ??
    row.raw?.enrichment?.referenced_tweets?.find?.((tweet: AnyRecord) => tweet.type === 'replied_to')?.id ??
    row.raw?.previous?.referenced_tweets?.find?.((tweet: AnyRecord) => tweet.type === 'replied_to')?.id ??
    row.raw?.previous?.lookup?.referenced_tweets?.find?.((tweet: AnyRecord) => tweet.type === 'replied_to')?.id
  );
}

const DIRECT_EVENT_ANCHOR_RE =
  /\b(ai\s*engineer|aidotengineer|ai\s*dot\s*engineer|aie\s*(?:sg|singapore|2026)?|#aie2026|singapore|vivian|balakrishnan|nanoclaw|clawcon|65labs|kempinski|pullman|daytona|ai builders? meetup|builder community in singapore|atpinsights|codex workshop|student tickets?)\b/i;

function isDetachedXConversationExpansion(row: AnyRecord): boolean {
  if (row.platform !== 'x' || inferRowType(row) === 'parent') return false;
  const tags: string[] = (row.tags ?? []).map((tag: unknown) => String(tag));
  const ids = nativeIds(row, inferRowType(row));
  const conversationId = xConversationId(row);
  return Boolean(ids.xTweetId && conversationId && String(ids.xTweetId) === String(conversationId) && !xReplyToId(row) && explicitXParentTag(tags));
}

function sidecarConversationRejectReason(row: AnyRecord): string | undefined {
  if (isDetachedXConversationExpansion(row) && !DIRECT_EVENT_ANCHOR_RE.test(String(row.text ?? ''))) {
    return 'detached_x_conversation_expansion_without_direct_event_anchor';
  }
  return undefined;
}

function nativeIds(row: AnyRecord, rowType: string): NativeIds {
  const tags: string[] = (row.tags ?? []).map((tag: unknown) => String(tag));
  const xTweetId =
    row.platform === 'x'
      ? row.raw?.tweet?.id ??
        row.raw?.id ??
        row.raw?.enrichment?.id ??
        row.raw?.previous?.id ??
        row.raw?.previous?.lookup?.id ??
        extractFromUrl(row.url, /\/status\/(\d+)/) ??
        String(row.postId ?? '').match(/^x:(\d+)$/)?.[1]
      : undefined;

  const parentX =
    row.platform === 'x' && rowType !== 'parent'
      ? xReplyToId(row) ??
        explicitXParentTag(tags) ??
        explicitXConversationTag(tags) ??
        (xConversationId(row) && String(xConversationId(row)) !== String(xTweetId) ? xConversationId(row) : undefined)
      : undefined;

  const linkedInUrlIds = row.platform === 'linkedin' ? extractLinkedInCommentIds(row.url) : {};
  const linkedinCommentId =
    row.platform === 'linkedin' && row.raw?.type === 'comment'
      ? String(row.raw?.id ?? linkedInUrlIds.commentId ?? '')
      : row.platform === 'linkedin'
        ? linkedInUrlIds.commentId
        : undefined;
  const linkedinActivityId =
    row.platform === 'linkedin'
      ? row.raw?.type === 'comment'
        ? String(row.raw?.postId ?? linkedInUrlIds.parentActivityId ?? '').replace(/^urn:li:activity:/, '')
        : String(
            row.raw?.id ??
              row.raw?.entityId ??
              extractFromUrl(row.url, /activity[:/-](\d+)/i) ??
              extractFromUrl(row.raw?.linkedinUrl, /activity-(\d+)/i) ??
              linkedInUrlIds.parentActivityId ??
              ''
          )
      : undefined;

  const youtubeVideoId =
    row.platform === 'youtube'
      ? row.raw?.video?.id ??
        row.raw?.comment?.snippet?.videoId ??
        row.raw?.parentVideo?.postId?.replace(/^youtube:/, '') ??
        extractFromUrl(row.url, /[?&]v=([^&]+)/) ??
        String(row.postId ?? '').match(/^youtube:([^:]+)$/)?.[1] ??
        tags.find((tag: string) => tag.startsWith('parent-video:'))?.slice('parent-video:'.length)
      : undefined;
  const youtubeCommentId =
    row.platform === 'youtube'
      ? row.raw?.comment?.id ??
        extractFromUrl(row.url, /[?&]lc=([^&]+)/) ??
        String(row.postId ?? '').match(/^youtube-comment(?:-reply)?:([^:]+)$/)?.[1]
      : undefined;

  const parentLinkedIn = row.platform === 'linkedin' && rowType !== 'parent' && linkedinActivityId ? linkedinActivityId : undefined;
  const parentYouTube = row.platform === 'youtube' && rowType !== 'parent' && youtubeVideoId ? youtubeVideoId : undefined;

  return {
    xTweetId: xTweetId ? String(xTweetId) : undefined,
    linkedinActivityId: linkedinActivityId ? String(linkedinActivityId) : undefined,
    linkedinCommentId: linkedinCommentId ? String(linkedinCommentId) : undefined,
    youtubeVideoId: youtubeVideoId ? String(youtubeVideoId) : undefined,
    youtubeCommentId: youtubeCommentId ? String(youtubeCommentId) : undefined,
    parentNativeKey: parentX
      ? `x:tweet:${parentX}`
      : parentLinkedIn
        ? `linkedin:activity:${parentLinkedIn}`
        : parentYouTube
          ? `youtube:video:${parentYouTube}`
          : undefined,
  };
}

function inferRowType(row: AnyRecord): 'parent' | 'comment' | 'reply' {
  const tags = (row.tags ?? []).map((tag: string) => tag.toLowerCase());
  if (tags.includes('x-reply')) return 'reply';
  if (tags.includes('youtube-comment-reply')) return 'reply';
  if (tags.includes('linkedin-comment') || tags.includes('youtube-comment') || tags.includes('comment')) return 'comment';
  if (row.raw?.type === 'comment') return 'comment';
  if (row.platform === 'youtube' && String(row.url ?? '').includes('&lc=')) return 'comment';
  return 'parent';
}

function nativeKey(row: AnyRecord, ids: NativeIds, rowType: string): string | undefined {
  if (row.platform === 'x' && ids.xTweetId) return `x:tweet:${ids.xTweetId}`;
  if (row.platform === 'linkedin') {
    if (rowType !== 'parent' && ids.linkedinCommentId) return `linkedin:comment:${ids.linkedinCommentId}`;
    if (ids.linkedinActivityId) return `linkedin:activity:${ids.linkedinActivityId}`;
  }
  if (row.platform === 'youtube') {
    if (rowType !== 'parent' && ids.youtubeCommentId) return `youtube:comment:${ids.youtubeCommentId}`;
    if (ids.youtubeVideoId) return `youtube:video:${ids.youtubeVideoId}`;
  }
  return undefined;
}

function rawCommentsCount(row: AnyRecord): number {
  return Array.isArray(row.raw?.comments) ? row.raw.comments.length : 0;
}

function stripOrMarkRawComments(row: AnyRecord): AnyRecord {
  const next = clone(row);
  if (Array.isArray(next.raw?.comments)) {
    next.raw.commentsRawProvenance = next.raw.comments;
    next.raw.commentsRawProvenanceOnly = true;
    next.raw.commentsRawProvenanceCount = next.raw.comments.length;
    delete next.raw.comments;
    next.rawCommentsProvenanceOnly = true;
    next.nestedRawCommentCount = next.raw.commentsRawProvenanceCount;
  }
  return next;
}

function normalizeRow(row: AnyRecord, sourceKind: string, decision?: AnyRecord): AnyRecord {
  const rowType = inferRowType(row);
  const ids = nativeIds(row, rowType);
  const key = nativeKey(row, ids, rowType);
  let tags = [...(row.tags ?? [])].map((tag) => String(tag));
  tags = removeTags(tags, ['story:', 'story-type:']);

  if (sourceKind !== 'archive') {
    tags = addTag(tags, 'relevant:event');
    tags = addTag(tags, 'delta-refresh:2026-05-27');
  }
  if (sourceKind === 'recovered-parent') {
    tags = addTag(tags, 'recovered-parent');
    tags = addTag(tags, 'relevance:core');
  }
  if (decision?.humanDecision === 'include') {
    tags = addTag(tags, `human-review:${decision.relevanceClass}`);
    if (decision.rootRecommendation === 'secondary_ref_not_primary_root') {
      tags = addTag(tags, 'context:event');
      tags = addTag(tags, 'relevance:context');
    } else if (!tags.some((tag) => tag.startsWith('relevance:'))) {
      tags = addTag(tags, 'relevance:core');
    }
  }
  if (rowType !== 'parent') {
    tags = addTag(addTag(tags, 'conversation'), rowType === 'reply' ? 'reply' : 'comment');
  }

  const normalized = stripOrMarkRawComments({
    ...row,
    tags,
    rowType,
    canonicalKey: key ?? canonicalUrl(row.url) ?? `${row.platform}:${row.postId}`,
    canonicalUrl: canonicalUrl(row.url),
    xTweetId: ids.xTweetId,
    linkedinActivityId: ids.linkedinActivityId,
    linkedinCommentId: ids.linkedinCommentId,
    youtubeVideoId: ids.youtubeVideoId,
    youtubeCommentId: ids.youtubeCommentId,
    parentNativeKey: ids.parentNativeKey,
    rootPostId: rowType === 'parent' ? row.postId : undefined,
    isClusterRoot: rowType === 'parent' && !tags.some((tag) => tag.toLowerCase() === 'context:event'),
    storyType: undefined,
    primaryStoryId: undefined,
    storyMentions: undefined,
    mergeSource: sourceKind,
  });

  if (sourceKind === 'recovered-parent') {
    normalized.metricsRefresh = normalized.metricsRefresh ?? {
      provider: 'parent-recovery-source-file',
      status: 'stale_recovered_parent_not_refreshed',
      previousMetrics: normalized.metrics ?? {},
      updatedMetrics: normalized.metrics ?? {},
      delta: {},
      note: 'Parent was recovered only to attach orphan comments; metrics were preserved from the source row and not marked as freshly updated.',
    };
  }

  return normalized;
}

function findRecoveredParent(parent: AnyRecord): AnyRecord {
  const sourceFile = path.resolve(process.cwd(), parent.sourceFile);
  const rows = readJson<AnyRecord[]>(sourceFile);
  const activityId = String(parent.url ?? '').match(/activity:(\d+)/)?.[1] ?? String(parent.url ?? '').match(/activity-(\d+)/)?.[1];
  const found = rows.find((row) => {
    const ids = nativeIds(row, inferRowType(row));
    return ids.linkedinActivityId === activityId || row.postId === parent.postId || canonicalUrl(row.url) === canonicalUrl(parent.url);
  });
  if (!found) throw new Error(`Recovered parent not found in ${parent.sourceFile}: ${parent.url}`);
  return found;
}

function mediaPath(localPath: unknown): string | undefined {
  if (typeof localPath !== 'string') return undefined;
  if (localPath.startsWith('outputs/')) return localPath.slice('outputs/'.length);
  const marker = `${path.sep}outputs${path.sep}`;
  const index = localPath.indexOf(marker);
  if (index === -1) return undefined;
  return localPath.slice(index + marker.length).split(path.sep).join('/');
}

function mediaAbsolutePath(localPath: unknown): string | undefined {
  if (typeof localPath !== 'string') return undefined;
  const absolute = path.isAbsolute(localPath) ? localPath : path.resolve(process.cwd(), localPath);
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) return undefined;
  return absolute;
}

function fileHashMaybe(localPath: unknown): string | undefined {
  const absolute = mediaAbsolutePath(localPath);
  if (!absolute) return undefined;
  return crypto.createHash('sha256').update(fs.readFileSync(absolute)).digest('hex');
}

function extensionForMedia(item: AnyRecord, absolutePath: string): string {
  const existing = path.extname(absolutePath).toLowerCase();
  if (existing) return existing;
  const contentType = String(item.contentType ?? '').toLowerCase();
  if (contentType.includes('png')) return '.png';
  if (contentType.includes('webp')) return '.webp';
  if (contentType.includes('gif')) return '.gif';
  if (contentType.includes('mp4')) return '.mp4';
  if (contentType.includes('quicktime')) return '.mov';
  if (contentType.includes('webm')) return '.webm';
  return '.jpg';
}

function safeMediaSegment(value: unknown): string {
  return String(value ?? 'unknown').toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'unknown';
}

function publicMediaPath(item: AnyRecord, post: AnyRecord): { path?: string; hash?: string; copied: boolean } {
  const original = mediaPath(item.localPath);
  const absolute = mediaAbsolutePath(item.localPath);
  if (!absolute) return { path: original, copied: false };

  const hash = fileHashMaybe(absolute);
  if (original?.startsWith(PUBLIC_MEDIA_PREFIX)) return { path: original, hash, copied: false };
  if (!hash) return { path: original, copied: false };

  const platform = safeMediaSegment(post.platform ?? item.source);
  const extension = extensionForMedia(item, absolute);
  const relative = path.posix.join(PUBLIC_MEDIA_PREFIX, 'refreshes', REFRESH_ID, platform, `${hash.slice(0, 24)}${extension}`);
  const destination = path.resolve(process.cwd(), 'outputs', ...relative.split('/'));
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  if (!fs.existsSync(destination)) fs.copyFileSync(absolute, destination);
  return { path: relative, hash, copied: true };
}

async function trimPost(post: AnyRecord): Promise<AnyRecord> {
  const includeMedia = post.rowType === 'parent' && post.isClusterRoot !== false;
  const media = includeMedia
    ? (post.media ?? []).map((item: AnyRecord) => {
        const local = publicMediaPath(item, post);
        return {
          url: item.url,
          type: item.type,
          source: item.source,
          previewUrl: item.previewUrl,
          altText: item.altText,
          width: item.width,
          height: item.height,
          contentType: item.contentType,
          bytes: item.bytes,
          downloadedAt: item.downloadedAt,
          path: local.path,
          hash: local.hash,
        };
      })
    : [];

  return {
    postId: post.postId,
    platform: post.platform,
    url: post.url,
    authorName: bestDisplayAuthorName(post),
    authorHandle: post.authorHandle,
    authorUrl: post.authorUrl,
    text: post.text,
    postedAt: post.postedAt,
    capturedAt: post.capturedAt,
    updatedAt: post.updatedAt,
    reachScore: post.reachScore,
    metrics: post.metrics ?? {},
    metricsUpdatedAt: post.metricsUpdatedAt,
    metricsRefresh: post.metricsRefresh,
    tags: post.tags ?? [],
    rowType: post.rowType,
    canonicalKey: post.canonicalKey,
    canonicalUrl: post.canonicalUrl,
    xTweetId: post.xTweetId,
    linkedinActivityId: post.linkedinActivityId,
    linkedinCommentId: post.linkedinCommentId,
    youtubeVideoId: post.youtubeVideoId,
    youtubeCommentId: post.youtubeCommentId,
    parentPostId: post.parentPostId,
    rootPostId: post.rootPostId,
    isClusterRoot: Boolean(post.isClusterRoot),
    contentDuplicateOf: post.contentDuplicateOf,
    isReply: post.rowType !== 'parent',
    storyType: post.storyType,
    primaryStoryId: post.primaryStoryId,
    storyMentions: post.storyMentions ?? [],
    media,
  };
}

function clusterCoverage(posts: AnyRecord[], themes: AnyRecord[]): AnyRecord {
  const postIds = new Set(posts.map((post) => post.postId).filter(Boolean));
  const clusteredIds = new Set<string>();
  const rootIds = new Set<string>();
  const attachedIds = new Set<string>();
  for (const theme of themes) {
    for (const postId of theme.postIds ?? []) if (postIds.has(postId)) clusteredIds.add(postId);
    for (const postId of theme.rootPostIds ?? []) if (postIds.has(postId)) rootIds.add(postId);
    for (const postId of theme.attachedPostIds ?? []) if (postIds.has(postId)) attachedIds.add(postId);
  }
  const unclusteredByPlatform: Record<string, number> = {};
  for (const post of posts) {
    if (clusteredIds.has(post.postId)) continue;
    unclusteredByPlatform[post.platform] = (unclusteredByPlatform[post.platform] ?? 0) + 1;
  }
  return {
    totalRefs: posts.length,
    clusteredRefs: clusteredIds.size,
    rootRefs: rootIds.size || clusteredIds.size,
    attachedRefs: attachedIds.size,
    unclusteredRefs: Math.max(0, posts.length - clusteredIds.size),
    unclusteredByPlatform,
  };
}

function sourceLinks(archive: AnyRecord): AnyRecord[] {
  const byUrl = new Map<string, AnyRecord>();
  for (const entry of archive.enrichment ?? []) {
    for (const source of entry.sourceSurfaces ?? []) {
      if (!source?.url || byUrl.has(source.url)) continue;
      byUrl.set(source.url, {
        platform: source.platform,
        url: source.url,
        label: source.label,
        note: source.note,
      });
    }
  }
  return Array.from(byUrl.values());
}

function groupBy<T>(items: T[], keyFn: (item: T) => string | undefined): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    if (!key) continue;
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }
  return groups;
}

function platformCounts(rows: AnyRecord[]): Record<string, number> {
  return rows.reduce((acc, row) => {
    acc[row.platform] = (acc[row.platform] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);
}

function rowTypeCounts(rows: AnyRecord[]): Record<string, number> {
  return rows.reduce((acc, row) => {
    acc[row.rowType] = (acc[row.rowType] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);
}

function buildSoftDuplicateGroups(rows: AnyRecord[]): AnyRecord[] {
  const threshold = 0.95;
  const candidates = rows
    .filter(isRelevant)
    .map((row) => ({
      row,
      text: normalizedText(row.text),
      tokens: textTokens(row.text),
    }))
    .filter((item) => item.text.length >= 24);

  const buckets = groupBy(candidates, (item) =>
    [
      item.row.platform,
      String(item.row.authorHandle ?? item.row.authorName ?? '').toLowerCase(),
      rowDate(item.row),
    ].join('|')
  );

  const groups: AnyRecord[] = [];
  for (const [bucketKey, bucket] of buckets.entries()) {
    if (bucket.length < 2) continue;

    const parents = Array.from({ length: bucket.length }, (_, index) => index);
    const find = (index: number): number => {
      if (parents[index] === index) return index;
      parents[index] = find(parents[index]);
      return parents[index];
    };
    const union = (left: number, right: number): void => {
      const leftRoot = find(left);
      const rightRoot = find(right);
      if (leftRoot !== rightRoot) parents[rightRoot] = leftRoot;
    };

    for (let left = 0; left < bucket.length; left += 1) {
      for (let right = left + 1; right < bucket.length; right += 1) {
        if (jaccardSimilarity(bucket[left].tokens, bucket[right].tokens) >= threshold) union(left, right);
      }
    }

    const components = new Map<number, typeof bucket>();
    for (let index = 0; index < bucket.length; index += 1) {
      const root = find(index);
      const component = components.get(root) ?? [];
      component.push(bucket[index]);
      components.set(root, component);
    }

    for (const component of components.values()) {
      if (component.length < 2) continue;
      const sorted = component.map((item) => item.row).sort((a, b) => {
        const scoreDelta = Number(b.reachScore ?? 0) - Number(a.reachScore ?? 0);
        if (scoreDelta) return scoreDelta;
        const engagementDelta = metricEngagement(b.metrics) - metricEngagement(a.metrics);
        if (engagementDelta) return engagementDelta;
        return String(a.postId).localeCompare(String(b.postId));
      });
      groups.push({
        key: `${bucketKey}|near:${hashValue(component.map((item) => item.text)).slice(0, 12)}`,
        bucketKey,
        match: 'same platform + author + date + >=0.95 token Jaccard normalized text',
        similarityThreshold: threshold,
        canonicalPostId: sorted[0].postId,
        rows: sorted.map((row) => row.postId),
      });
    }
  }

  return groups;
}

const STRICT_X_EVENT_ANCHOR_RE =
  /\b(ai\s*engineer\s*(?:singapore|sg)|ai engineer summit singapore|ai\.engineer[\/\s]+singapore|aidotengineer|aie\s*(?:sg|singapore|2026)|road to aie|road to ai engineer|#(?:aiengineersingapore|aiengineersg|aiesg|aie2026)|ralphthon(?:sg|@sg)?|clawcon(?:\s+singapore)?|openclaw\s+singapore|openclawsg|vivian|balakrishnan|nanoclaw|codex workshop|65labs|capitol|kempinski|pullman)\b/i;

const REQUIRED_ANCHORED_QUERIES = [
  '"RalphthonSG"',
  '"ClawCon Singapore"',
  '"OpenClaw Singapore"',
  '"@clawcon"',
  '"@openclawsg"',
  '"AI Engineer Singapore Ralphthon"',
  '"AI Engineer Singapore ClawCon"',
];

const WATCHED_ENTITIES = [
  { id: 'ralphthon', label: 'Ralphthon', patterns: [/\bralphthon(?:sg|@sg)?\b/i, /\bralph\s+loop\b/i] },
  { id: 'clawcon', label: 'ClawCon', patterns: [/\bclawcon(?:\s+singapore)?\b/i, /@clawcon\b/i] },
  { id: 'openclaw', label: 'OpenClaw', patterns: [/\bopenclaw(?:\s+singapore)?\b/i, /@openclawsg\b/i] },
  { id: 'aws', label: 'AWS', patterns: [/\baws\b/i, /\bamazon\s+web\s+services\b/i] },
  { id: 'jupiter-hq', label: 'Jupiter HQ', patterns: [/\bjupiter\s+hq\b/i] },
  { id: 'codex', label: 'Codex', patterns: [/\bcodex\b/i, /\bopenai\s+codex\b/i] },
];

const SUPPORT_TERMS = [
  { label: 'agent-coding', patterns: [/\bagent[-\s]?coding\b/i, /\bcoding agents?\b/i] },
  { label: 'demos', patterns: [/\bdemos?\b/i, /\bdemo night\b/i] },
  { label: 'prizes', patterns: [/\bprizes?\b/i, /\bcash prizes?\b/i, /\btrack prizes?\b/i] },
  { label: 'winners', patterns: [/\bwinners?\b/i, /\bwon\b/i, /\bwinning\b/i] },
  { label: 'lobster rule', patterns: [/\blobster rule\b/i] },
  { label: 'RalphthonSG', patterns: [/\bralphthonsg\b/i, /\bralphthon@sg\b/i] },
  { label: 'personal AI', patterns: [/\bpersonal ai\b/i, /\bpersonal agents?\b/i] },
  { label: 'Jupiter HQ', patterns: [/\bjupiter\s+hq\b/i] },
  { label: 'AWS room', patterns: [/\baws\b/i] },
  { label: 'Road to AIE', patterns: [/\broad to (?:aie|ai engineer)\b/i] },
];

function sourceText(row: AnyRecord): string {
  return `${row.text ?? ''} ${row.authorName ?? ''} ${row.authorHandle ?? ''} ${row.url ?? ''} ${(row.tags ?? []).join(' ')}`;
}

function rowTimestamp(row: AnyRecord): number | undefined {
  const value = row.postedAt ?? row.raw?.postedAt ?? row.raw?.published_date ?? row.capturedAt;
  const time = typeof value === 'number' ? value : Date.parse(String(value ?? ''));
  return Number.isFinite(time) && time > 0 ? time : undefined;
}

function rowInWindow(row: AnyRecord, start: unknown, end: unknown): boolean {
  const time = rowTimestamp(row);
  const startTime = Date.parse(String(start ?? ''));
  const endTime = Date.parse(String(end ?? ''));
  if (!time || !Number.isFinite(startTime) || !Number.isFinite(endTime)) return true;
  const padMs = 36 * 60 * 60 * 1000;
  return time >= startTime - padMs && time <= endTime + padMs;
}

function rowQueries(row: AnyRecord): string[] {
  const out: string[] = [];
  for (const tag of row.tags ?? []) {
    const value = String(tag);
    if (value.startsWith('query:')) out.push(value.slice('query:'.length));
  }
  for (const value of [
    row.query,
    row.raw?.query,
    row.raw?.query?.q,
    row.raw?.query?.search,
    row.raw?.search,
    row.raw?.searchTitle,
    row.raw?.searchSnippet,
  ]) {
    if (typeof value === 'string') out.push(value);
    else if (value && typeof value === 'object') out.push(JSON.stringify(value));
  }
  return Array.from(new Set(out.map((value) => value.trim()).filter(Boolean)));
}

function isBroadXQuery(query: string): boolean {
  const lower = query.toLowerCase();
  const exactAnchor =
    /ralphthonsg|clawcon singapore|openclaw singapore|@clawcon|@openclawsg|ai engineer singapore ralphthon|ai engineer singapore clawcon/.test(
      lower
    );
  if (exactAnchor) return false;
  if (/\b(ai|singapore|openclaw|personal ai)\b/.test(lower) && !/"[^"]{4,}"/.test(query)) return true;
  return /\b(ai engineer|aie|openclaw)\b/.test(lower) && /\bOR\b/.test(query);
}

function isGenericOpenClawWithoutEventEvidence(text: string): boolean {
  return /\bopenclaw\b/i.test(text) && !/\b(clawcon|road to aie|road to ai engineer|ai engineer singapore|aie singapore|singapore|jupiter hq)\b/i.test(text);
}

function strictXDeltaRejectReason(row: AnyRecord, archive: AnyRecord): string | undefined {
  if (row.platform !== 'x') return undefined;
  const text = sourceText(row);
  if (!rowInWindow(row, archive.windowStart, archive.windowEnd)) return 'x_delta_outside_event_window';
  if (isGenericOpenClawWithoutEventEvidence(text)) return 'x_delta_generic_openclaw_without_event_evidence';
  if (!STRICT_X_EVENT_ANCHOR_RE.test(text)) return 'x_delta_without_concrete_event_anchor';

  const broadQueries = rowQueries(row).filter(isBroadXQuery);
  if (broadQueries.length && !STRICT_X_EVENT_ANCHOR_RE.test(text.replace(/\bSingapore\b/gi, ''))) {
    return 'x_delta_broad_query_without_non_generic_event_anchor';
  }
  return undefined;
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

function postContainsPattern(row: AnyRecord, patterns: RegExp[]): boolean {
  const text = sourceText(row);
  return patterns.some((pattern) => pattern.test(text));
}

function watchedEntityCounts(rows: AnyRecord[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const entity of WATCHED_ENTITIES) {
    counts[entity.id] = rows.filter((row) => postContainsPattern(row, entity.patterns)).length;
  }
  return counts;
}

function supportTerms(rows: AnyRecord[]): string[] {
  return SUPPORT_TERMS.filter((term) => rows.some((row) => postContainsPattern(row, term.patterns))).map((term) => term.label);
}

function topEvidenceAuthors(rows: AnyRecord[]): string[] {
  return rows
    .slice()
    .sort((a, b) => Number(b.reachScore ?? 0) - Number(a.reachScore ?? 0))
    .slice(0, 4)
    .map((row) => row.authorHandle ?? row.authorName)
    .filter(Boolean);
}

function themeRows(theme: AnyRecord, postsById: Map<string, AnyRecord>, ids: string[] | undefined): AnyRecord[] {
  return (ids ?? [])
    .map((postId) => postsById.get(postId))
    .filter((row: AnyRecord | undefined): row is AnyRecord => Boolean(row));
}

function extractNamedEntities(text: string): string[] {
  const generic = new Set([
    'AI',
    'AIE',
    'Singapore',
    'Engineer',
    'Engineers',
    'Event',
    'Road',
    'LinkedIn',
    'YouTube',
    'X',
    'Evidence',
    'Top',
    'Refs',
  ]);
  const watched = WATCHED_ENTITIES.filter((entity) => entity.patterns.some((pattern) => pattern.test(text))).map((entity) => entity.label);
  const capitalized =
    text.match(/\b[A-Z][A-Za-z0-9+&-]{2,}(?:\s+[A-Z][A-Za-z0-9+&-]{2,}){0,2}\b/g) ?? [];
  const cleaned = capitalized
    .map((value) => value.trim().replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '').replace(/\s+/g, ' '))
    .filter((value) => value.length >= 3 && value.length <= 48 && !generic.has(value));
  return uniqueStrings([...watched, ...cleaned]).slice(0, 20);
}

function topEntitiesForRows(rows: AnyRecord[], limit = 12): Array<{ entity: string; refs: number }> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    for (const entity of extractNamedEntities(sourceText(row))) {
      counts.set(entity, (counts.get(entity) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([entity, refs]) => ({ entity, refs }));
}

function entitySupportedByRows(entity: string, rows: AnyRecord[]): boolean {
  const watched = WATCHED_ENTITIES.find((item) => item.label.toLowerCase() === entity.toLowerCase());
  if (watched) return rows.some((row) => postContainsPattern(row, watched.patterns));
  const support = SUPPORT_TERMS.find((item) => item.label.toLowerCase() === entity.toLowerCase());
  if (support) return rows.some((row) => postContainsPattern(row, support.patterns));
  return rows.some((row) => sourceText(row).toLowerCase().includes(entity.toLowerCase()));
}

function buildSenseCheckAudit(input: {
  refreshId: string;
  posts: AnyRecord[];
  themes: AnyRecord[];
  storyDiagnosticPosts: AnyRecord[];
}): AnyRecord {
  const postsById = new Map(input.posts.map((post) => [post.postId, post]));
  const rootAttachedCounts = input.themes.map((theme) => ({
    themeId: theme.themeId,
    label: theme.label,
    rootRefs: (theme.rootPostIds ?? []).length,
    attachedRefs: (theme.attachedPostIds ?? []).length,
    totalRefs: (theme.postIds ?? []).length,
  }));

  const topEntitiesPerCluster = input.themes.map((theme) => {
    const rows = themeRows(theme, postsById, theme.postIds);
    return {
      themeId: theme.themeId,
      label: theme.label,
      topEntities: topEntitiesForRows(rows),
    };
  });

  const entitySpread = WATCHED_ENTITIES.map((entity) => {
    const clusters = input.themes
      .map((theme) => {
        const rootRows = themeRows(theme, postsById, theme.rootPostIds ?? theme.postIds);
        const attachedRows = themeRows(theme, postsById, theme.attachedPostIds ?? []);
        const rows = [...rootRows, ...attachedRows];
        const matching = rows.filter((row) => postContainsPattern(row, entity.patterns));
        return {
          themeId: theme.themeId,
          label: theme.label,
          refs: matching.length,
          rootRefs: rootRows.filter((row) => postContainsPattern(row, entity.patterns)).length,
          attachedRefs: attachedRows.filter((row) => postContainsPattern(row, entity.patterns)).length,
          platforms: platformCounts(matching),
        };
      })
      .filter((item) => item.refs > 0)
      .sort((a, b) => b.refs - a.refs || b.rootRefs - a.rootRefs);
    return {
      entity: entity.label,
      totalRefs: clusters.reduce((sum, cluster) => sum + cluster.refs, 0),
      primaryCluster: clusters[0] ?? null,
      clusters,
    };
  });

  const lowConfidencePrimaryAssignments = input.storyDiagnosticPosts
    .map((post) => {
      const primary = (post.storyMentions ?? []).find((mention: AnyRecord) => mention.role === 'primary');
      return { post, primary };
    })
    .filter(({ primary }) => !primary || Number(primary.confidence ?? 0) < 0.55)
    .slice(0, 120)
    .map(({ post, primary }) => ({
      postId: post.postId,
      platform: post.platform,
      primaryStoryId: post.primaryStoryId,
      confidence: primary?.confidence ?? null,
      authorName: post.authorName,
      url: post.url,
      text: String(post.text ?? '').slice(0, 260),
    }));

  const entityThemeMentions = new Map<string, Array<{ themeId: string; label: string }>>();
  for (const theme of input.themes) {
    for (const entity of extractNamedEntities(`${theme.label} ${theme.summary}`)) {
      const group = entityThemeMentions.get(entity) ?? [];
      group.push({ themeId: theme.themeId, label: theme.label });
      entityThemeMentions.set(entity, group);
    }
  }
  const duplicatedEntitiesInLabelsSummaries = Array.from(entityThemeMentions.entries())
    .filter(([, themes]) => new Set(themes.map((theme) => theme.themeId)).size > 1)
    .map(([entity, themes]) => ({ entity, themes }));

  const summaryTermsNotSupportedByPrimaryMembers = input.themes.flatMap((theme) => {
    const rootRows = themeRows(theme, postsById, theme.rootPostIds ?? theme.postIds);
    const entities = extractNamedEntities(`${theme.label} ${theme.summary}`);
    return entities
      .filter((entity) => !entitySupportedByRows(entity, rootRows))
      .map((entity) => ({
        themeId: theme.themeId,
        label: theme.label,
        entity,
        rootRefsChecked: rootRows.length,
      }));
  });

  return {
    generatedAt: GENERATED_AT,
    refreshId: input.refreshId,
    entitySpread,
    topEntitiesPerCluster,
    lowConfidencePrimaryAssignments,
    duplicatedEntitiesInLabelsSummaries,
    summaryTermsNotSupportedByPrimaryMembers,
    rootAttachedCounts,
  };
}

function buildQueryExpansionGuard(input: {
  archive: AnyRecord;
  sidecar: AnyRecord[];
  humanExcludedPostIds: Set<string>;
  eventScopeRejects: Array<{ row: AnyRecord; reason: string }>;
  conversationRejects: Array<{ row: AnyRecord; reason: string }>;
  strictXRejects: Array<{ row: AnyRecord; reason: string }>;
}): AnyRecord {
  const xRows = input.sidecar.filter((row) => row.platform === 'x');
  const broadQueryCounts = new Map<string, { total: number; includedAfterGuard: number; rejected: number }>();
  const rejectedIds = new Set([
    ...Array.from(input.humanExcludedPostIds),
    ...input.eventScopeRejects.map((item) => item.row.postId),
    ...input.conversationRejects.map((item) => item.row.postId),
    ...input.strictXRejects.map((item) => item.row.postId),
  ]);
  for (const row of xRows) {
    for (const query of rowQueries(row).filter(isBroadXQuery)) {
      const current = broadQueryCounts.get(query) ?? { total: 0, includedAfterGuard: 0, rejected: 0 };
      current.total += 1;
      if (rejectedIds.has(row.postId)) current.rejected += 1;
      else current.includedAfterGuard += 1;
      broadQueryCounts.set(query, current);
    }
  }
  return {
    generatedAt: GENERATED_AT,
    refreshId: REFRESH_ID,
    policy: {
      broadXQueryIncludedRowCap: 25,
      requiresEventWindow: true,
      requiresConcreteEventAnchor: true,
      recommendedExactQueries: REQUIRED_ANCHORED_QUERIES,
      exclusionRule:
        'Generic AI/Singapore/OpenClaw X rows are excluded unless their own row text, author, URL, or tags carry concrete AIE, Road-to-AIE, ClawCon, Ralphthon, Vivian/NanoClaw, Codex workshop, 65labs, or venue evidence inside the event window.',
    },
    sidecarXRows: xRows.length,
    broadXQueries: Array.from(broadQueryCounts.entries()).map(([query, counts]) => ({
      query,
      ...counts,
      overCap: counts.includedAfterGuard > 25,
    })),
    strictXRejectedRows: input.strictXRejects.map(({ row, reason }) => ({
      postId: row.postId,
      url: row.url,
      authorHandle: row.authorHandle,
      reason,
      queries: rowQueries(row),
      postedAt: row.postedAt ?? row.raw?.postedAt ?? row.raw?.published_date,
      text: String(row.text ?? '').slice(0, 320),
    })),
    eventScopeRejectedRows: input.eventScopeRejects.map(({ row, reason }) => ({
      postId: row.postId,
      platform: row.platform,
      url: row.url,
      authorName: row.authorName,
      authorHandle: row.authorHandle,
      youtubeVideoId: aie2026YoutubeVideoId(row),
      reason,
      tags: row.tags ?? [],
      text: String(row.text ?? '').slice(0, 320),
    })),
    conversationGuardRejectedRows: input.conversationRejects.map(({ row, reason }) => ({
      postId: row.postId,
      url: row.url,
      authorHandle: row.authorHandle,
      reason,
      text: String(row.text ?? '').slice(0, 240),
    })),
  };
}

function numericDelta(candidate: unknown, baseline: unknown): number | undefined {
  const left = Number(candidate);
  const right = Number(baseline);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return undefined;
  return left - right;
}

function buildBaselineComparison(input: {
  baselinePublic: AnyRecord;
  candidatePublic: AnyRecord;
  senseCheck: AnyRecord;
  queryGuard: AnyRecord;
}): AnyRecord {
  const baselineStats = input.baselinePublic.stats ?? {};
  const candidateStats = input.candidatePublic.stats ?? {};
  const watchedLanding = Object.fromEntries(
    (input.senseCheck.entitySpread ?? []).map((item: AnyRecord) => [
      item.entity,
      {
        totalRefs: item.totalRefs,
        primaryCluster: item.primaryCluster
          ? {
              themeId: item.primaryCluster.themeId,
              label: item.primaryCluster.label,
              refs: item.primaryCluster.refs,
              rootRefs: item.primaryCluster.rootRefs,
              attachedRefs: item.primaryCluster.attachedRefs,
            }
          : null,
      },
    ])
  );
  return {
    generatedAt: GENERATED_AT,
    refreshId: REFRESH_ID,
    baseline: {
      updatedAt: input.baselinePublic.updatedAt,
      posts: input.baselinePublic.posts?.length ?? baselineStats.relevantTotal,
      themes: input.baselinePublic.themes?.length ?? 0,
      stats: baselineStats,
      clusterCoverage: input.baselinePublic.clusterCoverage,
    },
    candidate: {
      updatedAt: input.candidatePublic.updatedAt,
      posts: input.candidatePublic.posts?.length ?? candidateStats.relevantTotal,
      themes: input.candidatePublic.themes?.length ?? 0,
      stats: candidateStats,
      clusterCoverage: input.candidatePublic.clusterCoverage,
    },
    deltas: {
      posts: numericDelta(input.candidatePublic.posts?.length, input.baselinePublic.posts?.length),
      themes: numericDelta(input.candidatePublic.themes?.length, input.baselinePublic.themes?.length),
      relevantTotal: numericDelta(candidateStats.relevantTotal, baselineStats.relevantTotal),
      xRefs: numericDelta(candidateStats.relevantByPlatform?.x, baselineStats.relevantByPlatform?.x),
      linkedinRefs: numericDelta(candidateStats.relevantByPlatform?.linkedin, baselineStats.relevantByPlatform?.linkedin),
      youtubeRefs: numericDelta(candidateStats.relevantByPlatform?.youtube, baselineStats.relevantByPlatform?.youtube),
      knownViews: numericDelta(candidateStats.crossSurfaceObserved?.knownViews, baselineStats.crossSurfaceObserved?.knownViews),
      knownLikesAndLinkedInReactions: numericDelta(
        candidateStats.crossSurfaceObserved?.knownLikesAndLinkedInReactions,
        baselineStats.crossSurfaceObserved?.knownLikesAndLinkedInReactions
      ),
      rootRefs: numericDelta(input.candidatePublic.clusterCoverage?.rootRefs, input.baselinePublic.clusterCoverage?.rootRefs),
      attachedRefs: numericDelta(input.candidatePublic.clusterCoverage?.attachedRefs, input.baselinePublic.clusterCoverage?.attachedRefs),
    },
    watchedLanding,
    rejectedSpamQueryFindings: {
      eventScopeRejectedRows: input.queryGuard.eventScopeRejectedRows?.length ?? 0,
      strictXRejectedRows: input.queryGuard.strictXRejectedRows?.length ?? 0,
      conversationGuardRejectedRows: input.queryGuard.conversationGuardRejectedRows?.length ?? 0,
      broadXQueriesOverCap: (input.queryGuard.broadXQueries ?? []).filter((query: AnyRecord) => query.overCap).length,
    },
    publishable: false,
    publishableReason:
      'Candidate only. It reruns clustering over the whole refreshed relevant corpus and needs human review of entity spread, labels, summary support, and X guard rejects before promotion.',
  };
}

function markdownTable(rows: string[][]): string {
  if (!rows.length) return '';
  const [head, ...body] = rows;
  return [
    `| ${head.join(' | ')} |`,
    `| ${head.map(() => '---').join(' | ')} |`,
    ...body.map((row) => `| ${row.join(' | ')} |`),
  ].join('\n');
}

function writeCandidateReport(comparison: AnyRecord, senseCheck: AnyRecord, queryGuard: AnyRecord): void {
  const landingRows = ['Ralphthon', 'ClawCon', 'OpenClaw', 'AWS', 'Jupiter HQ', 'Codex'].map((entity) => {
    const item = comparison.watchedLanding?.[entity];
    const cluster = item?.primaryCluster;
    return [
      entity,
      String(item?.totalRefs ?? 0),
      cluster ? cluster.label : 'not found',
      cluster ? `${cluster.refs} refs (${cluster.rootRefs} root / ${cluster.attachedRefs} attached)` : '-',
    ];
  });
  const metricRows = Object.entries(comparison.deltas ?? {}).map(([key, value]) => [key, String(value ?? 'n/a')]);
  const broadRows = (queryGuard.broadXQueries ?? []).map((query: AnyRecord) => [
    query.query.replace(/\|/g, '\\|'),
    String(query.total),
    String(query.includedAfterGuard),
    String(query.rejected),
    query.overCap ? 'yes' : 'no',
  ]);
  const markdown = `# AIE 2026 candidate refresh report

Generated: ${GENERATED_AT}

Candidate folder: \`${path.relative(process.cwd(), REFRESH_DIR)}\`

This is a candidate-only semantic delta refresh. It does not overwrite deployed \`archive.json\`, \`public.json\`, worker code, or any R2 object.

## What changed

- Baseline public refs: ${comparison.baseline.posts}; candidate public refs: ${comparison.candidate.posts}.
- Baseline clusters: ${comparison.baseline.themes}; candidate clusters: ${comparison.candidate.themes}.
- Candidate clustering mode: deployed public story scaffold plus OpenAI embedding assignment for refreshed root refs; structured LLM copy rewrites labels, summaries, lede, and angle lenses from evidence.
- Candidate publishable: ${comparison.publishable ? 'yes' : 'no'} - ${comparison.publishableReason}

## Entity landing

${markdownTable([['Entity', 'Refs', 'Primary cluster', 'Spread'], ...landingRows])}

## Metrics delta

${markdownTable([['Metric', 'Candidate minus baseline'], ...metricRows])}

## Spam and query guard

- Event-scope rows rejected: ${queryGuard.eventScopeRejectedRows?.length ?? 0}
- Strict X rows rejected: ${queryGuard.strictXRejectedRows?.length ?? 0}
- Detached conversation rows rejected: ${queryGuard.conversationGuardRejectedRows?.length ?? 0}
- Broad X queries over cap: ${(queryGuard.broadXQueries ?? []).filter((query: AnyRecord) => query.overCap).length}
- Required exact/anchored query set: ${REQUIRED_ANCHORED_QUERIES.map((query) => `\`${query}\``).join(', ')}

${broadRows.length ? markdownTable([['Broad query', 'Total', 'Included', 'Rejected', 'Over cap'], ...broadRows]) : 'No broad X query buckets were detected in the sidecar rows.'}

## Sense-check gates

- Low-confidence primary story diagnostics: ${senseCheck.lowConfidencePrimaryAssignments?.length ?? 0}
- Duplicated entities in cluster labels/summaries: ${senseCheck.duplicatedEntitiesInLabelsSummaries?.length ?? 0}
- Summary terms unsupported by primary members: ${senseCheck.summaryTermsNotSupportedByPrimaryMembers?.length ?? 0}
- Root/attached cluster counts are in \`sense-check-audit.json\`.

## Promotion status

Do not publish this candidate without human approval. Promotion remains a manual copy/upload step documented in \`rollback-notes.md\`.
`;
  fs.writeFileSync(path.join(REFRESH_DIR, 'candidate-report.md'), markdown);
}

function copyInputSnapshot(sourcePath: string, fileName: string): string {
  const destination = path.join(REFRESH_DIR, fileName);
  fs.copyFileSync(sourcePath, destination);
  return destination;
}

function writeRollbackNotes(manifest: AnyRecord): void {
  const publicBackup = `public.backup.${REFRESH_ID}.json`;
  const publicVersioned = `public.${REFRESH_ID}.json`;
  const markdown = `# Rollback notes for ${REFRESH_ID}

This refresh is isolated. It does not overwrite \`archive.json\` or \`public.json\` during candidate generation.

Candidate folder:

\`${REFRESH_DIR}\`

Before promotion, the current public artifact was copied locally to:

\`${path.join(REFRESH_DIR, publicBackup)}\`

Candidate immutable public artifact:

\`${path.join(REFRESH_DIR, publicVersioned)}\`

## Promote data after validation

\`\`\`bash
export REFRESH_ID=${REFRESH_ID}
export REFRESH_DIR="${path.relative(process.cwd(), REFRESH_DIR)}"
export R2_PUBLIC_KEY="event-recap-ai-engineer-singapore/public.json"
export R2_VERSIONED_KEY="event-recap-ai-engineer-singapore/public.$REFRESH_ID.json"
export REFRESH_MEDIA_DIR="outputs/event-recap-ai-engineer-singapore/media/refreshes/$REFRESH_ID"

if [ -d "$REFRESH_MEDIA_DIR" ]; then
  find "$REFRESH_MEDIA_DIR" -type f | while IFS= read -r file; do
    key="\${file#outputs/}"
    npx wrangler r2 object put "aether-assets/$key" --file "$file"
  done
fi

npx wrangler r2 object put "aether-assets/$R2_VERSIONED_KEY" \\
  --file "$REFRESH_DIR/public.$REFRESH_ID.json" \\
  --content-type "application/json; charset=utf-8"

npx wrangler r2 object put "aether-assets/$R2_PUBLIC_KEY" \\
  --file "$REFRESH_DIR/public.$REFRESH_ID.json" \\
  --content-type "application/json; charset=utf-8"
\`\`\`

## Roll back data

\`\`\`bash
export REFRESH_ID=${REFRESH_ID}
export REFRESH_DIR="${path.relative(process.cwd(), REFRESH_DIR)}"
export R2_PUBLIC_KEY="event-recap-ai-engineer-singapore/public.json"

npx wrangler r2 object put "aether-assets/$R2_PUBLIC_KEY" \\
  --file "$REFRESH_DIR/public.backup.$REFRESH_ID.json" \\
  --content-type "application/json; charset=utf-8"
\`\`\`

No schema migration is required. The worker keeps reading the same R2 key.
Uploaded refresh media can remain in R2 after rollback; the restored public JSON no longer references it.

## Candidate counts

- Baseline archive rows: ${manifest.input.baselineArchiveRows}
- Sidecar rows: ${manifest.input.sidecarRows}
- Explicitly excluded sidecar rows: ${manifest.merge.explicitlyExcludedSidecarRows}
- Event-scope excluded sidecar rows: ${manifest.merge.eventScopeGuardExcludedSidecarRows}
- Conversation guard excluded sidecar rows: ${manifest.merge.conversationGuardExcludedSidecarRows}
- Strict X guard excluded sidecar rows: ${manifest.merge.strictXGuardExcludedSidecarRows}
- Recovered parent rows added: ${manifest.merge.recoveredParentsAdded}
- Candidate archive rows: ${manifest.output.candidateArchiveRows}
`;
  fs.writeFileSync(path.join(REFRESH_DIR, 'rollback-notes.md'), markdown);
}

async function main(): Promise<void> {
  loadEnvLocal();
  fs.mkdirSync(REFRESH_DIR, { recursive: true });

  const archive = readJson<AnyRecord>(ARCHIVE_PATH);
  const publicCurrent = readJson<AnyRecord>(PUBLIC_PATH);
  const sidecar = readJson<AnyRecord[]>(SIDECAR_PATH);
  const sidecarSummary = readJson<AnyRecord>(SIDECAR_SUMMARY_PATH);
  const human = readJson<AnyRecord>(HUMAN_DECISIONS_PATH);
  const orphanResolution = readJson<AnyRecord>(ORPHAN_RESOLUTION_PATH);

  const decisionByPostId = new Map<string, AnyRecord>(human.decisions.map((decision: AnyRecord) => [decision.postId, decision]));
  const humanDecisionExcludedPostIds = new Set<string>(
    human.decisions.filter((decision: AnyRecord) => decision.humanDecision === 'exclude').map((decision: AnyRecord) => decision.postId)
  );
  const exactReviewExcludedPostIds = new Set(EXACT_REVIEW_EXCLUSIONS.map((item) => item.postId));
  const excludedPostIds = new Set<string>([...humanDecisionExcludedPostIds, ...exactReviewExcludedPostIds]);
  const sidecarPostIds = new Set(sidecar.map((row) => row.postId));
  const sidecarExcludedPostIds = new Set(Array.from(excludedPostIds).filter((postId) => sidecarPostIds.has(postId)));
  const eventScopeGuardRejects = sidecar
    .filter((row) => !sidecarExcludedPostIds.has(row.postId))
    .map((row) => ({ row, reason: aie2026EventScopeRejectReason(row) }))
    .filter((item): item is { row: AnyRecord; reason: string } => Boolean(item.reason));
  const eventScopeGuardExcludedPostIds = new Set(eventScopeGuardRejects.map((item) => item.row.postId));
  const conversationGuardRejects = sidecar
    .filter((row) => !sidecarExcludedPostIds.has(row.postId) && !eventScopeGuardExcludedPostIds.has(row.postId))
    .map((row) => ({ row, reason: sidecarConversationRejectReason(row) }))
    .filter((item): item is { row: AnyRecord; reason: string } => Boolean(item.reason));
  const conversationGuardExcludedPostIds = new Set(conversationGuardRejects.map((item) => item.row.postId));
  const strictXGuardRejects = sidecar
    .filter(
      (row) =>
        !sidecarExcludedPostIds.has(row.postId) &&
        !eventScopeGuardExcludedPostIds.has(row.postId) &&
        !conversationGuardExcludedPostIds.has(row.postId)
    )
    .map((row) => ({ row, reason: strictXDeltaRejectReason(row, archive) }))
    .filter((item): item is { row: AnyRecord; reason: string } => Boolean(item.reason));
  const strictXGuardExcludedPostIds = new Set(strictXGuardRejects.map((item) => item.row.postId));
  const totalExcludedSidecarRows =
    sidecarExcludedPostIds.size + eventScopeGuardExcludedPostIds.size + conversationGuardExcludedPostIds.size + strictXGuardExcludedPostIds.size;
  const includedDecisionByPostId = new Map<string, AnyRecord>(
    human.decisions.filter((decision: AnyRecord) => decision.humanDecision === 'include').map((decision: AnyRecord) => [decision.postId, decision])
  );

  const recoveredParentRows: AnyRecord[] = orphanResolution.parentResolution
    .filter((item: AnyRecord) => item.recommendedAction === 'add_parent_attach_comments')
    .map((item: AnyRecord) => normalizeRow(findRecoveredParent(item.parent), 'recovered-parent'));

  const normalizedArchive: AnyRecord[] = (archive.posts ?? []).map((row: AnyRecord) => normalizeRow(row, 'archive'));
  const includedSidecarRows: AnyRecord[] = sidecar
    .filter(
      (row) =>
        !sidecarExcludedPostIds.has(row.postId) &&
        !eventScopeGuardExcludedPostIds.has(row.postId) &&
        !conversationGuardExcludedPostIds.has(row.postId) &&
        !strictXGuardExcludedPostIds.has(row.postId)
    )
    .map((row) => normalizeRow(row, 'sidecar', includedDecisionByPostId.get(row.postId) ?? decisionByPostId.get(row.postId)));

  const candidateRowsBeforeReviewExclusions: AnyRecord[] = [...normalizedArchive, ...includedSidecarRows, ...recoveredParentRows];
  const excludedCandidateRows = candidateRowsBeforeReviewExclusions.filter((row) => excludedPostIds.has(row.postId));
  const nonSidecarExcludedReviewRows = excludedCandidateRows
    .filter((row) => !sidecarPostIds.has(row.postId))
    .map((row) => row.postId);
  let candidateRows: AnyRecord[] = candidateRowsBeforeReviewExclusions.filter((row) => !excludedPostIds.has(row.postId));

  const nativeDuplicateGroups = Array.from(groupBy(candidateRows, (row) => row.canonicalKey).entries())
    .filter(([, group]) => group.length > 1)
    .map(([key, group]) => ({ key, rows: group.map((row) => ({ postId: row.postId, mergeSource: row.mergeSource, url: row.url })) }));

  const softGroups = buildSoftDuplicateGroups(candidateRows);

  const softCanonicalByPostId = new Map<string, string>();
  for (const group of softGroups) {
    for (const postId of group.rows) {
      if (postId !== group.canonicalPostId) softCanonicalByPostId.set(postId, group.canonicalPostId);
    }
  }

  candidateRows = candidateRows.map((row) => {
    const duplicateOf = softCanonicalByPostId.get(row.postId);
    if (!duplicateOf) return row;
    return {
      ...row,
      contentDuplicateOf: duplicateOf,
      isRollupCanonical: false,
      isClusterRoot: false,
      tags: addTag(addTag(row.tags ?? [], 'content-duplicate'), 'context:event'),
    };
  });

  const parentByNativeKey = new Map<string, AnyRecord>();
  for (const row of candidateRows) {
    if (row.rowType === 'parent' && row.canonicalKey) parentByNativeKey.set(row.canonicalKey, row);
  }
  candidateRows = candidateRows.map((row) => {
    if (row.rowType === 'parent') {
      return {
        ...row,
        rootPostId: row.postId,
        isClusterRoot: Boolean(row.isClusterRoot && !row.contentDuplicateOf),
      };
    }
    const parent = row.parentNativeKey ? parentByNativeKey.get(row.parentNativeKey) : undefined;
    return {
      ...row,
      parentPostId: parent?.postId,
      rootPostId: parent?.rootPostId ?? parent?.postId ?? row.parentNativeKey,
      isClusterRoot: false,
    };
  });

  const relevantRows = candidateRows.filter(isRelevant);
  const semanticEmbeddingModel = process.env.EVENT_RECAP_EMBEDDING_MODEL?.trim() || DEFAULT_OPENAI_EMBEDDING_MODEL;
  const semanticAssignmentDocs = semanticDocs(relevantRows, {
    maxDocs: envNumber('EVENT_RECAP_SEMANTIC_ASSIGNMENT_MAX_DOCS', 5000, 200, 10000),
    includeStorySignal: false,
  });
  const semanticAssignmentVectors = await fetchOpenAIEmbeddings(semanticAssignmentDocs, semanticEmbeddingModel);
  const semanticEmbeddingBaseline = buildSemanticEmbeddingDiagnosticsFromVectors(
    semanticAssignmentVectors,
    semanticEmbeddingModel
  );
  const semanticStoryAssigned = buildSemanticStoryAssignment({
    eventId: String(archive.eventId),
    rows: relevantRows,
    deployedThemes: publicCurrent.themes ?? [],
    deployedPosts: publicCurrent.posts ?? [],
    vectors: semanticAssignmentVectors,
    decisions: [...EXACT_STORY_DECISIONS],
    similarityThreshold: envNumber('EVENT_RECAP_SEMANTIC_ASSIGNMENT_THRESHOLD', 0.2, -1, 1),
    ambiguousMargin: envNumber('EVENT_RECAP_SEMANTIC_ASSIGNMENT_AMBIGUOUS_MARGIN', 0.035, 0, 1),
    generatedAt: Date.now(),
  });
  let publicStoryPosts = semanticStoryAssigned.posts as AnyRecord[];
  const publicStoryPostById = new Map(publicStoryPosts.map((post) => [post.postId, post]));
  let adjustedThemes = semanticStoryAssigned.themes as AnyRecord[];
  const editorialSynthesis = await generateEditorialSynthesis(adjustedThemes, relevantRows, publicCurrent.themes ?? []);
  adjustedThemes = applyEditorialSynthesis(adjustedThemes, editorialSynthesis);
  const adjustedThemeByStoryId = new Map(adjustedThemes.map((theme: AnyRecord) => [theme.storyId, theme]));
  publicStoryPosts = publicStoryPosts.map((post) => {
    const theme = adjustedThemeByStoryId.get(post.primaryStoryId);
    if (!theme) return post;
    const storyMentions = (post.storyMentions ?? []).map((mention: AnyRecord) =>
      mention.storyId === theme.storyId ? { ...mention, label: theme.label } : mention
    );
    return { ...post, storyMentions };
  });
  publicStoryPostById.clear();
  for (const post of publicStoryPosts) publicStoryPostById.set(post.postId, post);
  const themeRootIds = new Set<string>(adjustedThemes.flatMap((theme: AnyRecord) => theme.rootPostIds ?? []));
  candidateRows = candidateRows.map((row) => {
    const assigned = publicStoryPostById.get(row.postId);
    return {
      ...row,
      storyType: assigned?.storyType ?? row.storyType,
      primaryStoryId: assigned?.primaryStoryId ?? row.primaryStoryId,
      storyMentions: assigned?.storyMentions ?? row.storyMentions,
      semanticPublicExcluded: assigned?.semanticPublicExcluded ?? row.semanticPublicExcluded,
      semanticReviewReason: assigned?.semanticReviewReason ?? row.semanticReviewReason,
      tags: assigned?.tags ?? row.tags,
      isClusterRoot: row.rowType === 'parent' && themeRootIds.has(row.postId),
    };
  });

  const candidateStats = computeStats(candidateRows);
  const candidateArchive: AnyRecord = {
    ...archive,
    enrichment: sanitizeInheritedEnrichment(archive.enrichment ?? []),
    runId: `${archive.runId ?? 'aie2026'}+${REFRESH_ID}`,
    generatedAt: archive.generatedAt,
    updatedAt: GENERATED_AT,
    refreshId: REFRESH_ID,
    refreshGeneratedAt: GENERATED_AT,
    refreshSource: {
      mode: 'candidate-semantic-delta-human-reviewed',
      baselineArchivePath: path.relative(process.cwd(), ARCHIVE_PATH),
      sidecarPath: path.relative(process.cwd(), SIDECAR_PATH),
      humanDecisionsPath: path.relative(process.cwd(), HUMAN_DECISIONS_PATH),
      orphanResolutionPath: path.relative(process.cwd(), ORPHAN_RESOLUTION_PATH),
    },
    posts: candidateRows,
    themes: adjustedThemes,
    editorial: editorialSynthesis,
    voices: rankVoices(String(archive.eventId), publicStoryPosts as any[]),
    stats: candidateStats,
    clustering: {
      refreshMode: 'candidate-semantic-delta-refresh',
      fullReclusterRun: false,
      semanticDeltaRefresh: true,
      algorithm:
        'OpenAI text embeddings assign refreshed delta roots to deployed AIE story centroids; structured LLM rewrites public labels, summaries, lede, and angle lenses from evidence',
      selectedBy:
        'deployed public recap scaffold for stable MECE boundaries; nearest semantic story centroid for delta roots; structured LLM synthesis for public copy and stakeholder angles',
      assignmentMethod:
        'public themes preserve the live story scaffold, embed all refreshed root refs, assign only deltas by semantic similarity, and attach comments/replies through their parent/root artifact',
      silhouetteScore: semanticEmbeddingBaseline.silhouetteScore ?? 0,
      silhouetteClusterCount: semanticEmbeddingBaseline.clusterCount,
      elbowClusterCount: semanticEmbeddingBaseline.elbowClusterCount,
      inertia: semanticEmbeddingBaseline.inertia ?? 0,
      clusterCount: semanticEmbeddingBaseline.clusterCount ?? adjustedThemes.length,
      rootRefCount: semanticStoryAssigned.stats.rootRefs,
      sampleSize: semanticEmbeddingBaseline.sampleSize ?? semanticAssignmentVectors.length,
      clusterSizeMin:
        semanticEmbeddingBaseline.candidateScores?.find((score: AnyRecord) => score.clusterCount === semanticEmbeddingBaseline.clusterCount)
          ?.clusterSizeMin ?? 0,
      clusterSizeMedian:
        semanticEmbeddingBaseline.candidateScores?.find((score: AnyRecord) => score.clusterCount === semanticEmbeddingBaseline.clusterCount)
          ?.clusterSizeMedian ?? 0,
      clusterSizeMax:
        semanticEmbeddingBaseline.candidateScores?.find((score: AnyRecord) => score.clusterCount === semanticEmbeddingBaseline.clusterCount)
          ?.clusterSizeMax ?? 0,
      candidateScores: semanticEmbeddingBaseline.candidateScores ?? [],
      rawClusterCount: semanticEmbeddingBaseline.clusterCount ?? 0,
      storyClusterCount: adjustedThemes.length,
      semanticEmbeddingBaseline,
      semanticStoryAssignment: semanticStoryAssigned.diagnostics,
      meceConsolidation: {
        enabled: true,
        sourceThemeCount: publicCurrent.themes?.length ?? 0,
        storyGroupCount: adjustedThemes.length,
        storyGroups: adjustedThemes.map((theme: AnyRecord) => ({
          themeId: theme.themeId,
          label: theme.label,
          storyId: theme.storyId,
          sourceThemeIds: theme.sourceThemeIds ?? [theme.themeId],
        })),
      },
      storyAssignment: semanticStoryAssigned.stats,
      driftReport: {
        note: 'Public themes preserve the deployed MECE recap stories. New root refs are assigned by semantic similarity to those story centroids, while comments/replies remain attached context.',
        previousThemeCount: archive.themes?.length ?? 0,
        candidateThemeCount: adjustedThemes.length,
      },
    },
  };

  const publicPosts = await Promise.all(candidateRows.filter(isRelevant).map(trimPost));
  const publicStats = computeStats(publicPosts);
  const publicCandidate = {
    eventId: candidateArchive.eventId,
    eventName: candidateArchive.eventName,
    windowStart: candidateArchive.windowStart,
    windowEnd: candidateArchive.windowEnd,
    generatedAt: candidateArchive.generatedAt,
    updatedAt: candidateArchive.updatedAt,
    refreshId: REFRESH_ID,
    refreshGeneratedAt: GENERATED_AT,
    querySet: candidateArchive.querySet,
    methodology: {
      label: 'seeded digital snowball sampling plus human-reviewed delta refresh',
      sourceDateRange: (() => {
        const times = publicPosts
          .map((post: AnyRecord) => new Date(post.postedAt ?? post.capturedAt ?? 0).getTime())
          .filter((value: number) => Number.isFinite(value) && value > 0);
        return times.length ? { start: new Date(Math.min(...times)).toISOString(), end: new Date(Math.max(...times)).toISOString() } : undefined;
      })(),
      collectionWindow: { start: archive.windowStart, end: archive.windowEnd },
      querySet: archive.querySet,
      expansionQueries: archive.expansion?.querySet ?? [],
      sourceLinks: sourceLinks(archive),
      youtubeQueries: archive.youtube?.queries ?? [],
      youtubeSources: (archive.youtube?.topVideos ?? []).map((video: AnyRecord) => ({
        title: video.title,
        url: video.url,
        channel: video.channel,
        views: video.viewCount,
        comments: video.commentCount,
      })),
      limitations: [
        'The corpus is a public evidence sample, not a representative survey or full social-listening panel.',
        'This refresh is candidate-only: no deployed archive, public bundle, worker output, or R2 object is overwritten.',
        'Visible stories preserve the deployed MECE scaffold; refreshed root refs are embedded and assigned to the nearest deployed story centroid, while comments and replies inherit their parent/root story.',
        'Theme labels, summaries, lede, and stakeholder angle lenses are rewritten by a structured LLM pass from top evidence posts, then preserved with the candidate bundle for review.',
        'LinkedIn nested raw comments are not exposed in the public bundle and are not counted as additional top-level comments.',
        'X and YouTube expose public views; LinkedIn public collection here does not expose impressions.',
      ],
    },
    stats: publicStats,
    clustering: candidateArchive.clustering,
    editorial: editorialSynthesis,
    clusterCoverage: clusterCoverage(publicPosts, adjustedThemes),
    posts: publicPosts,
    themes: adjustedThemes,
    voices: candidateArchive.voices ?? [],
  };

  const sidecarLinkedInComments = sidecar.filter((row) => row.tags?.includes('linkedin-comment'));
  const sidecarNestedComments = sidecar.filter((row) => rawCommentsCount(row) > 0);
  const sidecarNestedCommentIds = sidecarNestedComments.flatMap((row) =>
    (row.raw.comments ?? []).map((comment: AnyRecord) => String(comment.id)).filter(Boolean)
  );
  const sidecarTopLevelCommentIds = new Set(sidecarLinkedInComments.map((row) => String(row.raw?.id ?? row.linkedinCommentId ?? '')).filter(Boolean));
  const nestedOverlapIds = sidecarNestedCommentIds.filter((id) => sidecarTopLevelCommentIds.has(id));
  const candidateLinkedInComments = candidateRows.filter((row) => row.tags?.includes('linkedin-comment'));
  const unresolvedConversationRows = candidateRows.filter((row) => row.rowType !== 'parent' && !row.parentPostId && !row.rootPostId);

  const urlDuplicateGroups = Array.from(groupBy(candidateRows, (row) => row.canonicalUrl).entries())
    .filter(([, group]) => group.length > 1)
    .map(([key, group]) => ({
      key,
      rows: group.map((row) => ({
        postId: row.postId,
        canonicalKey: row.canonicalKey,
        contentDuplicateOf: row.contentDuplicateOf,
        mergeSource: row.mergeSource,
      })),
      allowedAsSoftDuplicate: group.every((row) => row.contentDuplicateOf || group.some((candidate) => candidate.postId === row.contentDuplicateOf)),
    }));

  const metricsRows = candidateRows.filter((row) => row.mergeSource === 'sidecar');
  const metricsAudit = {
    sidecarRows: sidecar.length,
    sidecarRowsIncluded: includedSidecarRows.length,
    sidecarRowsExcluded: sidecar.length - includedSidecarRows.length,
    rowsWithMetricsUpdatedAt: metricsRows.filter((row) => Boolean(row.metricsUpdatedAt)).length,
    byPlatform: platformCounts(metricsRows),
    byStatus: metricsRows.reduce((acc, row) => {
      const key = `${row.platform}:${row.metricsRefresh?.status ?? 'missing_status'}`;
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {} as Record<string, number>),
    unresolvedLinkedInRows: metricsRows
      .filter((row) => row.platform === 'linkedin' && row.metricsRefresh?.status !== 'updated')
      .map((row) => ({
        postId: row.postId,
        url: row.url,
        authorName: row.authorName,
        status: row.metricsRefresh?.status,
        metricsUpdatedAt: row.metricsUpdatedAt,
        metrics: row.metrics,
      })),
    recoveredParentMetrics: recoveredParentRows.map((row) => ({
      postId: row.postId,
      url: row.url,
      status: row.metricsRefresh?.status,
      metricsUpdatedAt: row.metricsUpdatedAt,
      metrics: row.metrics,
    })),
    sourceSummary: sidecarSummary.linkedinCoverage,
  };

  const parentReview = candidateRows
    .filter((row) => row.rowType === 'parent' && isRelevant(row))
    .map((parent) => {
      const attached = candidateRows.filter((row) => row.parentPostId === parent.postId || (row.rootPostId === parent.postId && row.rowType !== 'parent'));
      return {
        postId: parent.postId,
        platform: parent.platform,
        url: parent.url,
        authorName: parent.authorName,
        postedAt: parent.postedAt,
        primaryStoryId: parent.primaryStoryId,
        isClusterRoot: parent.isClusterRoot,
        metrics: parent.metrics,
        metricsUpdatedAt: parent.metricsUpdatedAt,
        metricsRefreshStatus: parent.metricsRefresh?.status,
        reportedCommentsCount: parent.metrics?.comments,
        fetchedCommentsCount: attached.length,
        attachedCommentRows: attached.map((row) => ({
          postId: row.postId,
          rowType: row.rowType,
          authorName: row.authorName,
          url: row.url,
          metrics: row.metrics,
          highSignal: metricEngagement(row.metrics) >= 10,
          text: String(row.text ?? '').slice(0, 300),
        })),
      };
    });

  const manifest: AnyRecord = {
    refreshId: REFRESH_ID,
    generatedAt: GENERATED_AT,
    folder: path.relative(process.cwd(), REFRESH_DIR),
    input: {
      baselineArchivePath: path.relative(process.cwd(), ARCHIVE_PATH),
      baselineArchiveRows: archive.posts?.length ?? 0,
      baselinePublicPath: path.relative(process.cwd(), PUBLIC_PATH),
      baselinePublicRows: publicCurrent.posts?.length ?? 0,
      sidecarPath: path.relative(process.cwd(), SIDECAR_PATH),
      sidecarRows: sidecar.length,
      humanDecisionsPath: path.relative(process.cwd(), HUMAN_DECISIONS_PATH),
    },
    merge: {
      humanExcludedReviewRows: excludedPostIds.size,
      explicitlyExcludedSidecarRows: sidecarExcludedPostIds.size,
      eventScopeGuardExcludedSidecarRows: eventScopeGuardExcludedPostIds.size,
      conversationGuardExcludedSidecarRows: conversationGuardExcludedPostIds.size,
      strictXGuardExcludedSidecarRows: strictXGuardExcludedPostIds.size,
      totalExcludedSidecarRows,
      exactReviewExcludedRows: EXACT_REVIEW_EXCLUSIONS,
      nonSidecarExcludedReviewRows,
      includedSidecarRows: includedSidecarRows.length,
      recoveredParentsAdded: recoveredParentRows.length,
      arithmetic: `${archive.posts?.length ?? 0} + ${sidecar.length} - ${totalExcludedSidecarRows} - ${nonSidecarExcludedReviewRows.length} + ${recoveredParentRows.length} = ${candidateRows.length}`,
    },
    output: {
      candidateArchiveRows: candidateRows.length,
      candidatePublicRows: publicPosts.length,
      candidatePublicMediaAssets: publicPosts.reduce((count: number, post: AnyRecord) => count + (Array.isArray(post.media) ? post.media.length : 0), 0),
      candidatePublicMediaAssetsInPublicPrefix: publicPosts.reduce(
        (count: number, post: AnyRecord) =>
          count + (Array.isArray(post.media) ? post.media.filter((item: AnyRecord) => String(item.path ?? '').startsWith(PUBLIC_MEDIA_PREFIX)).length : 0),
        0
      ),
      candidateThemeCount: adjustedThemes.length,
      platformCounts: platformCounts(candidateRows),
      rowTypeCounts: rowTypeCounts(candidateRows),
      relevantRowTypeCounts: rowTypeCounts(candidateRows.filter(isRelevant)),
    },
    checksums: {},
  };

  writeJson('archive.candidate.json', candidateArchive);
  writeJson('public.candidate.json', publicCandidate);
  fs.copyFileSync(path.join(REFRESH_DIR, 'public.candidate.json'), path.join(REFRESH_DIR, `public.${REFRESH_ID}.json`));
  fs.copyFileSync(PUBLIC_PATH, path.join(REFRESH_DIR, `public.backup.${REFRESH_ID}.json`));
  const inputSnapshots = {
    baselineArchive: path.relative(process.cwd(), copyInputSnapshot(ARCHIVE_PATH, `archive.baseline.${REFRESH_ID}.json`)),
    baselinePublic: path.relative(process.cwd(), copyInputSnapshot(PUBLIC_PATH, `public.baseline.${REFRESH_ID}.json`)),
    sidecar: path.relative(process.cwd(), copyInputSnapshot(SIDECAR_PATH, `sidecar.input.${REFRESH_ID}.json`)),
    sidecarSummary: path.relative(process.cwd(), copyInputSnapshot(SIDECAR_SUMMARY_PATH, `sidecar-summary.input.${REFRESH_ID}.json`)),
    humanDecisions: path.relative(process.cwd(), copyInputSnapshot(HUMAN_DECISIONS_PATH, `human-decisions.input.${REFRESH_ID}.json`)),
    orphanResolution: path.relative(process.cwd(), copyInputSnapshot(ORPHAN_RESOLUTION_PATH, `orphan-resolution.input.${REFRESH_ID}.json`)),
  };
  manifest.input.snapshots = inputSnapshots;

  const checksums = {
    baselineArchive: sha256(ARCHIVE_PATH),
    baselinePublic: sha256(PUBLIC_PATH),
    sidecar: sha256(SIDECAR_PATH),
    baselineArchiveSnapshot: sha256(path.join(REFRESH_DIR, `archive.baseline.${REFRESH_ID}.json`)),
    baselinePublicSnapshot: sha256(path.join(REFRESH_DIR, `public.baseline.${REFRESH_ID}.json`)),
    sidecarSnapshot: sha256(path.join(REFRESH_DIR, `sidecar.input.${REFRESH_ID}.json`)),
    sidecarSummarySnapshot: sha256(path.join(REFRESH_DIR, `sidecar-summary.input.${REFRESH_ID}.json`)),
    humanDecisionsSnapshot: sha256(path.join(REFRESH_DIR, `human-decisions.input.${REFRESH_ID}.json`)),
    orphanResolutionSnapshot: sha256(path.join(REFRESH_DIR, `orphan-resolution.input.${REFRESH_ID}.json`)),
    archiveCandidate: sha256(path.join(REFRESH_DIR, 'archive.candidate.json')),
    publicCandidate: sha256(path.join(REFRESH_DIR, 'public.candidate.json')),
    publicVersioned: sha256(path.join(REFRESH_DIR, `public.${REFRESH_ID}.json`)),
    publicBackup: sha256(path.join(REFRESH_DIR, `public.backup.${REFRESH_ID}.json`)),
  };
  manifest.checksums = checksums;

  const mergeAudit = {
    generatedAt: GENERATED_AT,
    refreshId: REFRESH_ID,
    baselineArchiveRows: archive.posts?.length ?? 0,
    sidecarRows: sidecar.length,
    includedSidecarRows: includedSidecarRows.length,
    excludedSidecarRows: Array.from(sidecarExcludedPostIds),
    eventScopeGuardExcludedSidecarRows: eventScopeGuardRejects.map(({ row, reason }) => ({
      postId: row.postId,
      platform: row.platform,
      url: row.url,
      authorName: row.authorName,
      authorHandle: row.authorHandle,
      youtubeVideoId: aie2026YoutubeVideoId(row),
      reason,
      tags: row.tags ?? [],
      text: String(row.text ?? '').slice(0, 300),
      metrics: row.metrics,
    })),
    conversationGuardExcludedSidecarRows: conversationGuardRejects.map(({ row, reason }) => ({
      postId: row.postId,
      url: row.url,
      authorHandle: row.authorHandle,
      reason,
      parentTag: (row.tags ?? []).find((tag: string) => String(tag).startsWith('parent:')),
      conversationId: xConversationId(row),
      text: String(row.text ?? '').slice(0, 300),
      metrics: row.metrics,
    })),
    strictXGuardExcludedSidecarRows: strictXGuardRejects.map(({ row, reason }) => ({
      postId: row.postId,
      url: row.url,
      authorHandle: row.authorHandle,
      reason,
      queries: rowQueries(row),
      text: String(row.text ?? '').slice(0, 300),
      metrics: row.metrics,
    })),
    exactReviewExcludedRows: EXACT_REVIEW_EXCLUSIONS,
    humanExcludedReviewRows: Array.from(excludedPostIds),
    nonSidecarExcludedReviewRows,
    recoveredParentsAdded: recoveredParentRows.map((row) => ({
      postId: row.postId,
      canonicalKey: row.canonicalKey,
      url: row.url,
      sourceFile: orphanResolution.parentResolution.find((item: AnyRecord) => item.parent.postId === row.postId)?.parent.sourceFile,
    })),
    candidateRows: candidateRows.length,
    arithmetic: manifest.merge.arithmetic,
    sidecarAccounting: {
      included: includedSidecarRows.length,
      excludedByHumanReview: sidecarExcludedPostIds.size,
      excludedByEventScopeGuard: eventScopeGuardExcludedPostIds.size,
      excludedByConversationGuard: conversationGuardExcludedPostIds.size,
      excludedByStrictXGuard: strictXGuardExcludedPostIds.size,
      total:
        includedSidecarRows.length +
        sidecarExcludedPostIds.size +
        eventScopeGuardExcludedPostIds.size +
        conversationGuardExcludedPostIds.size +
        strictXGuardExcludedPostIds.size,
      expected: sidecar.length,
      allAccountedFor:
        includedSidecarRows.length +
          sidecarExcludedPostIds.size +
          eventScopeGuardExcludedPostIds.size +
          conversationGuardExcludedPostIds.size +
          strictXGuardExcludedPostIds.size ===
        sidecar.length,
    },
    recoveredParentHash: hashValue(recoveredParentRows.map((row) => row.canonicalKey)),
  };

  const dedupeAudit = {
    generatedAt: GENERATED_AT,
    refreshId: REFRESH_ID,
    nativeDuplicateCount: nativeDuplicateGroups.length,
    nativeDuplicateGroups,
    canonicalUrlDuplicateCount: urlDuplicateGroups.length,
    canonicalUrlDuplicateGroups: urlDuplicateGroups,
    softDuplicateGroupCount: softGroups.length,
    softDuplicateGroups: softGroups.map((group) => ({
      ...group,
      rows: group.rows.map((postId: string) => {
        const row = candidateRows.find((candidate) => candidate.postId === postId);
        return {
          postId,
          url: row?.url,
          authorName: row?.authorName,
          postedAt: row?.postedAt,
          contentDuplicateOf: row?.contentDuplicateOf,
        };
      }),
    })),
    treatment: 'Soft duplicates are retained, marked with contentDuplicateOf, tagged content-duplicate/context:event, and prevented from root rollups.',
  };

  const conversationAudit = {
    generatedAt: GENERATED_AT,
    refreshId: REFRESH_ID,
    sidecarConversationRows: sidecar.filter((row) => inferRowType(row) !== 'parent').length,
    candidateConversationRows: candidateRows.filter((row) => row.rowType !== 'parent').length,
    conversationGuardExcludedRows: conversationGuardRejects.map(({ row, reason }) => ({
      postId: row.postId,
      platform: row.platform,
      rowType: inferRowType(row),
      url: row.url,
      authorHandle: row.authorHandle,
      parentTag: (row.tags ?? []).find((tag: string) => String(tag).startsWith('parent:')),
      reason,
      text: String(row.text ?? '').slice(0, 300),
    })),
    unresolvedConversationRows: unresolvedConversationRows.map((row) => ({
      postId: row.postId,
      platform: row.platform,
      rowType: row.rowType,
      url: row.url,
      parentNativeKey: row.parentNativeKey,
    })),
    linkedIn: {
      sidecarSeparateCanonicalCommentRows: sidecarLinkedInComments.length,
      candidateSeparateCanonicalCommentRows: candidateLinkedInComments.length,
      excludedLinkedInCommentRows: Array.from(excludedPostIds).filter((postId) => sidecarLinkedInComments.some((row) => row.postId === postId)).length,
      parentRowsWithNestedRawCommentsInSidecar: sidecarNestedComments.length,
      nestedRawCommentTotalInSidecar: sidecarNestedCommentIds.length,
      nestedOverlapWithSeparateRows: new Set(nestedOverlapIds).size,
      candidateRowsWithRawCommentsArray: candidateRows.filter((row) => Array.isArray(row.raw?.comments)).length,
      candidateRowsWithRawCommentsProvenanceOnly: candidateRows.filter((row) => row.rawCommentsProvenanceOnly).length,
    },
    orphanResolution: orphanResolution.summary,
    parentReview,
    highSignalComments: parentReview.flatMap((parent) =>
      parent.attachedCommentRows
        .filter((comment: AnyRecord) => comment.highSignal)
        .map((comment: AnyRecord) => ({ parentPostId: parent.postId, parentUrl: parent.url, ...comment }))
    ),
  };

  const senseCheck = buildSenseCheckAudit({
    refreshId: REFRESH_ID,
    posts: candidateRows.filter(isRelevant),
    themes: adjustedThemes,
    storyDiagnosticPosts: publicStoryPosts,
  });
  const queryGuard = buildQueryExpansionGuard({
    archive,
    sidecar,
    humanExcludedPostIds: excludedPostIds,
    eventScopeRejects: eventScopeGuardRejects,
    conversationRejects: conversationGuardRejects,
    strictXRejects: strictXGuardRejects,
  });
  const baselineComparison = buildBaselineComparison({
    baselinePublic: publicCurrent,
    candidatePublic: publicCandidate,
    senseCheck,
    queryGuard,
  });
  const reviewedBoundaryByPostId = new Map(REVIEWED_BOUNDARY_ASSIGNMENTS.map((decision) => [decision.postId, decision]));
  const legacySparseVectorMarkers = [
    String.fromCharCode(116, 102, 45, 105, 100, 102),
    String.fromCharCode(116, 102, 105, 100, 102),
  ];

  const validation = {
    generatedAt: GENERATED_AT,
    refreshId: REFRESH_ID,
    checks: {
      noDuplicateNativePlatformKeys: nativeDuplicateGroups.length === 0,
      sidecarRowsAccountedFor: mergeAudit.sidecarAccounting.allAccountedFor,
      candidateCountArithmeticMatches:
        candidateRows.length ===
        (archive.posts?.length ?? 0) + sidecar.length - totalExcludedSidecarRows - nonSidecarExcludedReviewRows.length + recoveredParentRows.length,
      candidateUsesSemanticDeltaRefresh: candidateArchive.clustering.semanticDeltaRefresh === true,
      candidateClusteringOmitsLegacySparseVectorBaseline: legacySparseVectorMarkers.every(
        (marker) => !JSON.stringify(candidateArchive.clustering).toLowerCase().includes(marker)
      ),
      candidateArchiveOmitsInheritedLegacyClusteringMetadata: legacySparseVectorMarkers.every(
        (marker) => !JSON.stringify(candidateArchive.enrichment ?? []).toLowerCase().includes(marker)
      ),
      candidateArchiveMarksReviewedOffEventCodexRowsIrrelevant: REVIEWED_OFF_EVENT_CODEX_POST_IDS.every((postId) => {
        const post = candidateRows.find((row) => row.postId === postId);
        return Boolean(post && !isRelevant(post) && post.isClusterRoot === false && post.tags?.includes('irrelevant:event'));
      }),
      publicBundleOmitsReviewedOffEventCodexRows: !publicPosts.some((post: AnyRecord) =>
        REVIEWED_OFF_EVENT_CODEX_POST_IDS.includes(post.postId)
      ),
      publicBundleAppliesReviewedBoundaryAssignments: Array.from(reviewedBoundaryByPostId.values()).every((decision) => {
        const post = publicPosts.find((candidate: AnyRecord) => candidate.postId === decision.postId);
        if (!post || post.primaryStoryId !== decision.storyId) return false;
        return decision.rootFit === 'context' ? post.isClusterRoot === false : post.isClusterRoot === true;
      }),
      sideEventsSummaryOmitsUnsupportedRalphthon: !/\b(ralphthon|hackathons?)\b/i.test(
        String(adjustedThemes.find((theme: AnyRecord) => theme.storyId === 'side-events-meetups')?.summary ?? '')
      ),
      candidateThemesUseStoryAssignment: adjustedThemes.every((theme: AnyRecord) => theme.storyType === 'story_assignment'),
      candidateHasSemanticEmbeddingDiagnostics: semanticEmbeddingBaseline.enabled === true,
      candidateHasLlmEditorialSynthesis: editorialSynthesis.strategy.includes('structured'),
      linkedInNestedOverlapDetected143: new Set(nestedOverlapIds).size === 143,
      linkedInNestedCommentsNotRawCommentsArrayInCandidate: conversationAudit.linkedIn.candidateRowsWithRawCommentsArray === 0,
      commentRowsHaveParentOrRoot: unresolvedConversationRows.length === 0,
      noCommentReplyInThemeRootPostIds: adjustedThemes.every((theme: AnyRecord) =>
        (theme.rootPostIds ?? []).every((postId: string) => candidateRows.find((row) => row.postId === postId)?.rowType === 'parent')
      ),
      sidecarRowsRetainMetricsUpdatedAt: metricsRows.every((row) => Boolean(row.metricsUpdatedAt)),
      linkedInThreeMissesRemainNotFound: metricsAudit.unresolvedLinkedInRows.length === 3,
      publicBundleOmitsKnownOffRegionYoutubeVideos: !publicPosts.some((post: AnyRecord) => aie2026EventScopeRejectReason(post)),
      publicBundleOmitsRaw: !JSON.stringify(publicCandidate).includes('"raw"'),
    },
  };

  writeJson('manifest.json', manifest);
  writeJson('merge-audit.json', mergeAudit);
  writeJson('dedupe-audit.json', dedupeAudit);
  writeJson('metrics-audit.json', metricsAudit);
  writeJson('conversation-audit.json', conversationAudit);
  writeJson('sense-check-audit.json', senseCheck);
  writeJson('query-expansion-guard.json', queryGuard);
  writeJson('baseline-vs-candidate.json', baselineComparison);
  writeJson('validation-audit.json', validation);
  writeCandidateReport(baselineComparison, senseCheck, queryGuard);
  writeRollbackNotes(manifest);

  console.log(JSON.stringify({
    refreshId: REFRESH_ID,
    folder: path.relative(process.cwd(), REFRESH_DIR),
    candidateRows: candidateRows.length,
    publicRows: publicPosts.length,
    validations: validation.checks,
  }, null, 2));
}

void main();
