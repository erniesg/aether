import fs from 'node:fs';
import path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { analyzePosts, measureClusterQuality } from '../lib/research/event-recap/analyze';
import { enrichPostConversationTags } from '../lib/research/event-recap/conversation';
import { deriveExpansionPlan } from '../lib/research/event-recap/expand';
import { hasAiEngineeringOrProgramSignal, hasEventContextSignal, isIncidentalAieMention, isLowSignalEventOnlyText } from '../lib/research/event-recap/relevance';
import { buildStoryAssignedThemes } from '../lib/research/event-recap/story-assignment';
import type { EventPlatform, EventPost, EventPostMedia, EventTheme } from '../lib/research/event-recap/types';
import { makePostId, scorePostsByPlatform, shortExcerpt } from '../lib/research/event-recap/utils';

const ARCHIVE_PATH = 'outputs/event-recap-ai-engineer-singapore/archive.json';
const RUN_ID = `event_recap_finalize_analysis_${Date.now()}`;
const DEFAULT_MODEL = 'claude-opus-4-7';
const DEFAULT_OPENAI_MODEL = 'gpt-4.1-mini';

const THEME_REWRITE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
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
            minLength: 20,
            maxLength: 420,
            description:
              'One or two concise evidence-grounded sentences. Mention concrete sources or platform mix when useful. Do not invent facts.',
          },
        },
        required: ['themeId', 'label', 'summary'],
      },
    },
  },
  required: ['themes'],
};

type ThemeRewritePayloadItem = {
  themeId: string;
  label: string;
  keywords: string[];
  postCount: number;
  evidence: Array<{
    platform: EventPlatform;
    author: string;
    url: string;
    metrics: EventPost['metrics'];
    text: string;
  }>;
};

type ThemeSummaryResult = {
  themes: EventTheme[];
  model?: string;
  error?: string;
  warning?: string;
  strategy?: string;
};

const CURATED_THEME_COPY: Record<string, { label: string; summary: string }> = {
  'story-vivian-builder-keynote': {
    label: "Vivian's builder keynote",
    summary:
      'Foreign Minister Vivian Balakrishnan, NanoClaw, Raspberry Pi, and the "briefed on" line are one story: the keynote travelled because governance was framed through a minister visibly building and using his own AI workflow.',
  },
  'atlas-01-minister-balakrishnan-built': {
    label: "Minister's builder keynote",
    summary:
      'Foreign Minister Vivian Balakrishnan, NanoClaw, and the "briefed on" line drove the largest cross-platform spike, carried by high-view X clips plus LinkedIn recaps from Rachael De Foe, Sherry Jiang, and Yee Chien Cheot.',
  },
  'atlas-02-openai-cursor-codex': {
    label: 'OpenAI Codex presence',
    summary:
      'OpenAI showed up through the Codex booth, technical workshops, FDE lunch chat, Gabriel Chua daily recaps, and student-seat posts that treated the workshops as core event value.',
  },
  'atlas-03-agrimsingh-hackathon-second-brain': {
    label: 'Singapore builder debate',
    summary:
      'This cluster holds the argument around Singapore as a serious AI builder hub: organizer context from Agrim and 65labs, attendee day-two recaps, livestream reactions, and skeptical X pushback.',
  },
  'atlas-04-hackathon-kaspar-hidayat-video': {
    label: 'Livestreams and demos',
    summary:
      'Video and livestream refs made the event visible beyond the room, from Vivian Bala personal-agent posts to Day 2 YouTube coverage, Google DeepMind booth notes, and demo-stage moments.',
  },
  'atlas-05-aie-software-own': {
    label: 'Hallway energy',
    summary:
      'Attendees described dense hallway and VIP-dinner energy: startup/operator meetings, reconnections, practical leadership-track takeaways, and the feeling of many builders in one room.',
  },
  'atlas-06-openai-codex-kaspar-hidayat': {
    label: 'Scene afterglow',
    summary:
      'Post-event reflection clustered around "you are the scene", speaker recaps, OpenAI/Codex context, and people still processing how intense the weekend felt.',
  },
  'atlas-07-hackathon-live-say': {
    label: 'Side events and travel',
    summary:
      'Ralphthon, demo-stage posts, travel notes, sponsor side events, and livestream pointers show the broader AI week orbiting the main conference.',
  },
  'atlas-08-codex-night-hack': {
    label: 'Hack nights and unconference',
    summary:
      'Hack nights, unconference threads, Codex realtime experiments, and Road to AIE meetups turned the conference into a longer builder circuit rather than a single weekend.',
  },
  'atlas-09-google-google-deepmind-deepmind': {
    label: 'Sponsor ecosystem',
    summary:
      'Google DeepMind, Vercel, Cursor, and other sponsor or partner signals appeared through official livestreams, booth photos, happy-hour posts, and broader ecosystem recaps.',
  },
  'atlas-09-hackathon-talk-openai': {
    label: 'Around AIE: talks and side events',
    summary:
      'This story captures the wider AIE week around the main conference: talk recordings, sponsor booths, VIP dinners, hackathon notes, Ralphthon and AI Tinkerers side events, and visiting-builder recaps.',
  },
  'atlas-10-looking-kaspar-hidayat-codex': {
    label: 'Speakers and returning builders',
    summary:
      'Speakers and visiting builders used the event to reconnect the regional scene, with posts from Mark Doyle, Jim, Yong Quan, and others arranging talks, meetups, and return visits.',
  },
  'atlas-11-code-workshop-agentic': {
    label: 'Workshops and agentic workflows',
    summary:
      'Workshop-heavy refs centered on agentic workflows, x402 and payments, LlamaIndex enterprise-document sessions, Cerebras inference, and concrete implementation craft.',
  },
};

function loadEnvLocal() {
  const file = path.resolve('.env.local');
  if (!fs.existsSync(file)) return;
  const text = fs.readFileSync(file, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]]) continue;
    let value = match[2] ?? '';
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
}

function canonicalUrl(platform: EventPlatform, url: string): string {
  if (platform === 'x') {
    const match = url.match(/https?:\/\/(?:www\.)?(?:x|twitter)\.com\/([^/?#]+)\/status\/(\d+)/i);
    if (match) return `https://x.com/${match[1]}/status/${match[2]}`.toLowerCase();
  }
  if (platform === 'linkedin') {
    const match = url.match(/activity[:/-](\d+)/i);
    if (match) return `https://www.linkedin.com/feed/update/urn:li:activity:${match[1]}`.toLowerCase();
  }
  if (platform === 'youtube') {
    const canonical = youtubeCanonicalUrl(url);
    if (canonical) return canonical.toLowerCase();
  }
  return url.trim().split(/[?#]/)[0].replace(/\/$/, '').toLowerCase();
}

function youtubeId(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === 'youtu.be') return parsed.pathname.split('/').filter(Boolean)[0];
    if (/(^|\.)youtube\.com$/i.test(parsed.hostname)) return parsed.searchParams.get('v') ?? undefined;
  } catch {
    return undefined;
  }
  return undefined;
}

function youtubeCanonicalUrl(url: string): string | undefined {
  const id = youtubeId(url);
  if (!id) return undefined;
  try {
    const parsed = new URL(url);
    const commentId = parsed.searchParams.get('lc');
    if (commentId) return `https://www.youtube.com/watch?v=${id}&lc=${commentId}`;
    if (parsed.hash.startsWith('#live-chat-')) return `https://www.youtube.com/watch?v=${id}${parsed.hash}`;
  } catch {
    return undefined;
  }
  return `https://www.youtube.com/watch?v=${id}`;
}

function isRelevant(post: EventPost): boolean {
  return !(post.tags ?? []).includes('irrelevant:event');
}

type EventRelevanceTier = 'core' | 'context' | 'irrelevant';

function curatePosts(posts: EventPost[]): { posts: EventPost[]; changed: number; hidden: number } {
  let changed = 0;
  let hidden = 0;
  const curated = posts.map((post) => {
    const text = cleanPrimaryText(post);
    const tier = classifyEventRelevance(post, text);
    const relevant = tier !== 'irrelevant';
    const tags = (post.tags ?? []).filter(
      (tag) =>
        tag !== 'relevant:event' &&
        tag !== 'irrelevant:event' &&
        tag !== 'irrelevant:incidental-event-mention' &&
        tag !== 'context:event' &&
        !tag.startsWith('relevance:')
    );
    if (!relevant && isIncidentalEventMentionPost(post, text)) {
      tags.push('irrelevant:incidental-event-mention');
    }
    if (tier === 'core') {
      tags.push('relevant:event', 'relevance:core');
    } else if (tier === 'context') {
      tags.push('relevant:event', 'context:event', 'relevance:context');
    } else {
      tags.push('irrelevant:event');
    }
    if (!relevant) hidden += 1;
    const next = enrichPostConversationTags({
      ...post,
      text,
      tags,
      updatedAt: Date.now(),
    });
    if (next.text !== post.text || relevant !== isRelevant(post)) changed += 1;
    return next;
  });
  return { posts: curated, changed, hidden };
}

function classifyEventRelevance(post: EventPost, text = cleanPrimaryText(post)): EventRelevanceTier {
  if (eventRelevant(post, text)) return 'core';
  if (eventContextRelevant(post, text)) return 'context';
  return 'irrelevant';
}

function cleanPrimaryText(post: EventPost): string {
  let text = String(post.text ?? '').replace(/\r/g, '').trim();
  if (post.platform === 'linkedin') {
    text = text
      .replace(/^#\s+(.+?)’s Post\s*\n+\1\s*\n+/i, '')
      .replace(/^#\s+(.+?)'s Post\s*\n+\1\s*\n+/i, '');
    for (const marker of [
      '\n\n## More Relevant Posts',
      '\n\nMore Relevant Posts',
      '\n\nTo view or add a comment',
      '\n\nComments',
      '\n\nReactions',
      '\n\nVideo Player is loading',
    ]) {
      const index = text.indexOf(marker);
      if (index > 0) text = text.slice(0, index).trim();
    }
    text = text
      .replace(/\s*## Sign in to view more content[\s\S]*$/i, '')
      .replace(/\s*To view or add a comment, sign in[\s\S]*$/i, '')
      .trim();
  }
  return text.replace(/\n{3,}/g, '\n\n').trim();
}

function eventRelevant(post: EventPost, text = cleanPrimaryText(post)): boolean {
  if (post.platform === 'youtube') return youtubeRelevant(post, text);
  const blob = `${text} ${post.authorHandle ?? ''} ${post.authorName ?? ''} ${post.url}`;
  const lower = blob.toLowerCase();
  if (isHardNoise(lower)) return false;
  if (isAdjacentGrabMapsHackathonNoise(lower)) return false;
  if (isAdjacent65LabsProgramNoise(lower)) return false;
  if (isAdjacentGenericAiEngineeringNoise(lower)) return false;
  if (isGenericAiCareerNoise(lower)) return false;
  if (isLowSignalEventOnlyText(blob)) return false;

  const exactEvent =
    /\bai engineer singapore\b/i.test(blob) ||
    /\bai engineers singapore\b/i.test(blob) ||
    /\bai engineer sg\b/i.test(blob) ||
    /\bai engineer summit singapore\b/i.test(blob) ||
    /\bai engineer conference singapore\b/i.test(blob) ||
    /\baie singapore\b/i.test(blob) ||
    /#(?:aiengineersingapore|aiengineersg|aiesg)\b/i.test(blob) ||
    hasAiDotEngineerSingaporeSignal(blob) ||
    /\bai\.engineer[\/\s]+singapore\b/i.test(blob) ||
    /\broad to aie\b/i.test(blob);
  if (exactEvent) return !isIncidentalExactEventMention(blob) && hasAiEngineeringOrProgramSignal(blob);

  const eventPhrase = hasAieSingaporePhrase(blob);
  if (eventPhrase) return !isGenericHiringNoise(lower) && hasAiEngineeringOrProgramSignal(blob);

  const ministerKeynote =
    /\b(vivian balakrishnan|foreign minister|minister for foreign affairs|vivianbala)\b/i.test(blob) &&
    /\b(second brain|personal ai agent|dev conference|developer conference|govern a technology|graph memory|sqlite|whatsapp|nanoclaw)\b/i.test(blob);
  if (ministerKeynote) return true;

  const nanoClawEvent =
    /nanoclaw/i.test(blob) &&
    /\b(ai engineer|aie|conference|summit|keynote|minister|vivian|cabinet minister)\b/i.test(blob);
  if (nanoClawEvent) return true;

  const knownPeopleAnchor =
    /\b(sherry yan jiang|sherrypeek|agrim singh|gabriel chua|gavriel_cohen|nanoclaw|ryo lu|jj geewax)\b/i.test(blob) &&
    hasKnownPersonEventSignal(blob);
  const known65LabsAnchor =
    /\b65labs\b/i.test(blob) &&
    hasKnownPersonEventSignal(blob);
  return (knownPeopleAnchor || known65LabsAnchor) && hasAiEngineeringOrProgramSignal(blob);
}

function eventContextRelevant(post: EventPost, text = cleanPrimaryText(post)): boolean {
  if (post.platform === 'youtube') return false;
  const blob = `${text} ${post.authorHandle ?? ''} ${post.authorName ?? ''} ${post.url}`;
  const lower = blob.toLowerCase();
  if (isHardNoise(lower)) return false;
  if (isAdjacentGrabMapsHackathonNoise(lower)) return false;
  if (isAdjacent65LabsProgramNoise(lower)) return false;
  if (isAdjacentGenericAiEngineeringNoise(lower)) return false;
  if (isGenericAiCareerNoise(lower)) return false;
  if (isGenericHiringNoise(lower)) return false;
  if (isIncidentalExactEventMention(blob) || isIncidentalAieMention(blob)) return false;

  const eventAnchor = hasExplicitAieSignal(blob) || hasAieSingaporePhrase(blob);
  if (!eventAnchor) return false;
  return hasEventContextSignal(blob) || Boolean(post.media?.length);
}

function youtubeRelevant(post: EventPost, text = cleanPrimaryText(post)): boolean {
  const tags = (post.tags ?? []).map((tag) => tag.toLowerCase());
  if (tags.includes('youtube-video')) return true;
  const isComment =
    tags.includes('youtube-comment') ||
    tags.includes('youtube-live-chat') ||
    post.url.includes('&lc=') ||
    post.url.includes('#live-chat-');
  if (!isComment) return true;

  const normalized = text
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (isLowSignalYoutubeComment(normalized)) return false;

  return hasExplicitAieSignal(normalized) || hasAiEngineeringOrProgramSignal(normalized);
}

function isLowSignalYoutubeComment(text: string): boolean {
  if (!text) return true;
  if (/^(thank(s| you)?|thanks!|thank you!|great|nice|awesome|cool|fantastic|love this|loved this|amazing|super|wow)[.!\s]*$/i.test(text)) {
    return true;
  }
  if (/^(starts?\s+at|timestamp|time stamp|please add (the )?transcript|transcript please)\b/i.test(text)) {
    return true;
  }
  if (text.length < 32 && !hasExplicitAieSignal(text)) return true;
  return false;
}

function isIncidentalEventMentionPost(post: EventPost, text = cleanPrimaryText(post)): boolean {
  return isIncidentalExactEventMention(`${text} ${post.authorHandle ?? ''} ${post.authorName ?? ''} ${post.url}`);
}

function isHardNoise(text: string): boolean {
  if (/\b(austcham|australian international school|sandboxaq|nigerian english|cerebras ipo|bnpl|buy now, pay later|crypto vc fund partner|drugging a girl's drink|ai everything\s*\(aie\)|ai everything singapore)\b/i.test(text)) {
    return true;
  }
  return false;
}

function isAdjacentGrabMapsHackathonNoise(text: string): boolean {
  const grabMapsHackathon =
    /\bgrabmaps\b.{0,100}\bhackathon\b/i.test(text) ||
    /\bhackathon\b.{0,100}\bgrabmaps\b/i.test(text) ||
    /\bunreleased grabmaps apis\b/i.test(text);
  if (!grabMapsHackathon) return false;

  return !(
    (/(\b(ai engineer|aie|road to aie)\b|#(?:aiengineersingapore|aiengineersg|aiesg)\b).{0,140}\bhackathon\b/i.test(text) ||
      /\bhackathon\b.{0,140}(\b(ai engineer|aie|road to aie)\b|#(?:aiengineersingapore|aiengineersg|aiesg)\b)/i.test(text)) ||
    /\bspent\s+7\s+hours\b.{0,140}\b(ai engineer|aie)\b/i.test(text) ||
    /\bwhen ai engineer sg opened registration\b/i.test(text)
  );
}

function hasAieSingaporePhrase(text: string): boolean {
  const eventPlace = /\b(singapore|sg|capitol|kempinski|pullman|65labs|may\s*1[5-7])\b/i;
  return (
    /\bai engineer\b[\s\S]{0,100}\b(singapore|sg|capitol|kempinski|pullman|65labs)\b/i.test(text) ||
    /\b(singapore|sg|capitol|kempinski|pullman)\b[\s\S]{0,80}\b(for|at|@|during|to)\s+(?:the\s+)?ai engineer\b/i.test(text) ||
    (/\b(ai engineer|aie)\b[\s\S]{0,100}\b(conference|summit|hackathon|workshops?|speaker|stage|program)\b/i.test(text) &&
      eventPlace.test(text)) ||
    (/\b(conference|summit|hackathon|workshops?|speaker|stage|program)\b[\s\S]{0,100}\b(ai engineer|aie)\b/i.test(text) &&
      eventPlace.test(text))
  );
}

function isAdjacent65LabsProgramNoise(text: string): boolean {
  const adjacentProgram =
    /\b65labs\b/i.test(text) &&
    /\b(code with ai|coding with ai|vibe[-\s]?coding|ai workshop|workshop frees up coding time|classes?|cohort)\b/i.test(text);
  if (!adjacentProgram) return false;

  return !/\b(ai engineer singapore|ai engineer sg|aie singapore|road to aie|ai\.engineer[\/\s]+singapore|capitol|kempinski|pullman|may\s*1[5-7]|conference|summit|speaker reveal|main conference)\b/i.test(text);
}

function isAdjacentGenericAiEngineeringNoise(text: string): boolean {
  const genericAiEngineering =
    /\b(ai engineering|ai & data engineering|data & ai engineering|ai in production|ai engineering in production)\b/i.test(text) ||
    /#aiengineering\b/i.test(text);
  if (!genericAiEngineering || hasExplicitAieSignal(text)) return false;

  return /\b(singapore data meetup|red hat singapore|zenika|rag in production|data engineering session|singapore airlines|palo it|github copilot|aiap|ai apprenticeship|career forward|suntec singapore|career as an ai engineer)\b/i.test(text);
}

function isGenericAiCareerNoise(text: string): boolean {
  const career =
    /\b(career forward|job seekers?|admission is free|aiap|ai apprenticeship|kickstart your career|becoming an ai engineer|building a career as an ai engineer|career in ai)\b/i.test(text);
  return career && !hasExplicitAieSignal(text);
}

function isGenericHiringNoise(text: string): boolean {
  const hiring =
    /\b(hiring|we'?re hiring|job opening|job posting|job ad|jobs page|open roles?|rewarding roles?|explore more roles?|open positions?|vacancy|resume|cv|apply now|candidate|recruiting|kerry consulting|distributing training|software engineer|data engineer|machine learning engineer)\b/i.test(text);
  const event =
    /\b(ai engineer singapore|aie singapore|ai\.engineer[\/\s]+singapore|road to aie)\b/i.test(text) ||
    /#(?:aiengineersingapore|aiengineersg|aiesg)\b/i.test(text);
  return hiring && !event;
}

function hasExplicitAieSignal(text: string): boolean {
  return (
    (/\b(ai engineer singapore|ai engineers singapore|ai engineer sg|ai engineer summit singapore|ai engineer conference singapore|aie(?:\s+here\s+in)?\s+singapore|ai\.engineer[\/\s]+singapore|road to aie)\b/i.test(text) ||
      /#(?:aiengineersingapore|aiengineersg|aiesg)\b/i.test(text)) ||
    hasAiDotEngineerSingaporeSignal(text)
  );
}

function hasAiDotEngineerSingaporeSignal(text: string): boolean {
  return (
    /\baidotengineer\b[\s\S]{0,160}\b(singapore|sg|capitol|kempinski|pullman)\b/i.test(text) ||
    /\b(singapore|sg|capitol|kempinski|pullman)\b[\s\S]{0,160}\baidotengineer\b/i.test(text) ||
    /\baidotengineer\b[\s\S]{0,100}🇸🇬/i.test(text) ||
    /🇸🇬[\s\S]{0,100}\baidotengineer\b/i.test(text)
  );
}

function hasKnownPersonEventSignal(text: string): boolean {
  const venueOrDate = /\b(capitol|kempinski|pullman|may\s*1[5-7])\b/i.test(text);
  const programSignal =
    /\b(codex booth|codex technical workshop|codex for everyone workshop|fde @ openai|fde lunchtime chat)\b/i.test(text);
  const stageSignal =
    /\b(main conference|conference day|day\s*[123]|keynote)\b/i.test(text) &&
    /\b(ai engineer|aie|singapore|65labs|openai|codex|cursor|google deepmind|deepmind|nanoclaw)\b/i.test(text);
  return hasExplicitAieSignal(text) || venueOrDate || programSignal || stageSignal;
}

function isIncidentalExactEventMention(text: string): boolean {
  const exactMentions = [
    ...text.matchAll(
      /\b(ai engineer singapore|ai engineers singapore|ai engineer sg|ai engineer summit singapore|ai engineer conference singapore|aie singapore|ai\.engineer[\/\s]+singapore|road to aie)\b|#(?:aiengineersingapore|aiengineersg|aiesg)\b/gi
    ),
  ].length;
  if (exactMentions !== 1 || text.length < 900) return false;

  const eventSpecificSignal =
    /\b(vivian balakrishnan|vivianbala|foreign minister|keynote|conference|summit|takeaways?|presented|workshops?|technical workshop|speakers?|talks?|panels?|sessions?|stage|booths?|sponsors?|side event|live demos?|capitol|kempinski|pullman|singapore management university|smu|65labs|openai|codex|cursor|google deepmind|deepmind|nanoclaw|llamaindex|cerebras|vercel|day\s*[123]|recap|livestream|unconference|project6|ralphthon|sherry jiang|sherrypeek|agrim singh|rachael de foe|gabriel chua|yee chien cheot)\b/i.test(
      text
    );
  if (eventSpecificSignal) return false;

  const aieHackathonBuildArtifact =
    /\b(built|shipped|launched|demoed|submitted|won|created)\b.{0,120}\b(aie singapore|ai engineer singapore|ai engineer sg)\b.{0,80}\bhackathon\b/i.test(text) ||
    /\b(aie singapore|ai engineer singapore|ai engineer sg)\b.{0,80}\bhackathon\b.{0,120}\b(built|shipped|launched|demoed|submitted|won|created)\b/i.test(text);
  if (aieHackathonBuildArtifact) return false;

  return true;
}

function youtubePostsFromArchive(archive: Record<string, any>): EventPost[] {
  const now = Date.now();
  const channelByName = new Map<string, Record<string, any>>();
  for (const channel of archive.youtube?.channelSummary ?? []) {
    if (channel?.channel) channelByName.set(String(channel.channel).trim(), channel);
  }
  const videos = Array.isArray(archive.youtube?.topVideos) ? archive.youtube.topVideos : [];
  return videos
    .filter((video: Record<string, any>) => video?.relevance?.relevant !== false)
    .map((video: Record<string, any>) => {
      const url = String(video.url ?? `https://www.youtube.com/watch?v=${video.id}`);
      const id = String(video.id ?? youtubeId(url) ?? '');
      const channel = String(video.channel ?? 'YouTube');
      const channelMeta = channelByName.get(channel.trim()) ?? {};
      const title = String(video.title ?? 'YouTube video');
      const text = `YouTube video: ${title}`;
      const tags = [
        'youtube-video',
        'event-recap',
        'recap-artifact',
        'relevant:event',
        ...(Array.isArray(video.relevance?.reasons)
          ? video.relevance.reasons.map((reason: unknown) => `relevance:${String(reason)}`)
          : []),
      ];
      const post: EventPost = {
        postId: makePostId('youtube', url, text),
        eventId: String(archive.eventId),
        runId: RUN_ID,
        platform: 'youtube',
        url,
        authorName: channel,
        authorHandle: channelMeta.uploaderId,
        authorUrl: channelMeta.uploaderId
          ? `https://www.youtube.com/${channelMeta.uploaderId}`
          : channelMeta.channelId
            ? `https://www.youtube.com/channel/${channelMeta.channelId}`
            : undefined,
        authorMeta: {
          followers: numberValue(video.channelFollowerCount ?? channelMeta.channelFollowerCount),
        },
        text,
        capturedAt: now,
        updatedAt: now,
        metrics: {
          views: numberValue(video.viewCount),
          likes: numberValue(video.likeCount),
          comments: numberValue(video.commentCount),
        },
        media: id
          ? [
              {
                url: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
                type: 'image',
                source: 'youtube-thumbnail',
                altText: `Video thumbnail: ${title}`,
                localPath: video.thumbnailLocalPath,
              },
            ]
          : undefined,
        reachScore: 0,
        tags,
        raw: video,
      };
      return enrichPostConversationTags(post);
    });
}

function numberValue(value: unknown): number | undefined {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function mergePosts(existing: EventPost[], incoming: EventPost[]): { posts: EventPost[]; added: number; updated: number } {
  const byUrl = new Map<string, EventPost>();
  for (const post of existing) byUrl.set(canonicalUrl(post.platform, post.url), post);
  let added = 0;
  let updated = 0;
  for (const post of incoming) {
    const key = canonicalUrl(post.platform, post.url);
    const previous = byUrl.get(key);
    if (!previous) {
      byUrl.set(key, post);
      added += 1;
    } else {
      byUrl.set(key, mergePost(previous, post));
      updated += 1;
    }
  }
  return { posts: Array.from(byUrl.values()), added, updated };
}

function mergePost(previous: EventPost, incoming: EventPost): EventPost {
  const text =
    previous.platform === 'youtube' && previous.text.length > incoming.text.length
      ? previous.text
      : incoming.text || previous.text;
  const media = mergeMedia(previous.media, incoming.media);
  return {
    ...previous,
    authorName: incoming.authorName || previous.authorName,
    authorHandle: incoming.authorHandle ?? previous.authorHandle,
    authorUrl: incoming.authorUrl ?? previous.authorUrl,
    authorMeta: { ...previous.authorMeta, ...incoming.authorMeta },
    text,
    postedAt: incoming.postedAt ?? previous.postedAt,
    metrics: { ...previous.metrics, ...incoming.metrics },
    media: media.length ? media : previous.media,
    tags: Array.from(new Set([...(previous.tags ?? []), ...(incoming.tags ?? [])])),
    raw: { previous: previous.raw, enrichment: incoming.raw },
    updatedAt: incoming.updatedAt,
  };
}

function mergeMedia(previous: EventPost['media'], incoming: EventPost['media']): EventPostMedia[] {
  const byUrl = new Map<string, EventPostMedia>();
  for (const item of previous ?? []) byUrl.set(item.url, item);
  for (const item of incoming ?? []) {
    const existing = byUrl.get(item.url);
    byUrl.set(item.url, existing ? { ...item, ...existing, localPath: existing.localPath ?? item.localPath } : item);
  }
  return Array.from(byUrl.values());
}

async function summarizeThemesWithLLM(themes: EventTheme[], posts: EventPost[]): Promise<ThemeSummaryResult> {
  if (process.env.EVENT_RECAP_FINALIZE_LLM === '0') {
    return { themes: applyCuratedThemeCopy(themes), strategy: 'local-fallback-disabled-llm' };
  }
  const byId = new Map(posts.map((post) => [post.postId, post]));
  const payload: ThemeRewritePayloadItem[] = themes.map((theme) => ({
    themeId: theme.themeId,
    label: theme.label,
    keywords: theme.keywords.slice(0, 8),
    postCount: theme.postIds.length,
    evidence: (theme.rootPostIds?.length ? theme.rootPostIds : theme.postIds)
      .map((postId) => byId.get(postId))
      .filter((post): post is EventPost => Boolean(post))
      .sort((a, b) => b.reachScore - a.reachScore)
      .slice(0, 8)
      .map((post) => ({
        platform: post.platform,
        author: post.authorHandle ?? post.authorName ?? 'unknown',
        url: post.url,
        metrics: post.metrics,
        text: shortExcerpt(post.text, 260),
      })),
  }));
  const allThemeIds = new Set(themes.map((theme) => theme.themeId));
  const errors: string[] = [];
  let triedOpenAI = false;
  const tryOpenAI = async () => {
    if (triedOpenAI) return undefined;
    triedOpenAI = true;
    return tryOpenAIThemeRewrite({ themes, payload, allThemeIds, priorErrors: errors });
  };

  if (process.env.EVENT_RECAP_FINALIZE_PRIMARY?.toLowerCase() === 'openai') {
    const openaiResult = await tryOpenAI();
    if (openaiResult) return openaiResult;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    const openaiResult = await tryOpenAI();
    if (openaiResult) return openaiResult;
    return { themes: applyCuratedThemeCopy(themes), strategy: 'local-fallback-disabled-llm' };
  }
  const model = process.env.EVENT_RECAP_FINALIZE_MODEL?.trim() || DEFAULT_MODEL;
  const client = new Anthropic({ apiKey });

  try {
    const byThemeId = await requestThemeRewriteWithRetry(
      {
        client,
        model,
        payload,
        allowedThemeIds: allThemeIds,
        maxTokens: envNumber('EVENT_RECAP_FINALIZE_FULL_MAX_TOKENS', 5200, 1200, 12000),
        instruction:
          'Rewrite these event-recap cluster labels and summaries. Keep every themeId unchanged. Return one entry per supplied theme.',
      },
      { attempts: 2, retryParseErrors: false }
    );
    return {
      model,
      strategy: 'full-structured',
      themes: applyThemeRewrite(themes, byThemeId),
    };
  } catch (err) {
    errors.push(`full structured relabel failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  const chunkSize = envNumber('EVENT_RECAP_FINALIZE_LLM_CHUNK_SIZE', 4, 1, 8);
  const byThemeId = new Map<string, { label: string; summary: string }>();
  for (let index = 0; index < payload.length; index += chunkSize) {
    const chunk = payload.slice(index, index + chunkSize);
    await requestThemeRewriteChunk({
      client,
      model,
      chunk,
      chunkLabel: `${Math.floor(index / chunkSize) + 1}`,
      byThemeId,
      errors,
      depth: 0,
    });
  }

  const missingThemeIds = Array.from(allThemeIds).filter((themeId) => !byThemeId.has(themeId));
  if (!missingThemeIds.length) {
    return {
      model,
      strategy: `chunked-structured-${chunkSize}`,
      themes: applyThemeRewrite(themes, byThemeId),
      warning: errors.join(' | ') || undefined,
    };
  }

  errors.push(
    `structured relabel incomplete; missing theme ids: ${missingThemeIds.join(', ')}`
  );
  const openaiResult = await tryOpenAI();
  if (openaiResult) return openaiResult;

  const error = [
    ...errors,
  ].join(' | ');
  if (process.env.EVENT_RECAP_FINALIZE_ALLOW_LABEL_FALLBACK === '1') {
    return {
      themes: applyCuratedThemeCopy(themes),
      model,
      strategy: 'local-fallback-after-llm-error',
      error,
    };
  }
  throw new Error(error);
}

async function tryOpenAIThemeRewrite(input: {
  themes: EventTheme[];
  payload: ThemeRewritePayloadItem[];
  allThemeIds: Set<string>;
  priorErrors: string[];
}): Promise<ThemeSummaryResult | undefined> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return undefined;
  const model = process.env.EVENT_RECAP_FINALIZE_OPENAI_MODEL?.trim() || DEFAULT_OPENAI_MODEL;
  const errors: string[] = [];

  try {
    const byThemeId = await requestOpenAIThemeRewriteWithRetry(
      {
        apiKey,
        model,
        payload: input.payload,
        allowedThemeIds: input.allThemeIds,
        maxTokens: envNumber('EVENT_RECAP_FINALIZE_OPENAI_FULL_MAX_TOKENS', 5200, 1200, 12000),
        instruction:
          'Rewrite these event-recap cluster labels and summaries. Keep every themeId unchanged. Return one entry per supplied theme.',
      },
      { attempts: 2, retryParseErrors: false }
    );
    return {
      model: `openai:${model}`,
      strategy: 'openai-full-structured',
      themes: applyThemeRewrite(input.themes, byThemeId),
      warning: input.priorErrors.join(' | ') || undefined,
    };
  } catch (err) {
    errors.push(`openai full structured relabel failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  const chunkSize = envNumber('EVENT_RECAP_FINALIZE_OPENAI_CHUNK_SIZE', 4, 1, 8);
  const byThemeId = new Map<string, { label: string; summary: string }>();
  for (let index = 0; index < input.payload.length; index += chunkSize) {
    await requestOpenAIThemeRewriteChunk({
      apiKey,
      model,
      chunk: input.payload.slice(index, index + chunkSize),
      chunkLabel: `${Math.floor(index / chunkSize) + 1}`,
      byThemeId,
      errors,
    });
  }

  const missingThemeIds = Array.from(input.allThemeIds).filter((themeId) => !byThemeId.has(themeId));
  if (!missingThemeIds.length) {
    return {
      model: `openai:${model}`,
      strategy: `openai-chunked-structured-${chunkSize}`,
      themes: applyThemeRewrite(input.themes, byThemeId),
      warning: [...input.priorErrors, ...errors].join(' | ') || undefined,
    };
  }

  input.priorErrors.push(
    ...errors,
    `openai structured relabel incomplete; missing theme ids: ${missingThemeIds.join(', ')}`
  );
  return undefined;
}

async function requestOpenAIThemeRewriteChunk(input: {
  apiKey: string;
  model: string;
  chunk: ThemeRewritePayloadItem[];
  chunkLabel: string;
  byThemeId: Map<string, { label: string; summary: string }>;
  errors: string[];
}): Promise<void> {
  const chunkThemeIds = new Set(input.chunk.map((theme) => theme.themeId));
  try {
    const chunkRewrite = await requestOpenAIThemeRewriteWithRetry(
      {
        apiKey: input.apiKey,
        model: input.model,
        payload: input.chunk,
        allowedThemeIds: chunkThemeIds,
        maxTokens: envNumber('EVENT_RECAP_FINALIZE_OPENAI_CHUNK_MAX_TOKENS', 2200, 800, 6000),
        instruction:
          'Rewrite this smaller batch of event-recap cluster labels and summaries. Keep every themeId unchanged. Return one entry per supplied theme.',
      },
      {
        attempts: envNumber('EVENT_RECAP_FINALIZE_OPENAI_RETRIES', 4, 1, 10),
        retryParseErrors: true,
      }
    );
    for (const [themeId, rewrite] of chunkRewrite) input.byThemeId.set(themeId, rewrite);
    return;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (input.chunk.length <= 1) {
      input.errors.push(`openai chunk ${input.chunkLabel} relabel failed: ${message}`);
      return;
    }
    input.errors.push(
      `openai chunk ${input.chunkLabel} relabel failed; retrying as smaller batches: ${message}`
    );
  }

  const midpoint = Math.ceil(input.chunk.length / 2);
  await requestOpenAIThemeRewriteChunk({
    ...input,
    chunk: input.chunk.slice(0, midpoint),
    chunkLabel: `${input.chunkLabel}a`,
  });
  await requestOpenAIThemeRewriteChunk({
    ...input,
    chunk: input.chunk.slice(midpoint),
    chunkLabel: `${input.chunkLabel}b`,
  });
}

async function requestOpenAIThemeRewriteWithRetry(
  input: {
    apiKey: string;
    model: string;
    payload: unknown[];
    allowedThemeIds: Set<string>;
    maxTokens: number;
    instruction: string;
  },
  options: { attempts: number; retryParseErrors: boolean }
): Promise<Map<string, { label: string; summary: string }>> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= options.attempts; attempt += 1) {
    try {
      return await requestOpenAIThemeRewrite(input);
    } catch (err) {
      lastError = err;
      if (attempt >= options.attempts || !shouldRetryThemeRewrite(err, options.retryParseErrors)) break;
      const baseMs = envNumber('EVENT_RECAP_FINALIZE_LLM_RETRY_BASE_MS', 1500, 250, 10000);
      await sleep(baseMs * attempt * attempt);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function requestOpenAIThemeRewrite(input: {
  apiKey: string;
  model: string;
  payload: unknown[];
  allowedThemeIds: Set<string>;
  maxTokens: number;
  instruction: string;
}): Promise<Map<string, { label: string; summary: string }>> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: input.model,
      max_completion_tokens: input.maxTokens,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'event_recap_theme_rewrite',
          strict: true,
          schema: THEME_REWRITE_SCHEMA,
        },
      },
      messages: [
        {
          role: 'system',
          content:
            'You write concise creator-facing research cluster summaries. Preserve evidence and provenance, avoid ops language, and do not invent facts beyond the supplied posts.',
        },
        {
          role: 'user',
          content: `${input.instruction}\n\n${JSON.stringify(input.payload)}`,
        },
      ],
    }),
  });
  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`OpenAI ${response.status}: ${redactSecret(raw).slice(0, 700)}`);
  }
  const json = JSON.parse(raw) as {
    choices?: Array<{ message?: { content?: string | null } }>;
  };
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error('OpenAI response did not include structured content');
  return parseThemeRewriteInput(JSON.parse(content), input.allowedThemeIds);
}

async function requestThemeRewriteChunk(input: {
  client: Anthropic;
  model: string;
  chunk: ThemeRewritePayloadItem[];
  chunkLabel: string;
  byThemeId: Map<string, { label: string; summary: string }>;
  errors: string[];
  depth: number;
}): Promise<void> {
  const chunkThemeIds = new Set(input.chunk.map((theme) => theme.themeId));
  try {
    const chunkRewrite = await requestThemeRewriteWithRetry(
      {
        client: input.client,
        model: input.model,
        payload: input.chunk,
        allowedThemeIds: chunkThemeIds,
        maxTokens: envNumber('EVENT_RECAP_FINALIZE_CHUNK_MAX_TOKENS', 2200, 800, 6000),
        instruction:
          'Rewrite this smaller batch of event-recap cluster labels and summaries. Keep every themeId unchanged. Return one entry per supplied theme.',
      },
      {
        attempts: envNumber('EVENT_RECAP_FINALIZE_LLM_RETRIES', 5, 1, 10),
        retryParseErrors: true,
      }
    );
    for (const [themeId, rewrite] of chunkRewrite) input.byThemeId.set(themeId, rewrite);
    return;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (input.chunk.length <= 1) {
      input.errors.push(`chunk ${input.chunkLabel} relabel failed: ${message}`);
      return;
    }
    input.errors.push(
      `chunk ${input.chunkLabel} relabel failed; retrying as smaller batches: ${message}`
    );
  }

  const midpoint = Math.ceil(input.chunk.length / 2);
  await requestThemeRewriteChunk({
    ...input,
    chunk: input.chunk.slice(0, midpoint),
    chunkLabel: `${input.chunkLabel}a`,
    depth: input.depth + 1,
  });
  await requestThemeRewriteChunk({
    ...input,
    chunk: input.chunk.slice(midpoint),
    chunkLabel: `${input.chunkLabel}b`,
    depth: input.depth + 1,
  });
}

async function requestThemeRewriteWithRetry(
  input: {
    client: Anthropic;
    model: string;
    payload: unknown[];
    allowedThemeIds: Set<string>;
    maxTokens: number;
    instruction: string;
  },
  options: { attempts: number; retryParseErrors: boolean }
): Promise<Map<string, { label: string; summary: string }>> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= options.attempts; attempt += 1) {
    try {
      return await requestThemeRewrite(input);
    } catch (err) {
      lastError = err;
      if (attempt >= options.attempts || !shouldRetryThemeRewrite(err, options.retryParseErrors)) break;
      const baseMs = envNumber('EVENT_RECAP_FINALIZE_LLM_RETRY_BASE_MS', 1500, 250, 10000);
      await sleep(baseMs * attempt * attempt);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function shouldRetryThemeRewrite(err: unknown, retryParseErrors: boolean): boolean {
  const message = err instanceof Error ? err.message : String(err);
  if (/\b(429|529|overloaded|rate.?limit|timeout|ECONNRESET|ETIMEDOUT|temporar)/i.test(message)) {
    return true;
  }
  return retryParseErrors && /parse structured output|unterminated string|not valid json|JSON/i.test(message);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function redactSecret(text: string): string {
  return text.replace(/(?:sk|ant|apify_api)_[A-Za-z0-9_-]{12,}/g, '[redacted]');
}

async function requestThemeRewrite(input: {
  client: Anthropic;
  model: string;
  payload: unknown[];
  allowedThemeIds: Set<string>;
  maxTokens: number;
  instruction: string;
}): Promise<Map<string, { label: string; summary: string }>> {
  const msg = await input.client.messages.parse({
    model: input.model,
    max_tokens: input.maxTokens,
    system:
      'You write concise creator-facing research cluster summaries. Preserve evidence and provenance, avoid ops language, and do not invent facts beyond the supplied posts.',
    output_config: {
      format: {
        type: 'json_schema',
        schema: THEME_REWRITE_SCHEMA,
      },
    },
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `${input.instruction}\n\n${JSON.stringify(input.payload)}`,
          },
        ],
      },
    ],
  });
  return parseThemeRewriteInput(parsedThemeRewriteOutput(msg), input.allowedThemeIds);
}

function applyThemeRewrite(
  themes: EventTheme[],
  byThemeId: Map<string, { label: string; summary: string }>
): EventTheme[] {
  const updatedAt = Date.now();
  return themes.map((theme) => {
    const next = byThemeId.get(theme.themeId);
    if (!next) {
      throw new Error(`Missing relabel for theme ${theme.themeId}`);
    }
    return {
      ...theme,
      label: next.label.trim(),
      summary: next.summary.trim(),
      updatedAt,
    };
  });
}

function envNumber(name: string, fallback: number, min: number, max: number): number {
  const value = Number(process.env[name]);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

function parsedThemeRewriteOutput(message: unknown): unknown {
  const parsed = (message as { parsed_output?: unknown }).parsed_output;
  if (parsed) return parsed;
  const text = (message as { content?: Array<{ type?: string; text?: string }> }).content
    ?.map((item) => (item.type === 'text' ? item.text ?? '' : ''))
    .join('\n')
    .trim();
  if (!text) return parsed;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  return JSON.parse(fenced ?? text);
}

function parseThemeRewriteInput(
  input: unknown,
  allowedThemeIds: Set<string>
): Map<string, { label: string; summary: string }> {
  if (!input || typeof input !== 'object') throw new Error('Theme rewrite tool input was not an object');
  const themes = (input as { themes?: unknown }).themes;
  if (!Array.isArray(themes)) throw new Error('Theme rewrite tool input did not include a themes array');

  const byThemeId = new Map<string, { label: string; summary: string }>();
  for (const item of themes) {
    if (!item || typeof item !== 'object') continue;
    const theme = item as { themeId?: unknown; label?: unknown; summary?: unknown };
    if (typeof theme.themeId !== 'string' || !allowedThemeIds.has(theme.themeId)) continue;
    if (typeof theme.label !== 'string' || typeof theme.summary !== 'string') continue;
    const label = theme.label.trim();
    const summary = theme.summary.trim();
    if (!label || !summary) continue;
    byThemeId.set(theme.themeId, { label, summary });
  }

  if (!byThemeId.size) throw new Error('Theme rewrite tool input did not contain any usable themes');
  const missingThemeIds = Array.from(allowedThemeIds).filter((themeId) => !byThemeId.has(themeId));
  if (missingThemeIds.length) {
    throw new Error(`Theme rewrite tool input missed theme ids: ${missingThemeIds.join(', ')}`);
  }
  return byThemeId;
}

function applyCuratedThemeCopy(themes: EventTheme[]): EventTheme[] {
  const updatedAt = Date.now();
  return themes.map((theme) => {
    const curated = CURATED_THEME_COPY[theme.themeId];
    if (!curated) return theme;
    return {
      ...theme,
      label: curated.label,
      summary: curated.summary,
      updatedAt,
    };
  });
}

function consolidateAiEngineerSingaporeStories(themes: EventTheme[], posts: EventPost[]): EventTheme[] {
  const byId = new Map(posts.map((post) => [post.postId, post]));
  const vivianThemes = themes.filter((theme) => isVivianBuilderTheme(theme, byId));
  if (vivianThemes.length < 2) return themes;

  const vivianIds = new Set(vivianThemes.map((theme) => theme.themeId));
  const insertIndex = themes.findIndex((theme) => vivianIds.has(theme.themeId));
  const merged = mergeThemes('story-vivian-builder-keynote', "Vivian's builder keynote", vivianThemes, posts);
  return [
    ...themes.slice(0, insertIndex),
    merged,
    ...themes.slice(insertIndex).filter((theme) => !vivianIds.has(theme.themeId)),
  ];
}

function isVivianBuilderTheme(theme: EventTheme, byId: Map<string, EventPost>): boolean {
  const rootPosts = (theme.rootPostIds ?? theme.postIds)
    .map((postId) => byId.get(postId))
    .filter((post): post is EventPost => Boolean(post));
  const matchingRoots = rootPosts.filter(isVivianBuilderPost).length;
  const rootShare = rootPosts.length ? matchingRoots / rootPosts.length : 0;
  if (rootShare >= 0.35 || (matchingRoots >= 12 && rootShare >= 0.2)) return true;

  const blob = `${theme.label} ${theme.summary} ${(theme.keywords ?? []).join(' ')}`.toLowerCase();
  const ministerSignal = /\b(vivian|balakrishnan|foreign minister|minister for foreign affairs|cabinet minister|vivianbala)\b/i.test(blob);
  const builderSignal =
    /\b(nanoclaw|raspberry|second brain|personal ai|ai agent|whatsapp|sqlite|graph memory|govern a technology|briefed on|built|builder keynote)\b/i.test(
      blob
    );
  const eventSignal = /\b(ai engineer|aie|keynote|conference|summit|stage|talk|livestream)\b/i.test(blob);
  const nanoclawRaspberry =
    /\bnanoclaw\b/i.test(blob) &&
    /\b(raspberry|second brain|personal ai|govern|briefed|minister|vivian|cabinet)\b/i.test(blob);

  return (ministerSignal && builderSignal && eventSignal) || (nanoclawRaspberry && eventSignal);
}

function isVivianBuilderPost(post: EventPost): boolean {
  const blob = `${post.text} ${post.authorName} ${post.authorHandle ?? ''} ${post.url}`.toLowerCase();
  const ministerSignal = /\b(vivian|balakrishnan|foreign minister|minister for foreign affairs|cabinet minister|vivianbala)\b/i.test(blob);
  const builderSignal =
    /\b(nanoclaw|raspberry|second brain|personal ai|ai agent|whatsapp|sqlite|graph memory|govern a technology|briefed on|learn by doing)\b/i.test(
      blob
    );
  const eventSignal = /\b(ai engineer|aie|keynote|conference|summit|stage|talk|livestream|aidotengineer)\b/i.test(blob);
  const nanoclawRaspberry =
    /\bnanoclaw\b/i.test(blob) &&
    /\b(raspberry|second brain|personal ai|govern|briefed|minister|vivian|cabinet)\b/i.test(blob);
  return (ministerSignal && builderSignal) || (nanoclawRaspberry && (eventSignal || ministerSignal));
}

function mergeThemes(themeId: string, label: string, themes: EventTheme[], posts: EventPost[]): EventTheme {
  const byId = new Map(posts.map((post) => [post.postId, post]));
  const rootPostIds = uniqueIds(themes.flatMap((theme) => theme.rootPostIds ?? theme.postIds));
  const attachedPostIds = uniqueIds(themes.flatMap((theme) => theme.attachedPostIds ?? []));
  const postIds = uniqueIds([...rootPostIds, ...attachedPostIds, ...themes.flatMap((theme) => theme.postIds)]);
  const keywords = uniqueIds([
    'vivian balakrishnan',
    'builder keynote',
    'nanoclaw',
    'raspberry pi',
    'second brain',
    'foreign minister',
    'govern technology',
    ...themes.flatMap((theme) => theme.keywords ?? []),
  ]).slice(0, 24);
  const score = themes.reduce((sum, theme) => sum + (theme.score ?? 0), 0);
  const topEvidence = postIds
    .map((postId) => byId.get(postId))
    .filter((post): post is EventPost => Boolean(post))
    .sort((a, b) => b.reachScore - a.reachScore)
    .slice(0, 4)
    .map((post) => post.authorHandle ?? post.authorName)
    .filter(Boolean);

  return {
    themeId,
    eventId: themes[0]?.eventId ?? posts[0]?.eventId ?? 'ai-engineer-singapore',
    label,
    summary:
      topEvidence.length > 0
        ? `Foreign Minister Vivian Balakrishnan, NanoClaw, Raspberry Pi, and the "briefed on" line form one story, with top refs from ${topEvidence.join(', ')}.`
        : 'Foreign Minister Vivian Balakrishnan, NanoClaw, Raspberry Pi, and the "briefed on" line form one story about hands-on AI governance.',
    keywords,
    postIds,
    rootPostIds,
    attachedPostIds,
    score: Number(score.toFixed(3)),
    updatedAt: Date.now(),
  };
}

function uniqueIds(values: Array<string | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

function computeStats(posts: EventPost[]) {
  const total = posts.length;
  const byPlatform = countByPlatform(posts);
  const relevantPosts = posts.filter(isRelevant);
  const relevantByPlatform = countByPlatform(relevantPosts);
  const metricTotalsByPlatform = metricTotals(posts);
  const metricTotalsRelevantByPlatform = metricTotals(relevantPosts);
  const mediaByPlatform = mediaStats(posts);
  const mediaRelevantByPlatform = mediaStats(relevantPosts);
  const xRelevant = metricTotalsRelevantByPlatform.x ?? {};
  const linkedInRelevant = metricTotalsRelevantByPlatform.linkedin ?? {};
  const youtubeRelevant = metricTotalsRelevantByPlatform.youtube ?? {};
  const xViews = xRelevant.views ?? xRelevant.impressions ?? 0;
  const youtubeViews = youtubeRelevant.views ?? 0;
  const xLikes = xRelevant.likes ?? 0;
  const youtubeLikes = youtubeRelevant.likes ?? 0;
  return {
    total,
    byPlatform,
    intent: countTagPrefix(relevantPosts, 'intent:'),
    sentiment: countTagPrefix(relevantPosts, 'sentiment:'),
    relevantByPlatform,
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
    mediaByPlatform,
    metricTotalsByPlatform,
    relevantTotal: relevantPosts.length,
    relevanceTiers: {
      core: relevantPosts.filter((post) => post.tags.includes('relevance:core')).length,
      context: relevantPosts.filter((post) => post.tags.includes('context:event')).length,
      irrelevant: posts.length - relevantPosts.length,
    },
    metricTotalsRelevantByPlatform,
    mediaRelevantByPlatform,
  };
}

function countByPlatform(posts: EventPost[]) {
  return posts.reduce<Record<EventPlatform, number>>(
    (acc, post) => {
      acc[post.platform] += 1;
      return acc;
    },
    { x: 0, linkedin: 0, youtube: 0 }
  );
}

function countTagPrefix(posts: EventPost[], prefix: string) {
  const counts: Record<string, number> = {};
  for (const post of posts) {
    for (const tag of post.tags) {
      if (tag.startsWith(prefix)) counts[tag.slice(prefix.length)] = (counts[tag.slice(prefix.length)] ?? 0) + 1;
    }
  }
  return counts;
}

function metricTotals(posts: EventPost[]) {
  const out: Record<string, Record<string, number>> = {};
  for (const post of posts) {
    const bucket = (out[post.platform] ??= {});
    for (const [key, value] of Object.entries(post.metrics ?? {})) {
      if (typeof value === 'number' && Number.isFinite(value)) bucket[key] = (bucket[key] ?? 0) + value;
    }
  }
  return out;
}

function mediaStats(posts: EventPost[]) {
  const out: Record<string, { posts: number; items: number; localItems: number }> = {};
  for (const platform of ['x', 'linkedin', 'youtube'] as EventPlatform[]) {
    const platformPosts = posts.filter((post) => post.platform === platform);
    out[platform] = {
      posts: platformPosts.filter((post) => post.media?.length).length,
      items: platformPosts.reduce((sum, post) => sum + (post.media?.length ?? 0), 0),
      localItems: platformPosts.reduce(
        (sum, post) => sum + (post.media ?? []).filter((media) => media.localPath).length,
        0
      ),
    };
  }
  return out;
}

function writeAnalysisMarkdown(archive: Record<string, any>, outPath: string) {
  const stats = archive.stats;
  const lines = [
    `# ${archive.eventName ?? archive.eventId} analysis`,
    '',
    `Generated: ${archive.updatedAt}`,
    '',
    `Corpus: ${stats.relevantTotal} relevant posts (${stats.relevantByPlatform.x} X, ${stats.relevantByPlatform.linkedin} LinkedIn, ${stats.relevantByPlatform.youtube} YouTube).`,
    `Known observed views: ${stats.crossSurfaceObserved.knownViews.toLocaleString()} (${stats.crossSurfaceObserved.xViews.toLocaleString()} X, ${stats.crossSurfaceObserved.youtubeViews.toLocaleString()} YouTube).`,
    '',
    '## Clusters',
    '',
    ...(archive.themes ?? []).flatMap((theme: EventTheme) => [
      `### ${theme.label}`,
      '',
      theme.summary,
      '',
      `Posts: ${theme.postIds.length}. Keywords: ${theme.keywords.slice(0, 8).join(', ')}.`,
      '',
    ]),
    '## Top voices',
    '',
    ...(archive.voices ?? []).slice(0, 12).map((voice: any) => `- ${voice.platform}: ${voice.name} (${voice.postCount} posts, reach ${voice.reachScore})`),
    '',
  ];
  fs.writeFileSync(outPath, lines.join('\n'));
}

async function main() {
  loadEnvLocal();
  const archive = JSON.parse(fs.readFileSync(ARCHIVE_PATH, 'utf8')) as Record<string, any>;
  const youtubeIncoming = youtubePostsFromArchive(archive);
  const merged = mergePosts((archive.posts ?? []) as EventPost[], youtubeIncoming);
  const curated = curatePosts(merged.posts);
  const scored = scorePostsByPlatform(curated.posts);
  const relevant = scored.filter(isRelevant);
  const storyAssignment = buildStoryAssignedThemes(String(archive.eventId), relevant);
  const storyAssignedPostsById = new Map(storyAssignment.posts.map((post) => [post.postId, post]));
  const scoredWithStories = scored.map((post) => storyAssignedPostsById.get(post.postId) ?? post);
  const relevantWithStories = scoredWithStories.filter(isRelevant);
  const analysis = analyzePosts(String(archive.eventId), relevantWithStories);
  const storyThemes = storyAssignment.themes;
  const rootThemeIds = new Set(storyThemes.flatMap((theme) => theme.rootPostIds ?? theme.postIds));
  const rootPosts = relevantWithStories.filter((post) => rootThemeIds.has(post.postId));
  const clustering = {
    ...measureClusterQuality(rootPosts.length ? rootPosts : relevantWithStories, storyThemes),
    algorithm:
      'story-aware assignment over whole posts with primary stories plus secondary story mentions; TF-IDF retained only for diagnostics',
    selectedBy:
      'deterministic story ontology over full post text, with broad recaps kept as their own story instead of being split into chunks',
    rawClusterCount: analysis.themes.length,
    storyClusterCount: storyThemes.length,
    assignmentMethod: 'whole-post story assignment with broad-recap detection and secondary mentions',
    storyAssignment: storyAssignment.stats,
    tfidfBaseline: analysis.clusterQuality,
  };
  const summarized: ThemeSummaryResult = {
    themes: storyThemes,
    strategy: 'deterministic-story-assignment',
  };
  const expansion = deriveExpansionPlan(archive.eventName ?? archive.eventId, relevantWithStories, {
    baseQueries: archive.expansion?.querySet ?? [],
    maxQueries: 24,
  });
  const generatedAt = new Date().toISOString();
  const backupPath = `${ARCHIVE_PATH}.bak-${Date.now()}`;
  fs.copyFileSync(ARCHIVE_PATH, backupPath);
  archive.posts = scoredWithStories;
  archive.stats = computeStats(scoredWithStories);
  archive.themes = summarized.themes;
  archive.voices = analysis.voices;
  archive.clustering = clustering;
  archive.expansion = expansion;
  archive.updatedAt = generatedAt;
  archive.enrichment = [
    ...(archive.enrichment ?? []),
    {
      mode: 'finalize-analysis-youtube-llm-clusters',
      generatedAt,
      runId: RUN_ID,
      youtube: {
        materialized: youtubeIncoming.length,
        added: merged.added,
        updated: merged.updated,
      },
      curation: {
        changed: curated.changed,
        hidden: curated.hidden,
      },
      analysis: {
        relevant: relevant.length,
        themes: archive.themes.length,
        voices: archive.voices.length,
        clustering,
        llmModel: summarized.model,
        llmError: summarized.error,
        llmWarning: summarized.warning,
        llmStrategy: summarized.strategy,
      },
    },
  ];
  fs.writeFileSync(ARCHIVE_PATH, JSON.stringify(archive, null, 2));
  const outJsonPath = `outputs/event-recap-ai-engineer-singapore/${RUN_ID}.json`;
  const outMarkdownPath = 'outputs/event-recap-ai-engineer-singapore/analysis.md';
  const output = {
    generatedAt,
    runId: RUN_ID,
    archivePath: ARCHIVE_PATH,
    backupPath,
    analysisPath: outMarkdownPath,
    youtube: {
      materialized: youtubeIncoming.length,
      added: merged.added,
      updated: merged.updated,
    },
    curation: {
      changed: curated.changed,
      hidden: curated.hidden,
    },
    llm: {
      model: summarized.model,
      error: summarized.error,
      warning: summarized.warning,
      strategy: summarized.strategy,
    },
    stats: archive.stats,
    clustering: archive.clustering,
    themes: archive.themes,
    voices: archive.voices,
  };
  fs.writeFileSync(outJsonPath, JSON.stringify(output, null, 2));
  writeAnalysisMarkdown(archive, outMarkdownPath);
  console.log(
    JSON.stringify(
      {
        outJsonPath,
        outMarkdownPath,
        backupPath,
        youtube: output.youtube,
        curation: output.curation,
        llm: output.llm,
        stats: {
          total: archive.stats.total,
          relevantTotal: archive.stats.relevantTotal,
          relevantByPlatform: archive.stats.relevantByPlatform,
          mediaRelevantByPlatform: archive.stats.mediaRelevantByPlatform,
          crossSurfaceObserved: archive.stats.crossSurfaceObserved,
        },
        themes: archive.themes.map((theme: EventTheme) => ({
          label: theme.label,
          posts: theme.postIds.length,
          summary: theme.summary,
        })),
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
