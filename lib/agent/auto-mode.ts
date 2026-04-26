import { runMultiAgent, type MultiAgentToolStep } from './multi';
import {
  insertCampaignVariation,
  recordScheduledPost,
  setCampaignStatus,
  startCampaign,
} from '@/lib/convex/http';
import { notifyDiscord } from '@/lib/notify/discord';
import { resolvePublisher } from '@/lib/providers/publisher/registry';
import {
  PUBLISH_PLATFORMS,
  type PublishPlatform,
  type ScheduledPost,
} from '@/lib/providers/publisher/types';
import {
  cropHeroToFormats,
  type CroppedFormat,
} from '@/lib/canvas/cropToFormat';
import { applyTextOverlay } from './text-apply';
import type { ProposedTextOverlay } from './text-apply';
import type {
  FormatTarget,
  SafeZone,
  SemanticCreativeComponent,
} from '@/lib/types/semantic-component';
import { asBCP47LocaleCode } from '@/lib/text-overlay/types';
import { buildLayoutAwarePrompt } from './prompt/layout-aware';
import {
  ONE_SHOT_PROMPTS,
  segmentSubjects,
  segmentSubjectsToForbiddenRegions,
  type SegmentSubjectsResult,
} from './segment-subjects';
import {
  describeImage,
  descriptionToSegmentPrompts,
} from './describe-image';
import { fetchUrlIngestion, type UrlIngestion } from '@/lib/ingest/url';

/**
 * Auto Mode orchestrator (handoff §9, v1 slice).
 *
 * One Auto-Mode lap fans out into N variations. Each variation is one
 * `runMultiAgent` session driving the existing tool surface
 * (search_signals + generate_image, with cluster/analyze available but
 * not required). The agent emits a structured JSON envelope as its final
 * text — caption, hashtags, schedule suggestion, mood note — which we
 * parse out for persistence.
 *
 * Provenance is automatic: every tool call inside the loop already writes
 * to `capabilityRun` via lib/agent/multi.ts. Each variation's
 * `agentRunIds` cross-link back to those rows so the right rail can show
 * the per-tool work that produced the variation.
 *
 * Notify modes:
 *   - 'notify'    → Discord webhook ping when the lap completes.
 *   - 'review'    → Variation rows persist with status 'ready' for user.
 *   - 'auto-post' → Same as 'review' for v1; auto-post hookup is a
 *                   future slice (would call /api/publish/schedule per
 *                   variation when complete).
 *
 * Out of scope for v1:
 *   - Multi-format crop fan-out (1:1 + 4:5 + 9:16 + 16:9). v1 produces
 *     the hero only at 1:1.
 *   - Multilingual text overlay across en/zh-Hans-SG/ms-SG/ta-SG. v1
 *     returns a single caption from the agent.
 *   - SSE progress streaming. v1 returns the lap result as a single
 *     JSON response. The endpoint can stream once the UI consumer lands.
 *   - Critique pass over references. The agent decides which to honor.
 */

export type AutoModeNotifyMode = 'notify' | 'review' | 'auto-post';
export type AutoModeTriggerKind = 'url' | 'file' | 'text';
export type AutoModeConcurrency = 'sequential' | 'parallel';

export interface AutoModeTrigger {
  kind: AutoModeTriggerKind;
  payload: string;
}

/**
 * Optional reference image for the hero render. When supplied, the
 * orchestrator passes it through to the agent's generate_image tool so
 * compatible image providers do an image-to-image render instead of
 * text-only. When the provider does not support reference images the
 * adapter degrades to text-only and notes the reference in the prompt.
 *
 * Pass exactly one of `url` (publicly fetchable) or `dataUrl` (base64).
 */
export interface AutoModeReferenceImage {
  url?: string;
  dataUrl?: string;
  /** Optional human-readable hint about what's in the reference. The
   *  orchestrator includes this in the per-variation system prompt so
   *  Claude's hero prompt for generate_image is informed by it even when
   *  the image bytes are not visible to the LLM (text-only adapters). */
  hint?: string;
}

export interface AutoModeRequest {
  baseUrl: string;
  workspaceId?: string;
  trigger: AutoModeTrigger;
  variationCount: 1 | 2 | 3 | 4;
  notifyMode: AutoModeNotifyMode;
  /** sequential = one variation at a time, with priorMoodNotes feeding the
   *  next variation's prompt for distinctness. parallel = Promise.allSettled
   *  fan-out with up-front variation seeds. Default: 'sequential'. */
  concurrency?: AutoModeConcurrency;
  /**
   * Optional reference images for the hero render. Multi-image lets a
   * brand kit + product photo set bias the generation. When trigger.kind
   * is 'url' and these are not supplied, the page's og:image and top
   * body images become the default refs.
   */
  referenceImages?: AutoModeReferenceImage[];
  /** @deprecated — use referenceImages. Kept for back-compat. */
  referenceImage?: AutoModeReferenceImage;
  /** Optional bound on per-variation iterations (passed to runMultiAgent). */
  maxIterationsPerVariation?: number;
}

/**
 * Up-front mood seeds used in parallel concurrency mode. Each variation
 * picks the seed at its index so all N variations are guaranteed
 * distinct without inter-variation feedback. Index = variation number - 1
 * mod seeds.length.
 */
const PARALLEL_MOOD_SEEDS = [
  'warm dawn — soft golden palette, low contrast, hopeful',
  'cool dusk — deep blues, high film grain, melancholic',
  'punchy editorial — high contrast, saturated, kinetic energy',
  'soft pastel — chalk tones, dreamy diffusion, intimate scale',
] as const;

export interface AutoModeFormatCrop {
  formatId: string;
  aspectRatio: '1:1' | '4:5' | '9:16' | '16:9';
  w: number;
  h: number;
  /** Normalized [0,1] crop coords in the hero's coordinate space. */
  crop: { topLeft: { x: number; y: number }; bottomRight: { x: number; y: number } };
  /** From cropHeroToFormats: 'fitted' | 'partial' | 'centered-fallback'. */
  fit: string;
}

export interface AutoModeVariationResult {
  index: number;
  status: 'ready' | 'failed';
  heroImageUrl?: string;
  caption?: string;
  /** Captions across the 4 SG locales. Filled by the agent's JSON envelope
   *  (Claude translates inline) plus, when text-overlay/apply runs, the
   *  authored copy per locale from the planner. */
  captionsByLocale?: Partial<Record<LocaleCode, string>>;
  hashtags?: string[];
  moodNote?: string;
  schedulePlatform?: string;
  scheduleWhenLocal?: string;
  /** Per-format crop rectangles (1:1 hero + 4:5 + 9:16 + 16:9). Pure
   *  geometry — no extra renders. */
  formatCrops?: AutoModeFormatCrop[];
  /** Adaptive text overlays produced by lib/agent/text-apply: one per
   *  text-bearing safe zone × locale. Position is segmentation-aware
   *  (faces/products/logos forbidden). */
  textOverlays?: ProposedTextOverlay[];
  /** Non-fatal warnings from the text-overlay planner ('no-safe-zone-found'
   *  when every zone overlaps a forbidden region). */
  textOverlayWarnings?: string[];
  /** SAM3 masks from the static one-shot prompt list (slice #2). Persisted
   *  for A/B inspection alongside masksVisionGuided. */
  masksOneShot?: SegmentSubjectsResult;
  /** SAM3 masks from Claude vision-derived prompts (slice #2). When both
   *  paths succeed, vision-guided is the primary input to the text-overlay
   *  planner; one-shot is the comparison reference. */
  masksVisionGuided?: SegmentSubjectsResult;
  agentSteps: MultiAgentToolStep[];
  agentFinalText: string;
  error?: string;
}

export interface AutoModeResult {
  /** Convex campaign id when persistence is enabled, otherwise null. */
  campaignId: string | null;
  variations: AutoModeVariationResult[];
  status: 'completed' | 'failed';
  notified: boolean;
  /**
   * When `notifyMode='auto-post'`, the IDs of scheduledPost rows created
   * (one per ready variation × its scheduled platform). Empty in 'notify'
   * and 'review' modes, and when no workspaceId was supplied.
   */
  scheduledPostIds: string[];
  /**
   * When `trigger.kind === 'url'`, the structured page ingestion that fed
   * the variation prompts and (when no explicit reference was supplied)
   * the hero generation reference image. Helps the UI show "what we
   * scraped" alongside what we made.
   */
  urlIngestion?: UrlIngestion;
}

interface VariationPromptInput {
  index: number;
  total: number;
  trigger: AutoModeTrigger;
  /** sequential mode: prior variations' moodNote text — feed forward. */
  priorMoodNotes: string[];
  /** parallel mode: up-front mood seed assigned to this variation. */
  parallelMoodSeed?: string;
  referenceImages?: AutoModeReferenceImage[];
  /** When trigger.kind === 'url' and ingestion succeeded, this is the
   *  page's title/description/body excerpt/products — woven into the
   *  variation prompt so the agent reasons about the actual page content
   *  instead of just the URL string. */
  urlIngestion?: UrlIngestion;
}

/**
 * Pre-compose the layout-aware hero prompt the agent will pass verbatim
 * into generate_image. Pre-hero (no caption available yet) we use the
 * trigger payload as both the creator prompt lead and the hero
 * description; in parallel mode the up-front mood seed feeds component
 * mood keywords so the layout planner bakes mood into the rendered image
 * via the existing buildAutoModeComponent → buildLayoutAwarePrompt path.
 *
 * The resulting prompt has safe zones (top headline + bottom caption
 * bands as `mustSurviveAllCrops`), multi-aspect crop guidance for
 * 1:1 / 4:5 / 9:16 / 16:9, and a no-on-image-text instruction baked in.
 * One render satisfies every standard format crop without per-format
 * regeneration — the fast-tier promise.
 */
function buildPreHeroLayoutAwarePrompt(input: {
  trigger: AutoModeTrigger;
  parallelMoodSeed?: string;
  referenceHint?: string;
  urlIngestion?: UrlIngestion;
  referenceImageCount?: number;
}): string {
  // Compose the hero description from whatever signal is most specific:
  // for URL triggers, the ingested page title + description carry the
  // actual subject (a raw URL string is meaningless to the layout
  // planner); for text triggers, the trigger payload is the brief.
  const heroDescription = (() => {
    if (input.urlIngestion) {
      const ing = input.urlIngestion;
      const parts: string[] = [];
      if (ing.title) parts.push(ing.title);
      if (ing.description) parts.push(ing.description);
      else if (ing.bodyExcerpt) parts.push(ing.bodyExcerpt.split('\n')[0]);
      if (ing.products[0]?.name) parts.push(`featuring ${ing.products[0].name}`);
      const joined = parts.join(' — ');
      if (joined) {
        return input.referenceHint
          ? `${joined} (reference vibe: ${input.referenceHint})`
          : joined;
      }
    }
    return input.referenceHint
      ? `${input.trigger.payload} (reference vibe: ${input.referenceHint})`
      : input.trigger.payload;
  })();
  // The creator-prompt LEAD line shown verbatim at the top of the layout-
  // aware prompt should also reflect the ingested brief when available;
  // a URL-as-lead is uninformative to the image generator.
  const creatorPrompt = (() => {
    if (input.urlIngestion?.title) {
      return input.urlIngestion.description
        ? `${input.urlIngestion.title} — ${input.urlIngestion.description}`
        : input.urlIngestion.title;
    }
    return input.trigger.payload;
  })();
  const component = buildAutoModeComponent({
    rewrittenPromptOrCaption: heroDescription,
    moodNote: input.parallelMoodSeed,
  });
  return buildLayoutAwarePrompt({
    creatorPrompt,
    component,
  });
}

const VARIATION_SYSTEM_NOTE = (input: VariationPromptInput): string => {
  const refs = input.referenceImages ?? [];
  // First ref's hint (when present) makes the cleanest creator brief
  // augmentation. Subsequent refs are still attached as image-to-image
  // but their hints aren't woven into the layout-aware prompt body.
  const primaryHint = refs[0]?.hint;
  const layoutAwarePrompt = buildPreHeroLayoutAwarePrompt({
    trigger: input.trigger,
    parallelMoodSeed: input.parallelMoodSeed,
    referenceHint: primaryHint,
    urlIngestion: input.urlIngestion,
    referenceImageCount: refs.length,
  });

  const lines = [
    `Auto-Mode lap. You are running variation ${input.index} of ${input.total}.`,
    '',
    `Trigger (${input.trigger.kind}): ${input.trigger.payload}`,
  ];

  // URL ingestion enrichment — when the trigger was a URL we already
  // fetched the page; weave the title / description / product info /
  // body excerpt into the prompt so the agent has the page's actual
  // story to work from, not just the URL string.
  if (input.urlIngestion) {
    const ing = input.urlIngestion;
    lines.push('', '--- INGESTED PAGE CONTENT (auto-extracted) ---');
    if (ing.title) lines.push(`Page title: ${ing.title}`);
    if (ing.description) lines.push(`Description: ${ing.description}`);
    if (ing.products.length > 0) {
      lines.push('Products listed on the page:');
      for (const p of ing.products.slice(0, 3)) {
        const offer = p.offers
          ? ` (${p.offers.currency ?? ''}${p.offers.price ?? ''})`
          : '';
        const brand = p.brand ? ` — ${p.brand}` : '';
        lines.push(
          `  · ${p.name}${brand}${offer}${p.description ? ': ' + p.description.slice(0, 160) : ''}`
        );
      }
    }
    if (ing.bodyExcerpt) {
      lines.push(
        'Body excerpt (h1 / h2 / lead paragraph):',
        ing.bodyExcerpt
          .split('\n')
          .slice(0, 8)
          .map((l) => `  · ${l}`)
          .join('\n')
      );
    }
    if (ing.primaryImage) {
      lines.push(
        `Hero image found on the page: ${ing.primaryImage.url} (this will be used as the reference for generate_image unless a different reference was supplied).`
      );
    }
    lines.push('---');
  }

  if (refs.length > 0) {
    const heading =
      refs.length === 1
        ? 'A reference image is attached for this hero render:'
        : `${refs.length} reference images are attached for this hero render — blend their feel; do not copy any literally:`;
    lines.push('', heading);
    for (const ref of refs.slice(0, 6)) {
      const refUrl = ref.url ?? '<inline base64>';
      const hint = ref.hint ? ` — ${ref.hint}` : '';
      lines.push(`- ${refUrl}${hint}`);
    }
    if (refs.length > 6) {
      lines.push(`(${refs.length - 6} additional refs not listed inline)`);
    }
    lines.push('Honour their composition and feel; do not copy any literally.');
  }

  lines.push(
    '',
    'Steps (DO EACH STEP EXACTLY ONCE — never retry a tool call):',
    '1) Call get_current_datetime(timezone="Asia/Singapore") so you know what "now" is — needed for Step 4.',
    '2) Call search_signals once with the trigger as seedText, platform=instagram, limit=8.',
    "3) Call generate_image EXACTLY ONCE with aspectRatio=1:1. Even if the first result is imperfect, accept it — re-rendering wastes credits and time.",
    '   Use the LAYOUT-AWARE hero prompt below VERBATIM as the `prompt` argument. It already encodes safe zones, multi-format crop guidance, and a no-on-image-text directive so one render survives crops to 4:5 / 9:16 / 16:9 without re-render. Do not paraphrase or shorten it:',
    '   <<<HERO_PROMPT',
    layoutAwarePrompt,
    '   HERO_PROMPT>>>'
  );

  // Variation positioning — informational. The layout-aware prompt above
  // already bakes mood keywords (parallel seed) into the rendered image;
  // these lines just remind Claude where this variation sits in the lap so
  // distinctness rationale is explicit in the system prompt context.
  if (input.parallelMoodSeed) {
    lines.push(
      `   This variation MUST lean toward this mood: ${input.parallelMoodSeed}. Other variations are running in parallel with different seeds; the layout-aware prompt already encodes this mood, this line is for variation positioning.`
    );
  } else if (input.priorMoodNotes.length > 0) {
    lines.push(
      `   Prior variations chose these moods (do NOT repeat): ${input.priorMoodNotes.join(' | ')}. If the layout-aware mood collides, swap in a distinct mood keyword before sending the prompt.`
    );
  } else {
    lines.push('   This is the first variation — the layout-aware prompt has a default mood; honour it.');
  }

  lines.push(
    '4) Output ONLY a JSON object with this shape, no other prose:',
    '{',
    '  "caption": "<60-180 char IG caption in en-SG, tied to the trigger>",',
    '  "captionsByLocale": {',
    '    "en-SG":      "<same caption>",',
    '    "zh-Hans-SG": "<natural-sounding Singaporean Mandarin translation, equivalent length>",',
    '    "ms-SG":      "<natural-sounding Bahasa Singapura translation, equivalent length>",',
    '    "ta-SG":      "<natural-sounding Singaporean Tamil translation, equivalent length>"',
    '  },',
    '  "hashtags": ["#tag1","#tag2","#tag3","#tag4","#tag5"],',
    '  "platform": "instagram",',
    '  "whenLocal": "<ISO8601 timestamp during a Singapore prime-time IG window WITHIN 36 hours of the get_current_datetime result>",',
    '  "moodNote": "<10-word mood label distinguishing this variation>"',
    '}',
    'BUDGET: total 3 tool calls (1 datetime + 1 search_signals + 1 generate_image), then the JSON. NEVER call generate_image more than once.'
  );

  return lines.join('\n');
};

export type LocaleCode = 'en-SG' | 'zh-Hans-SG' | 'ms-SG' | 'ta-SG';

export const SG_LOCALES: readonly LocaleCode[] = [
  'en-SG',
  'zh-Hans-SG',
  'ms-SG',
  'ta-SG',
] as const;

export interface ParsedAgentEnvelope {
  caption?: string;
  captionsByLocale?: Partial<Record<LocaleCode, string>>;
  hashtags?: string[];
  platform?: string;
  whenLocal?: string;
  moodNote?: string;
}

/**
 * Pull the structured JSON envelope out of the agent's free-form final text.
 * Tolerates leading/trailing prose by extracting the largest `{…}` span.
 * Returns an empty object when no parse succeeds — partial extraction is
 * acceptable for v1 since the persistence schema marks each field optional.
 */
export function parseAgentEnvelope(finalText: string): ParsedAgentEnvelope {
  if (!finalText) return {};
  const trimmed = finalText.trim();
  // Try the cleanest path first: the whole text is a JSON object.
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    return pickEnvelope(parsed);
  } catch {
    // fall through to substring extraction
  }
  // Greedy substring between first `{` and last `}`. Robust enough for the
  // common case where Claude wraps JSON in a code fence or short preamble.
  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first === -1 || last <= first) return {};
  const candidate = trimmed.slice(first, last + 1);
  try {
    const parsed = JSON.parse(candidate) as Record<string, unknown>;
    return pickEnvelope(parsed);
  } catch {
    return {};
  }
}

function pickEnvelope(parsed: Record<string, unknown>): ParsedAgentEnvelope {
  const out: ParsedAgentEnvelope = {};
  if (typeof parsed.caption === 'string') out.caption = parsed.caption;
  if (Array.isArray(parsed.hashtags)) {
    out.hashtags = parsed.hashtags.filter((tag): tag is string => typeof tag === 'string');
  }
  if (typeof parsed.platform === 'string') out.platform = parsed.platform;
  if (typeof parsed.whenLocal === 'string') out.whenLocal = parsed.whenLocal;
  if (typeof parsed.moodNote === 'string') out.moodNote = parsed.moodNote;
  if (
    typeof parsed.captionsByLocale === 'object' &&
    parsed.captionsByLocale !== null &&
    !Array.isArray(parsed.captionsByLocale)
  ) {
    const raw = parsed.captionsByLocale as Record<string, unknown>;
    const filtered: Partial<Record<LocaleCode, string>> = {};
    for (const code of SG_LOCALES) {
      const v = raw[code];
      if (typeof v === 'string' && v.trim().length > 0) filtered[code] = v;
    }
    if (Object.keys(filtered).length > 0) out.captionsByLocale = filtered;
  }
  return out;
}

/**
 * Pull the hero image URL out of the agent's tool steps. Looks for the
 * first successful generate_image step and returns its `images[0].url` (the
 * shape /api/generate returns when the underlying provider succeeds).
 */
export function pickHeroImageUrl(steps: MultiAgentToolStep[]): string | undefined {
  for (const step of steps) {
    if (step.name !== 'generate_image' || !step.ok) continue;
    const out = step.output as Record<string, unknown> | undefined;
    const result = out?.result as Record<string, unknown> | undefined;
    const images = (result?.images as Array<Record<string, unknown>> | undefined) ?? [];
    const firstUrl = images[0]?.url;
    if (typeof firstUrl === 'string' && firstUrl.length > 0) return firstUrl;
    // /api/generate also surfaces the URL as `imageUrl` on top-level in some
    // adapters — accept that fallback too.
    const topLevelUrl = out?.imageUrl;
    if (typeof topLevelUrl === 'string' && topLevelUrl.length > 0) return topLevelUrl;
  }
  return undefined;
}

// ───── Post-hero pipeline (multi-format + adaptive multilingual text) ────

const STANDARD_FORMATS: ReadonlyArray<FormatTarget> = [
  { id: '1x1', w: 1024, h: 1024, label: 'Hero · Square' },
  { id: '4x5', w: 1080, h: 1350, label: 'IG Portrait' },
  { id: '9x16', w: 1080, h: 1920, label: 'Story / Reel' },
  { id: '16x9', w: 1920, h: 1080, label: 'Banner' },
];

/**
 * Default text-bearing safe zones for an Auto-Mode hero. The agent
 * doesn't author a sketch for us, so we use sensible IG defaults: a
 * headline reservation at the top, caption at the bottom. Both are
 * `mustSurviveAllCrops` so cropHeroToFormats preserves them across
 * 4:5 / 9:16 / 16:9.
 */
const DEFAULT_TEXT_SAFE_ZONES: ReadonlyArray<SafeZone> = [
  {
    purpose: 'headline',
    bbox: { x: 0.05, y: 0.05, w: 0.9, h: 0.18 },
    mustSurviveAllCrops: true,
  },
  {
    purpose: 'caption',
    bbox: { x: 0.05, y: 0.78, w: 0.9, h: 0.17 },
    mustSurviveAllCrops: true,
  },
];

function buildAutoModeComponent(input: {
  rewrittenPromptOrCaption: string;
  moodNote?: string;
}): SemanticCreativeComponent {
  const moodKeywords = (input.moodNote ?? '')
    .split(/[\s,—|·]+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 2)
    .slice(0, 8);
  return {
    hero: { description: input.rewrittenPromptOrCaption },
    mood: { keywords: moodKeywords.length > 0 ? moodKeywords : ['cinematic'] },
    safeZones: [...DEFAULT_TEXT_SAFE_ZONES],
    cropPriorities: {
      primary: { x: 0.18, y: 0.18, w: 0.64, h: 0.64 },
    },
    formats: [...STANDARD_FORMATS],
  };
}

function isDataUrl(url: string | undefined): boolean {
  return typeof url === 'string' && url.startsWith('data:');
}

/**
 * Segmentation A/B paths (slice #2). Both run in parallel via
 * Promise.allSettled inside `runPostHeroPipeline`. The fast / one-shot path
 * has no LLM dependency — pure SAM3 calls. The vision-guided path adds one
 * Claude vision call to derive per-image prompts; falls through to null if
 * ANTHROPIC_API_KEY is absent or the vision call fails.
 *
 * Both produce the SAME shape (`SegmentSubjectsResult`) so the consumer
 * (text-overlay planner) is path-agnostic.
 */
async function runOneShotSegmentationPath(
  heroUrl: string,
  baseUrl: string,
  width: number,
  height: number
): Promise<SegmentSubjectsResult | null> {
  if (isDataUrl(heroUrl)) return null;
  try {
    return await segmentSubjects({
      imageUrl: heroUrl,
      prompts: ONE_SHOT_PROMPTS,
      baseUrl,
      width,
      height,
    });
  } catch {
    return null;
  }
}

async function runVisionGuidedSegmentationPath(
  heroUrl: string,
  baseUrl: string,
  width: number,
  height: number
): Promise<SegmentSubjectsResult | null> {
  if (isDataUrl(heroUrl)) return null;
  if (!process.env.ANTHROPIC_API_KEY) return null;
  try {
    const desc = await describeImage({ imageUrl: heroUrl });
    const prompts = descriptionToSegmentPrompts(desc);
    if (prompts.length === 0) return null;
    return await segmentSubjects({
      imageUrl: heroUrl,
      prompts,
      baseUrl,
      width,
      height,
    });
  } catch {
    return null;
  }
}

interface PostHeroOutcome {
  formatCrops: AutoModeFormatCrop[];
  textOverlays?: ProposedTextOverlay[];
  textOverlayWarnings?: string[];
  masksOneShot?: SegmentSubjectsResult;
  masksVisionGuided?: SegmentSubjectsResult;
}

async function runPostHeroPipeline(input: {
  heroUrl: string | undefined;
  caption: string | undefined;
  moodNote: string | undefined;
  baseUrl: string;
  workspaceId?: string;
}): Promise<PostHeroOutcome> {
  if (!input.heroUrl) {
    return { formatCrops: [] };
  }

  // Hero dims: when /api/generate streams images we lift width/height from
  // the frame.completed event into result.images[0]. Fall back to the
  // standard 1024² when missing.
  const heroAsset = { width: 1024, height: 1024, url: input.heroUrl };

  // 1. Format crops — pure math, never throws.
  const cropped: CroppedFormat[] = cropHeroToFormats({
    heroAsset,
    formats: STANDARD_FORMATS,
    safeZones: DEFAULT_TEXT_SAFE_ZONES,
  });
  const formatCrops: AutoModeFormatCrop[] = cropped.map((c) => ({
    formatId: c.formatId,
    aspectRatio:
      c.format.id === '1x1'
        ? '1:1'
        : c.format.id === '4x5'
          ? '4:5'
          : c.format.id === '9x16'
            ? '9:16'
            : '16:9',
    w: c.w,
    h: c.h,
    crop: c.crop,
    fit: c.fit,
  }));

  // 2. Segmentation A/B — run BOTH paths in parallel. Either path failing
  // is non-fatal; the other still feeds the planner. When both succeed,
  // vision-guided wins (richer per-image prompts → tighter masks).
  const [oneShotSettled, visionGuidedSettled] = await Promise.allSettled([
    runOneShotSegmentationPath(
      input.heroUrl,
      input.baseUrl,
      heroAsset.width,
      heroAsset.height
    ),
    runVisionGuidedSegmentationPath(
      input.heroUrl,
      input.baseUrl,
      heroAsset.width,
      heroAsset.height
    ),
  ]);
  const masksOneShot =
    oneShotSettled.status === 'fulfilled' && oneShotSettled.value
      ? oneShotSettled.value
      : undefined;
  const masksVisionGuided =
    visionGuidedSettled.status === 'fulfilled' && visionGuidedSettled.value
      ? visionGuidedSettled.value
      : undefined;

  // Pick the primary input for the text-overlay planner. Vision-guided
  // wins when present AND it surfaced at least one mask; else fall back
  // to one-shot; else empty (planner runs without forbidden regions).
  const primaryMasks =
    masksVisionGuided && masksVisionGuided.masks.length > 0
      ? masksVisionGuided
      : masksOneShot && masksOneShot.masks.length > 0
        ? masksOneShot
        : null;
  const forbiddenRegions = primaryMasks
    ? segmentSubjectsToForbiddenRegions(primaryMasks)
    : [];

  // 3. Text-overlay planner — multilingual + adaptive placement.
  const component = buildAutoModeComponent({
    rewrittenPromptOrCaption: input.caption ?? 'idol drama hero',
    moodNote: input.moodNote,
  });
  try {
    const overlay = await applyTextOverlay({
      component,
      sourceLocale: asBCP47LocaleCode('en-SG'),
      targetLocales: [
        asBCP47LocaleCode('zh-Hans-SG'),
        asBCP47LocaleCode('ms-SG'),
        asBCP47LocaleCode('ta-SG'),
      ],
      creatorIntent: input.caption,
      forbiddenRegions,
      wsId: input.workspaceId,
    });
    return {
      formatCrops,
      textOverlays: overlay.layers,
      textOverlayWarnings: overlay.warnings,
      masksOneShot,
      masksVisionGuided,
    };
  } catch {
    return { formatCrops, masksOneShot, masksVisionGuided };
  }
}

interface RunOneVariationInput {
  promptInput: VariationPromptInput;
  baseUrl: string;
  workspaceId?: string;
  maxIterationsPerVariation?: number;
  referenceImages?: AutoModeReferenceImage[];
}

async function runOneVariation(
  input: RunOneVariationInput
): Promise<AutoModeVariationResult> {
  const prompt = VARIATION_SYSTEM_NOTE(input.promptInput);
  let agentStepsForVariation: MultiAgentToolStep[] = [];
  let agentFinalText = '';
  let variationError: string | undefined;

  try {
    const agentRun = await runMultiAgent({
      prompt,
      baseUrl: input.baseUrl,
      wsId: input.workspaceId,
      maxIterations: input.maxIterationsPerVariation,
      referenceImages: input.referenceImages?.map((ref) => ({
        url: ref.url,
        dataUrl: ref.dataUrl,
      })),
    });
    agentStepsForVariation = agentRun.steps;
    agentFinalText = agentRun.finalText;
  } catch (err) {
    variationError = err instanceof Error ? err.message : String(err);
  }

  const envelope = parseAgentEnvelope(agentFinalText);
  const heroImageUrl = pickHeroImageUrl(agentStepsForVariation);

  // A variation without a hero image is NOT ready — even if the agent loop
  // returned cleanly, a failed generate_image (timeout / provider error)
  // leaves us with no asset to publish. Surface the underlying step error
  // so the UI can show why the variation failed.
  const failedGenerateStep = agentStepsForVariation.find(
    (s) => s.name === 'generate_image' && !s.ok
  );
  const effectiveError =
    variationError ??
    (heroImageUrl
      ? undefined
      : failedGenerateStep?.errorMessage ??
        'no hero image produced (generate_image did not succeed)');

  // Post-hero pipeline only when we actually have a hero — otherwise the
  // segmentation calls would 4xx (no source URL) and crops are meaningless.
  const postHero =
    effectiveError || !heroImageUrl
      ? { formatCrops: [] as AutoModeFormatCrop[] }
      : await runPostHeroPipeline({
          heroUrl: heroImageUrl,
          caption: envelope.caption,
          moodNote: envelope.moodNote,
          baseUrl: input.baseUrl,
          workspaceId: input.workspaceId,
        });

  return {
    index: input.promptInput.index,
    status: effectiveError ? 'failed' : 'ready',
    heroImageUrl,
    caption: envelope.caption,
    captionsByLocale: envelope.captionsByLocale,
    hashtags: envelope.hashtags,
    moodNote: envelope.moodNote,
    schedulePlatform: envelope.platform,
    scheduleWhenLocal: envelope.whenLocal,
    formatCrops: postHero.formatCrops,
    textOverlays: postHero.textOverlays,
    textOverlayWarnings: postHero.textOverlayWarnings,
    masksOneShot: postHero.masksOneShot,
    masksVisionGuided: postHero.masksVisionGuided,
    agentSteps: agentStepsForVariation,
    agentFinalText,
    error: effectiveError,
  };
}

/**
 * Auto-post step (notifyMode='auto-post' only). Iterates ready variations,
 * resolves the publisher seam (preview by default — the always-available
 * adapter that owns no external side effects), schedules one ScheduledPost
 * per ready variation × its envelope-declared platform, and persists each
 * row to Convex via `recordScheduledPost`.
 *
 * Fail-soft per variation: a publisher.schedule reject or a platform we
 * don't recognise just logs and skips that one row — never aborts the lap.
 *
 * Skipped when `workspaceId` is missing (preview publisher requires a
 * workspace to scope its storage; we don't fabricate one).
 */
async function scheduleVariationPosts(input: {
  variations: AutoModeVariationResult[];
  workspaceId?: string;
  baseUrl: string;
}): Promise<string[]> {
  const ids: string[] = [];
  if (!input.workspaceId) return ids;

  const publisher = resolvePublisher({
    workspaceId: input.workspaceId,
    preferredId: 'preview',
    baseUrl: input.baseUrl,
  });

  for (const variation of input.variations) {
    if (variation.status !== 'ready') continue;
    if (!variation.heroImageUrl) continue;
    if (!variation.schedulePlatform || !variation.scheduleWhenLocal) continue;

    const platform = variation.schedulePlatform as PublishPlatform;
    if (!PUBLISH_PLATFORMS.includes(platform)) continue;

    const scheduledAt = normalizeScheduledAt(variation.scheduleWhenLocal);
    if (!scheduledAt) continue;

    const post: ScheduledPost = {
      id: '',
      platform,
      mediaUrls: [variation.heroImageUrl],
      caption: variation.caption ?? '',
      hashtags: variation.hashtags ?? [],
      scheduledAt,
    };

    try {
      const result = await publisher.schedule(post);
      const persistedId = await recordScheduledPost({
        workspaceId: input.workspaceId,
        post,
        provider: publisher.id,
        externalId: result.externalId,
      });
      const id =
        persistedId ??
        extractPreviewIdFromUrl(result.previewUrl) ??
        result.externalId ??
        `pub_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      ids.push(id);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(
        `[auto-mode] scheduleVariationPosts: variation ${variation.index} failed`,
        err
      );
    }
  }

  return ids;
}

function normalizeScheduledAt(whenLocal: string): string | null {
  const d = new Date(whenLocal);
  if (Number.isNaN(d.getTime())) return null;
  // Preserve the original tz offset so manifests stay human-readable.
  return whenLocal;
}

function extractPreviewIdFromUrl(previewUrl: string): string | null {
  try {
    return new URL(previewUrl, 'http://local').searchParams.get('publishPreview');
  } catch {
    return null;
  }
}

async function persistVariation(
  campaignId: string,
  workspaceId: string | undefined,
  variation: AutoModeVariationResult
): Promise<void> {
  const agentRunIds = variation.agentSteps
    .map((step) => step.clientRunId)
    .filter((id): id is string => typeof id === 'string');

  await insertCampaignVariation({
    campaignId,
    workspaceId,
    index: variation.index,
    status: variation.status,
    heroImageUrl: variation.heroImageUrl,
    caption: variation.caption,
    captionsByLocale: variation.captionsByLocale,
    hashtags: variation.hashtags,
    moodNote: variation.moodNote,
    schedulePlatform: variation.schedulePlatform,
    scheduleWhenLocal: variation.scheduleWhenLocal,
    formatCrops: variation.formatCrops,
    masksOneShot: variation.masksOneShot,
    masksVisionGuided: variation.masksVisionGuided,
    agentRunIds,
    error: variation.error,
  });
}

export async function runAutoMode(req: AutoModeRequest): Promise<AutoModeResult> {
  const concurrency: AutoModeConcurrency = req.concurrency ?? 'sequential';

  const campaignId = await startCampaign({
    workspaceId: req.workspaceId,
    triggerKind: req.trigger.kind,
    triggerPayload: req.trigger.payload,
    variationCount: req.variationCount,
    notifyMode: req.notifyMode,
  });

  // ─── URL ingestion (multimodal v1) ──────────────────────────────────────
  // When the trigger is a URL, fetch the page once at the lap level so all
  // variations share the same enriched context. Fail-soft: a network or
  // parse error degrades to plain trigger-as-string. The og:image (and
  // top body images) become the default reference images when the caller
  // didn't supply any.
  let urlIngestion: UrlIngestion | undefined;
  if (req.trigger.kind === 'url') {
    try {
      urlIngestion = await fetchUrlIngestion(req.trigger.payload);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(
        `[auto-mode] url ingestion failed for ${req.trigger.payload}:`,
        err instanceof Error ? err.message : String(err)
      );
    }
  }

  // Resolve effective reference images:
  //   1. req.referenceImages (plural, explicit) wins
  //   2. req.referenceImage (legacy singular) wraps to a 1-item array
  //   3. URL ingestion's images: primary first, then top 2 body images
  const effectiveReferenceImages: AutoModeReferenceImage[] = (() => {
    if (req.referenceImages && req.referenceImages.length > 0) {
      return req.referenceImages;
    }
    if (req.referenceImage) {
      return [req.referenceImage];
    }
    if (urlIngestion?.images && urlIngestion.images.length > 0) {
      const ingestedHint =
        urlIngestion.title || urlIngestion.description || undefined;
      return urlIngestion.images.slice(0, 3).map((img) => ({
        url: img.url,
        hint: ingestedHint,
      }));
    }
    return [];
  })();

  // ─── Lap-start ping (always, regardless of notifyMode) ────────────────
  // User wants visibility on kickoff so they know the lap is in flight.
  await notifyDiscord({
    tag: 'lap-start',
    content: [
      `▶︎ Auto Mode lap started`,
      `Trigger: ${req.trigger.kind} · ${req.trigger.payload.slice(0, 80)}`,
      `${req.variationCount} variations · ${concurrency} · ${req.notifyMode}${
        effectiveReferenceImages.length > 0
          ? ` · ${effectiveReferenceImages.length} ref${effectiveReferenceImages.length === 1 ? '' : 's'}`
          : ''
      }${urlIngestion ? ` · ingested: "${urlIngestion.title.slice(0, 60)}"` : ''}`,
      campaignId ? `campaign=${campaignId}` : 'campaign=local-only',
    ].join('\n'),
  });

  let variations: AutoModeVariationResult[];

  if (concurrency === 'parallel') {
    // Up-front seeds → no inter-variation feedback needed; run all at once.
    const tasks = Array.from({ length: req.variationCount }, (_unused, idx) => {
      const i = idx + 1;
      const moodSeed =
        PARALLEL_MOOD_SEEDS[idx % PARALLEL_MOOD_SEEDS.length];
      return runOneVariation({
        promptInput: {
          index: i,
          total: req.variationCount,
          trigger: req.trigger,
          priorMoodNotes: [],
          parallelMoodSeed: moodSeed,
          referenceImages: effectiveReferenceImages,
          urlIngestion,
        },
        baseUrl: req.baseUrl,
        workspaceId: req.workspaceId,
        maxIterationsPerVariation: req.maxIterationsPerVariation,
        referenceImages: effectiveReferenceImages,
      });
    });
    const settled = await Promise.allSettled(tasks);
    variations = settled.map((res, idx) => {
      if (res.status === 'fulfilled') return res.value;
      const i = idx + 1;
      return {
        index: i,
        status: 'failed',
        agentSteps: [],
        agentFinalText: '',
        error: res.reason instanceof Error ? res.reason.message : String(res.reason),
      };
    });
  } else {
    // Sequential: priorMoodNotes feed forward for distinctness.
    variations = [];
    const priorMoodNotes: string[] = [];
    for (let i = 1; i <= req.variationCount; i += 1) {
      const variation = await runOneVariation({
        promptInput: {
          index: i,
          total: req.variationCount,
          trigger: req.trigger,
          priorMoodNotes: [...priorMoodNotes],
          referenceImages: effectiveReferenceImages,
          urlIngestion,
        },
        baseUrl: req.baseUrl,
        workspaceId: req.workspaceId,
        maxIterationsPerVariation: req.maxIterationsPerVariation,
        referenceImages: effectiveReferenceImages,
      });
      if (variation.moodNote) priorMoodNotes.push(variation.moodNote);
      variations.push(variation);
    }
  }

  // Persist each variation. Sequential mode could write each row inline
  // above, but doing it after the run keeps both modes symmetric.
  if (campaignId) {
    for (const variation of variations) {
      await persistVariation(campaignId, req.workspaceId, variation);
    }
  }

  const lapStatus: 'completed' | 'failed' = variations.some(
    (v) => v.status === 'failed'
  )
    ? 'failed'
    : 'completed';
  if (campaignId) await setCampaignStatus(campaignId, lapStatus);

  // ─── Auto-post step ───────────────────────────────────────────────────
  // Only when the caller asked for auto-post mode. Skips when no
  // workspaceId since the preview publisher requires one.
  let scheduledPostIds: string[] = [];
  if (req.notifyMode === 'auto-post') {
    scheduledPostIds = await scheduleVariationPosts({
      variations,
      workspaceId: req.workspaceId,
      baseUrl: req.baseUrl,
    });
  }

  // ─── Lap-end ping — copy depends on notifyMode ────────────────────────
  // Always firing the end ping (even in 'review' / 'auto-post') so the
  // user knows what state the lap finished in. The 'review' copy
  // explicitly tells them an action is required; 'auto-post' copy lists
  // what was scheduled.
  const okCount = variations.filter((v) => v.status === 'ready').length;
  const variationLines = variations.map((v) => {
    const sched =
      v.scheduleWhenLocal && v.schedulePlatform
        ? ` · ${v.schedulePlatform} ${v.scheduleWhenLocal}`
        : '';
    const captionPreview = v.caption ? `“${v.caption.slice(0, 80)}…”` : '<no caption>';
    return `  v${v.index} ${v.status === 'ready' ? '✓' : '✗'} ${captionPreview}${sched}`;
  });

  let endHeader: string;
  if (req.notifyMode === 'review') {
    endHeader = `🟡 Auto Mode lap ${lapStatus} — AWAITING APPROVAL · ${okCount}/${req.variationCount} variations ready`;
  } else if (req.notifyMode === 'auto-post') {
    endHeader = `🟢 Auto Mode lap ${lapStatus} — POSTS SCHEDULED · ${scheduledPostIds.length}/${okCount} posts scheduled (${req.variationCount} variations)`;
  } else {
    endHeader = `${lapStatus === 'completed' ? '✅' : '⚠️'} Auto Mode lap ${lapStatus} — ${okCount}/${req.variationCount} variations ready (${concurrency})`;
  }

  const endContent = [
    endHeader,
    `Trigger: ${req.trigger.kind} · ${req.trigger.payload.slice(0, 80)}`,
    ...variationLines,
    ...(scheduledPostIds.length > 0
      ? [`scheduled_posts: ${scheduledPostIds.join(', ')}`]
      : []),
    campaignId ? `campaign=${campaignId}` : 'campaign=local-only',
  ].join('\n');

  const notified = await notifyDiscord({
    tag: `lap-end-${req.notifyMode}`,
    content: endContent,
  });

  return {
    campaignId,
    variations,
    status: lapStatus,
    notified,
    scheduledPostIds,
    urlIngestion,
  };
}
