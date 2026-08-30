import fs from 'node:fs';
import { analyzePosts } from '../lib/research/event-recap/analyze';
import { enrichPostConversationTags } from '../lib/research/event-recap/conversation';
import { deriveExpansionPlan } from '../lib/research/event-recap/expand';
import { hasAiEngineeringOrProgramSignal, hasEventContextSignal, isIncidentalAieMention, isLowSignalEventOnlyText } from '../lib/research/event-recap/relevance';
import type { EventPlatform, EventPost } from '../lib/research/event-recap/types';
import { scorePostsByPlatform } from '../lib/research/event-recap/utils';

const ARCHIVE_PATH = 'outputs/event-recap-ai-engineer-singapore/archive.json';

type EventRelevanceTier = 'core' | 'context' | 'irrelevant';

function eventRelevant(post: Pick<EventPost, 'platform' | 'text' | 'authorHandle' | 'authorName' | 'url'>): boolean {
  const text = `${post.text} ${post.authorHandle ?? ''} ${post.authorName ?? ''} ${post.url}`;
  const lower = text.toLowerCase();
  if (isHardNoise(lower)) return false;
  if (isAdjacentGrabMapsHackathonNoise(lower)) return false;
  if (isAdjacent65LabsProgramNoise(lower)) return false;
  if (isAdjacentGenericAiEngineeringNoise(lower)) return false;
  if (isGenericAiCareerNoise(lower)) return false;
  if (isLowSignalEventOnlyText(text)) return false;
  const exactEvent =
    /\bai engineer singapore\b/i.test(text) ||
    /\bai engineers singapore\b/i.test(text) ||
    /\bai engineer sg\b/i.test(text) ||
    /\bai engineer summit singapore\b/i.test(text) ||
    /\bai engineer conference singapore\b/i.test(text) ||
    /\baie(?:\s+here\s+in)?\s+singapore\b/i.test(text) ||
    /#(?:aiengineersingapore|aiengineersg|aiesg)\b/i.test(text) ||
    hasAiDotEngineerSingaporeSignal(text) ||
    /\bai\.engineer[\/\s]+singapore\b/i.test(text) ||
    /\broad to aie\b/i.test(text);
  if (exactEvent) return !isIncidentalAieMention(text) && hasAiEngineeringOrProgramSignal(text);

  const eventPhrase = hasAieSingaporePhrase(text);
  if (eventPhrase) return !isGenericHiringNoise(lower) && hasAiEngineeringOrProgramSignal(text);

  const ministerKeynote =
    /\b(vivian balakrishnan|foreign minister|minister for foreign affairs|vivianbala)\b/i.test(text) &&
    /\b(second brain|personal ai agent|dev conference|developer conference|govern a technology|graph memory|sqlite|whatsapp|nanoclaw)\b/i.test(text);
  if (ministerKeynote) return true;

  const nanoClawEvent =
    /nanoclaw/i.test(text) &&
    /\b(ai engineer|aie|conference|summit|keynote|minister|vivian|cabinet minister)\b/i.test(text);
  if (nanoClawEvent) return true;

  const knownPeopleAnchor =
    /\b(sherry yan jiang|sherrypeek|agrim singh|gabriel chua|gavriel_cohen|nanoclaw|ryo lu|jj geewax)\b/i.test(text) &&
    hasKnownPersonEventSignal(text);
  const known65LabsAnchor =
    /\b65labs\b/i.test(text) &&
    hasKnownPersonEventSignal(text);
  return (knownPeopleAnchor || known65LabsAnchor) && hasAiEngineeringOrProgramSignal(text);
}

function eventContextRelevant(post: Pick<EventPost, 'platform' | 'text' | 'authorHandle' | 'authorName' | 'url' | 'media'>): boolean {
  if (post.platform === 'youtube') return false;
  const text = `${post.text} ${post.authorHandle ?? ''} ${post.authorName ?? ''} ${post.url}`;
  const lower = text.toLowerCase();
  if (isHardNoise(lower)) return false;
  if (isAdjacentGrabMapsHackathonNoise(lower)) return false;
  if (isAdjacent65LabsProgramNoise(lower)) return false;
  if (isAdjacentGenericAiEngineeringNoise(lower)) return false;
  if (isGenericAiCareerNoise(lower)) return false;
  if (isGenericHiringNoise(lower)) return false;
  if (isIncidentalAieMention(text)) return false;

  const eventAnchor = hasExplicitAieSignal(text) || hasAieSingaporePhrase(text);
  if (!eventAnchor) return false;
  return hasEventContextSignal(text) || Boolean(post.media?.length);
}

function classifyEventRelevance(post: Pick<EventPost, 'platform' | 'text' | 'authorHandle' | 'authorName' | 'url' | 'media'>): EventRelevanceTier {
  if (eventRelevant(post)) return 'core';
  if (eventContextRelevant(post)) return 'context';
  return 'irrelevant';
}

function isHardNoise(text: string): boolean {
  return /\b(austcham|australian international school|sandboxaq|nigerian english|cerebras ipo|bnpl|buy now, pay later|crypto vc fund partner|drugging a girl's drink)\b/i.test(text);
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
  const hiring = /\b(hiring|we'?re hiring|job opening|job posting|job ad|jobs page|open roles?|rewarding roles?|explore more roles?|open positions?|vacancy|resume|cv|apply now|candidate|recruiting|kerry consulting|distributing training|software engineer|data engineer|machine learning engineer)\b/i.test(text);
  const event =
    /\b(ai engineer singapore|aie singapore|road to aie|ai\.engineer[\/\s]+singapore)\b/i.test(text) ||
    /#(?:aiengineersingapore|aiengineersg|aiesg)\b/i.test(text) ||
    hasAiDotEngineerSingaporeSignal(text);
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

function computeStats(posts: EventPost[], youtube: any) {
  const relevantPosts = posts.filter((post) => !post.tags.includes('irrelevant:event'));
  const metricTotalsRelevantByPlatform = metricTotals(relevantPosts);
  const xRelevant = metricTotalsRelevantByPlatform.x ?? {};
  const linkedInRelevant = metricTotalsRelevantByPlatform.linkedin ?? {};
  const youtubeViews = youtube?.relevantViews ?? 0;
  const youtubeLikes = youtube?.relevantLikes ?? 0;

  return {
    total: posts.length,
    byPlatform: countByPlatform(posts),
    intent: countTagPrefix(relevantPosts, 'intent:'),
    sentiment: countTagPrefix(relevantPosts, 'sentiment:'),
    relevantByPlatform: countByPlatform(relevantPosts),
    crossSurfaceObserved: {
      xViews: xRelevant.views ?? xRelevant.impressions ?? 0,
      youtubeViews,
      knownViews: (xRelevant.views ?? xRelevant.impressions ?? 0) + youtubeViews,
      xLikes: xRelevant.likes ?? 0,
      youtubeLikes,
      knownLikes: (xRelevant.likes ?? 0) + youtubeLikes,
      linkedinViews: null,
      linkedinImpressionsAvailable: false,
      linkedinReactions: linkedInRelevant.reactions ?? 0,
      linkedinComments: linkedInRelevant.comments ?? 0,
      linkedinReposts: linkedInRelevant.reposts ?? 0,
      linkedinEngagementSource:
        'Relevant LinkedIn public post engagement from Apify post search plus prior logged-in/TinyFish card captures; LinkedIn impressions remain unavailable unless rendered on source posts.',
      knownLikesAndLinkedInReactions: (xRelevant.likes ?? 0) + youtubeLikes + (linkedInRelevant.reactions ?? 0),
    },
    mediaByPlatform: mediaStats(posts),
    metricTotalsByPlatform: metricTotals(posts),
    relevantTotal: relevantPosts.length,
    relevanceTiers: {
      core: relevantPosts.filter((post) => post.tags.includes('relevance:core')).length,
      context: relevantPosts.filter((post) => post.tags.includes('context:event')).length,
      irrelevant: posts.length - relevantPosts.length,
    },
    metricTotalsRelevantByPlatform,
    mediaRelevantByPlatform: mediaStats(relevantPosts),
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
        (sum, post) => sum + (post.media ?? []).filter((media) => (media as any).localPath).length,
        0
      ),
    };
  }
  return out;
}

function main() {
  const archive = JSON.parse(fs.readFileSync(ARCHIVE_PATH, 'utf8'));
  const before = archive.stats;
  const targetRunId = process.env.EVENT_RECAP_RETAG_RUN_ID;
  const posts: EventPost[] = (archive.posts ?? []).map((post: EventPost) => {
    const shouldRetag =
      (targetRunId && post.runId === targetRunId) ||
      post.tags?.includes('x-official-expanded-discovery') ||
      post.tags?.includes('apify-linkedin-expanded-discovery');
    if (!shouldRetag) return post;
    const tags = (post.tags ?? []).filter(
      (tag) =>
        tag !== 'relevant:event' &&
        tag !== 'irrelevant:event' &&
        tag !== 'context:event' &&
        !tag.startsWith('relevance:')
    );
    const tier = classifyEventRelevance(post);
    if (tier === 'core') {
      tags.push('relevant:event', 'relevance:core');
    } else if (tier === 'context') {
      tags.push('relevant:event', 'context:event', 'relevance:context');
    } else {
      tags.push('irrelevant:event');
    }
    return enrichPostConversationTags({ ...post, tags });
  });
  const scored = scorePostsByPlatform(posts);
  const relevantPosts = scored.filter((post) => !post.tags.includes('irrelevant:event'));
  const analysis = analyzePosts(archive.eventId, relevantPosts);
  const expansion = deriveExpansionPlan(archive.eventName ?? archive.eventId, relevantPosts, {
    baseQueries: archive.expansion?.querySet ?? [],
    maxQueries: 24,
  });
  const backupPath = `${ARCHIVE_PATH}.bak-retag-${Date.now()}`;
  fs.copyFileSync(ARCHIVE_PATH, backupPath);
  archive.posts = scored;
  archive.stats = computeStats(scored, archive.youtube);
  archive.themes = analysis.themes;
  archive.voices = analysis.voices;
  archive.clustering = analysis.clusterQuality;
  archive.expansion = expansion;
  archive.updatedAt = new Date().toISOString();
  archive.enrichment = [
    ...(archive.enrichment ?? []),
    {
      mode: 'retag-event-relevance-after-expanded-discovery',
      generatedAt: archive.updatedAt,
      backupPath,
      before: {
        relevantByPlatform: before?.relevantByPlatform,
        relevantTotal: before?.relevantTotal,
      },
      after: {
        relevantByPlatform: archive.stats.relevantByPlatform,
        relevantTotal: archive.stats.relevantTotal,
      },
    },
  ];
  fs.writeFileSync(ARCHIVE_PATH, JSON.stringify(archive, null, 2));
  console.log(JSON.stringify({
    backupPath,
    before: {
      relevantByPlatform: before?.relevantByPlatform,
      relevantTotal: before?.relevantTotal,
    },
    after: {
      relevantByPlatform: archive.stats.relevantByPlatform,
      relevantTotal: archive.stats.relevantTotal,
      mediaRelevantByPlatform: archive.stats.mediaRelevantByPlatform,
      crossSurfaceObserved: archive.stats.crossSurfaceObserved,
    },
  }, null, 2));
}

main();
