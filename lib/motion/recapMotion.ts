import { DEFAULT_MOTION_WORKFLOW_MODE } from './project';
import type {
  AppProfile,
  MotionBriefV2,
  MotionClaimReceipt,
  MotionDraft,
  MotionPlatformTarget,
  MotionProject,
  MotionProvenanceRef,
  MotionWorkflowMode,
  StoryBeat,
} from './project';
import { materializeMotionTimeline } from './timeline';

export interface EventRecapStatsInput {
  postCount: number;
  viewCount: number;
  platforms: string[];
}

export interface EventRecapThemeInput {
  id: string;
  label: string;
  summary: string;
  topPostUrls: string[];
}

export interface EventRecapQuoteInput {
  /** Verbatim quote text supplied by the caller. Never synthesized or rewritten here. */
  text: string;
  author: string;
  sourceUrl: string;
}

export interface EventRecapMediaRefInput {
  assetId: string;
  label?: string;
  sourceUrl?: string;
}

export interface BuildEventRecapMotionProjectInput {
  id: string;
  workspaceId: string;
  eventId: string;
  eventName: string;
  workflowMode?: MotionWorkflowMode;
  audience?: string;
  tone?: string;
  stats: EventRecapStatsInput;
  themes: EventRecapThemeInput[];
  quotes?: EventRecapQuoteInput[];
  mediaRefs?: EventRecapMediaRefInput[];
  platformTargets?: MotionPlatformTarget[];
  materializeTimeline?: boolean;
  createdAt: number;
}

/** Default multi-platform fan-out for an event recap: one edit, five formats. */
export const DEFAULT_EVENT_RECAP_PLATFORM_TARGETS: readonly MotionPlatformTarget[] = [
  { platform: 'x', aspectRatio: '9:16', seconds: 30 },
  { platform: 'linkedin', aspectRatio: '16:9', seconds: 45 },
  { platform: 'instagram', aspectRatio: '1:1', seconds: 30 },
  { platform: 'instagram', aspectRatio: '4:5', seconds: 30 },
  { platform: 'youtube', aspectRatio: '16:9', seconds: 60 },
];

const MAX_THEME_BEATS = 3;

const DEFAULT_BRAND_MOTION = {
  palette: ['#f4ede0', '#1a1a1a', '#c8413a'],
  fontFamilies: ['IBM Plex Mono'],
  motionStyle: 'technical editorial',
};

const DEFAULT_AUDIENCE = 'event attendees and the wider builder community';
const DEFAULT_TONE = 'grounded and celebratory';

/**
 * Bridges an event recap corpus into the motion system as a MotionProject.
 *
 * projectKind is 'social': a recap is a multi-platform social cut, not a launch
 * or PR explainer. Quote beats carry caller-provided verbatim text only.
 */
export function buildEventRecapMotionProject(
  input: BuildEventRecapMotionProjectInput
): MotionProject {
  const themes = input.themes.slice(0, MAX_THEME_BEATS);
  if (themes.length === 0) {
    throw new Error('event recap motion project requires at least one theme');
  }

  const quotes = (input.quotes ?? []).filter((quote) => quote.text.trim().length > 0);
  const mediaRefs = input.mediaRefs ?? [];
  const platformTargets = (input.platformTargets ?? DEFAULT_EVENT_RECAP_PLATFORM_TARGETS).map(
    (target) => ({ ...target })
  );

  const recapRef: MotionProvenanceRef = {
    kind: 'reference',
    ref: `event-recap:${input.eventId}`,
    label: input.eventName,
  };
  const themeRefs = themes.map((theme) => themeProvenance(theme, recapRef));
  const quoteRefs = quotes.map(quoteProvenance);
  const mediaProvenanceRefs = mediaRefs.map(mediaProvenance);
  const sourceRefs = uniqueProvenance([
    recapRef,
    ...themeRefs.flat(),
    ...quoteRefs,
    ...mediaProvenanceRefs,
  ]);

  const statsLine = formatStatsLine(input.stats);
  const appProfile: AppProfile = {
    name: input.eventName,
    summary: `Event recap of ${input.eventName}: ${statsLine}.`,
    stack: [],
  };
  const claims: MotionClaimReceipt[] = [
    { text: `${input.eventName} drew ${statsLine}.`, source: recapRef },
    ...themes.map((theme, index) => ({
      text: `${theme.label}: ${theme.summary}`,
      source: themeRefs[index][0],
    })),
  ];
  const brief: MotionBriefV2 = {
    projectKind: 'social',
    appProfile,
    audience: input.audience ?? DEFAULT_AUDIENCE,
    platformTargets,
    claims,
    tone: input.tone ?? DEFAULT_TONE,
    brandMotion: DEFAULT_BRAND_MOTION,
  };

  const story: StoryBeat[] = [
    {
      id: 'beat-recap-hook',
      role: 'hook',
      narration: `${input.eventName}: ${statsLine}.`,
      targetSeconds: 3,
      selectedAssetIds: [],
      templateId: 'hook-card',
      provenance: [recapRef],
    },
    {
      id: 'beat-recap-numbers',
      role: 'proof',
      narration: `By the numbers: ${statsLine}.`,
      targetSeconds: 5,
      selectedAssetIds: [],
      templateId: 'data-visual-card',
      provenance: [recapRef],
    },
    ...themes.map(
      (theme, index): StoryBeat => ({
        id: `beat-recap-theme-${index + 1}`,
        role: 'evidence',
        narration: `${theme.label}: ${theme.summary}`,
        targetSeconds: 5,
        selectedAssetIds: [],
        templateId: 'evidence-card',
        provenance: themeRefs[index],
      })
    ),
    ...(mediaRefs.length > 0
      ? [
          {
            id: 'beat-recap-media',
            role: 'demo',
            narration: `Scenes from ${input.eventName}, straight from attendee posts.`,
            targetSeconds: 5,
            selectedAssetIds: mediaRefs.map((media) => media.assetId),
            templateId: 'contact-sheet-proof',
            provenance: mediaProvenanceRefs,
          } satisfies StoryBeat,
        ]
      : []),
    ...(quotes.length > 0
      ? [
          {
            id: 'beat-recap-quote',
            role: 'payoff',
            // Verbatim passthrough — the caller supplies real quote text.
            narration: quotes[0].text,
            targetSeconds: 5,
            selectedAssetIds: [],
            templateId: 'proof-card',
            provenance: [quoteRefs[0]],
          } satisfies StoryBeat,
        ]
      : []),
    {
      id: 'beat-recap-outro',
      role: 'cta',
      narration: `That was ${input.eventName}. Every stat and quote links back to the source post.`,
      targetSeconds: 4,
      selectedAssetIds: [],
      templateId: 'outro-slate',
      provenance: [recapRef],
    },
  ];
  const drafts = buildRecapDrafts(story);

  const project: MotionProject = {
    id: input.id,
    workspaceId: input.workspaceId,
    title: `${input.eventName} recap video`,
    sourceRefs,
    brief,
    story,
    workflowMode: input.workflowMode ?? DEFAULT_MOTION_WORKFLOW_MODE,
    currentDraftId: drafts[0].id,
    drafts,
    tracks: [],
    graphNodes: [
      {
        id: 'node-recap-ingest',
        kind: 'recap-ingest',
        inputRefs: [recapRef.ref],
        outputRefs: sourceRefs.map((source) => source.ref),
        status: 'done',
        provenance: sourceRefs,
      },
      {
        id: 'node-script',
        kind: 'script',
        inputRefs: sourceRefs.map((source) => source.ref),
        outputRefs: story.map((beat) => beat.id),
        status: 'done',
        provenance: sourceRefs,
      },
      {
        id: 'node-storyboard',
        kind: 'storyboard',
        inputRefs: story.map((beat) => beat.id),
        outputRefs: story.map((beat) => beat.templateId ?? beat.id),
        status: 'done',
        provenance: sourceRefs,
      },
    ],
    exports: platformTargets.map((target) => ({
      id: `export-${target.platform}-${target.aspectRatio.replace(':', 'x')}`,
      platform: target.platform,
      aspectRatio: target.aspectRatio,
      status: 'planned',
      provenance: [recapRef],
    })),
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
  };

  if (!input.materializeTimeline) return project;

  return materializeMotionTimeline(project, { updatedAt: input.createdAt });
}

function buildRecapDrafts(story: StoryBeat[]): MotionDraft[] {
  return [
    {
      id: 'draft-recap-primary',
      label: 'Primary recap cut',
      angle: 'event headline, numbers, top stories, a community voice, and a closing action',
      status: 'planned',
      story,
      tracks: [],
      provenance: [{ kind: 'story-beat', ref: story[0]?.id ?? 'story' }],
    },
    {
      id: 'draft-recap-numbers-first',
      label: 'Numbers-first cut',
      angle: 'lead with the by-the-numbers proof, then the top story and a community voice',
      status: 'planned',
      story: pickStory(story, [
        'beat-recap-hook',
        'beat-recap-numbers',
        'beat-recap-theme-1',
        'beat-recap-quote',
        'beat-recap-outro',
      ]),
      tracks: [],
      provenance: [{ kind: 'story-beat', ref: 'beat-recap-numbers' }],
    },
  ];
}

function pickStory(story: StoryBeat[], beatIds: string[]): StoryBeat[] {
  const beatsById = new Map(story.map((beat) => [beat.id, beat]));
  return beatIds.flatMap((id) => {
    const beat = beatsById.get(id);
    return beat ? [beat] : [];
  });
}

function themeProvenance(
  theme: EventRecapThemeInput,
  fallback: MotionProvenanceRef
): MotionProvenanceRef[] {
  if (theme.topPostUrls.length === 0) return [fallback];

  return theme.topPostUrls.map((url) => ({
    kind: 'reference',
    ref: url,
    label: theme.label,
  }));
}

function quoteProvenance(quote: EventRecapQuoteInput): MotionProvenanceRef {
  return { kind: 'reference', ref: quote.sourceUrl, label: quote.author };
}

function mediaProvenance(media: EventRecapMediaRefInput): MotionProvenanceRef {
  return {
    kind: 'reference',
    ref: media.sourceUrl ?? media.assetId,
    ...(media.label ? { label: media.label } : {}),
  };
}

function formatStatsLine(stats: EventRecapStatsInput): string {
  const platformLabel =
    stats.platforms.length > 0 ? stats.platforms.join(', ') : 'social platforms';
  return `${formatCount(stats.postCount)} posts and ${formatCount(stats.viewCount)} views across ${platformLabel}`;
}

function formatCount(value: number): string {
  return value.toLocaleString('en-US');
}

function uniqueProvenance(refs: MotionProvenanceRef[]): MotionProvenanceRef[] {
  const seen = new Set<string>();
  return refs.filter((ref) => {
    const key = `${ref.kind}:${ref.ref}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
