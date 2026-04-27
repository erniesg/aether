import { runMultiAgent, type MultiAgentToolStep } from './multi';
import {
  insertCampaignVariation,
  recordScheduledPost,
  setCampaignStatus,
  setCampaignResearchBundle,
  setCampaignSchedulePlan,
  setCampaignClusterBundle,
  setCampaignUrlIngestion,
  startCampaign,
} from '@/lib/convex/http';
import { logLapEvent } from './lap-logger';
import {
  notifyDiscord,
  type DiscordActionRow,
  type DiscordEmbed,
} from '@/lib/notify/discord';
import {
  resolvePublisher,
  resolvePublisherForPost,
} from '@/lib/providers/publisher/registry';
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
  type ImageDescription,
} from './describe-image';
import { fetchUrlIngestion, type UrlIngestion } from '@/lib/ingest/url';
import { parseBrandProduct } from '@/lib/ingest/brand-parser';
import { searchProductOnSerp, searchProductImagesOnSerp } from '@/lib/ingest/serp';
import { fetchPdfIngestion, type PdfIngestion } from '@/lib/ingest/pdf';
import { uploadAssetToConvex } from '@/lib/storage/convexAsset';
import { composeVariantSet } from '@/lib/text-overlay/compose';
import { renderPerFormatHeroes } from './per-format-render';
import type { AspectRatio } from '@/lib/providers/image/types';
import { runResearchAgent, type ResearchBundle } from './managed/research';
import {
  runSignoffAgent,
  type BrandGuardrails,
  type SchedulePlan,
  type SignoffVariation,
} from './managed/signoff';
import { runClusterAgent, type ClusterBundle } from './managed/cluster';

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
  /**
   * When true, override every variation's `scheduleWhenLocal` with
   * (now + 30s) before handing to the publisher. Lets the auto-post path
   * fire IMMEDIATE posts on adapters that reject true future scheduling
   * (X / IG / TikTok direct). Use for "fire it right now" demos —
   * Postiz schedules through fine without this flag.
   */
  forcePostNow?: boolean;
  /**
   * Per-lap toggle for the Managed Agents API path. Default: true (use
   * Managed Agents when AGENT_ID + ENVIRONMENT_ID env vars are set,
   * fall back to messages.create otherwise). When false, all three
   * managed agents (research / cluster / signoff) skip the Managed
   * Agents API entirely and run on messages.create regardless of env
   * config — useful for the demo "compare standard vs managed" toggle
   * and for cost-controlled local iteration. Surfaced in the right rail.
   */
  useManagedAgents?: boolean;
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
  /** Convex asset doc id when the hero was uploaded to Convex storage
   *  (i.e. the data URL was successfully migrated). Lets the UI fetch the
   *  source bytes for re-segmentation / variant fork-off. */
  heroAssetId?: string;
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
  /** Convex public URL of the 4×4 atlas (formats × locales) — one
   *  concatenated thumbnail per variation that the Discord embed surfaces
   *  so the user can review every variant before posts fire. Absent when
   *  the hero never produced bytes or the atlas compose failed. */
  atlasUrl?: string;
  /** Convex asset id of the atlas (for re-fetch / cleanup paths). */
  atlasAssetId?: string;
  /** Format ids for which native-per-format render produced bytes. Empty
   *  array when AUTO_MODE_NATIVE_PER_FORMAT was off or all aspects failed
   *  — both downgrade to crop-from-1:1 in the atlas composer. */
  nativePerFormatRendered?: Array<'4x5' | '9x16' | '16x9'>;
  /**
   * Per-format public URLs after Convex upload. `'1x1'` is always the
   * heroImageUrl itself (the 1:1 hero IS the original render). 4x5/9x16/
   * 16x9 are populated when AUTO_MODE_NATIVE_PER_FORMAT renders succeeded
   * AND the bytes were uploaded to Convex. Missing keys signal "no native
   * render available for this format" — the canvas drop and Discord embed
   * fall back to atlas → hero. Undefined when the variation has no hero.
   */
  nativePerFormatUrls?: Partial<Record<'1x1' | '4x5' | '9x16' | '16x9', string>>;
  /** Per-aspect provider error messages from native-per-format render
   *  (when any aspect rejected). Useful for surfacing in /inspect. */
  nativePerFormatErrors?: Record<string, string>;
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
  /**
   * When `trigger.kind === 'file'` and the payload sniffs to a PDF, the
   * extracted text + page metadata. Same role as `urlIngestion` for PDFs:
   * weaves into the variation prompt and surfaces in the UI.
   */
  pdfIngestion?: PdfIngestion;
  /**
   * Vision-described content of the top reference images (Claude 4.7
   * vision). Surfaced so the UI can show "the hero was generated based
   * on these refs, which contain X products, Y brands, Z faces" — the
   * traceable-to-reference provenance Ernie called for.
   */
  referenceDescriptions?: ImageDescription[];
  /**
   * B2 — Research Managed Agent bundle. Populated when runAutoMode runs
   * the research agent successfully; undefined when the agent was skipped
   * (no API key, or AUTO_MODE_SKIP_RESEARCH=1) or failed. Lane C surfaces
   * this in the right-rail "research" panel (sources, snippets, insights).
   */
  researchBundle?: ResearchBundle;
  /**
   * Signoff Managed Agent plan. Populated when AUTO_MODE_USE_SIGNOFF=1 and
   * notifyMode='auto-post'; per-variation decision (auto-post / hold-for-
   * review / reject) gates which variations actually go through publishing.
   * Undefined when the gate was disabled or the agent failed (fail-soft —
   * the lap falls back to scheduling every ready variation).
   */
  schedulePlan?: SchedulePlan;
  /**
   * Cluster Managed Agent bundle. Populated when the cluster agent groups
   * the lap's reference images (urlIngestion.images + serp images +
   * explicit refs) into 2-4 visual clusters. Surfaces in the right rail
   * and /inspect so creators can see "these references group like X / Y /
   * Z". Undefined when the agent was skipped (no refs) or failed.
   */
  clusterBundle?: ClusterBundle;
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
  /** When trigger.kind === 'file' and the payload sniffs to a PDF, the
   *  extracted text + metadata. Title/author/excerpt feed the prompt. */
  pdfIngestion?: PdfIngestion;
  /** Vision-described content of each reference image — Claude 4.7 vision
   *  output. Fixes the "didn't find the Pod" gap: when the og:image is a
   *  generic bedroom shot, the description tells the gen "here's the
   *  Pod 4 Ultra mattress cover, low-profile chrome under-bed lighting,
   *  sleeping figure" so the hero render knows what to draw. */
  referenceDescriptions?: ImageDescription[];
  /**
   * B2 Research Managed Agent bundle — injected per-variation so the agent
   * can cite competitor signals, locale insights, and recent campaigns when
   * composing the caption and scheduling decisions.
   */
  researchBundle?: ResearchBundle;
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
  pdfIngestion?: PdfIngestion;
  referenceDescriptions?: ImageDescription[];
  referenceImageCount?: number;
}): string {
  // For image-file triggers (data URLs), the raw payload is megabytes of
  // base64 — useless to the layout planner. Replace with a friendly tag
  // when no richer context (URL or PDF ingestion) is available.
  const safeTriggerPayload = input.trigger.payload.startsWith('data:')
    ? '<creator-uploaded reference image>'
    : input.trigger.payload;
  // Compose the hero description from whatever signal is most specific:
  // - URL trigger: ingested page title + description + first product.
  // - PDF trigger: ingested title + first lines of the document (the raw
  //   payload is a data: URL or .pdf URL, neither informs the planner).
  // - Text trigger: payload itself.
  // Pull product / brand / face content from any vision-described
  // references so the layout-aware prompt knows what to render. Critical
  // for cases where the URL ingestion couldn't extract Schema.org Product
  // (e.g. eightsleep homepage) — vision fills the gap.
  const visionProducts: string[] = [];
  const visionBrands: string[] = [];
  const visionFaces: string[] = [];
  for (const desc of input.referenceDescriptions ?? []) {
    for (const p of desc.products ?? []) {
      if (p.name) visionProducts.push(p.description ? `${p.name} (${p.description})` : p.name);
    }
    for (const b of desc.brands ?? []) {
      if (b.name) visionBrands.push(b.name);
    }
    for (const f of desc.faces ?? []) {
      if (f.description) visionFaces.push(f.description);
    }
  }

  const heroDescription = (() => {
    if (input.urlIngestion) {
      const ing = input.urlIngestion;
      const parts: string[] = [];
      if (ing.title) parts.push(ing.title);
      if (ing.description) parts.push(ing.description);
      else if (ing.bodyExcerpt) parts.push(ing.bodyExcerpt.split('\n')[0]);
      // Prefer vision-described product over Schema.org-extracted one when
      // both exist — vision is per-image specific and catches what
      // structured data misses.
      if (visionProducts.length > 0) {
        parts.push(`featuring ${visionProducts.slice(0, 2).join(' and ')}`);
      } else if (ing.products[0]?.name) {
        parts.push(`featuring ${ing.products[0].name}`);
      }
      if (visionBrands.length > 0) {
        parts.push(`brand: ${visionBrands.slice(0, 2).join(', ')}`);
      }
      const joined = parts.join(' — ');
      if (joined) {
        return input.referenceHint
          ? `${joined} (reference vibe: ${input.referenceHint})`
          : joined;
      }
    }
    if (input.pdfIngestion) {
      const pdf = input.pdfIngestion;
      const parts: string[] = [];
      if (pdf.title) parts.push(pdf.title);
      // First non-empty line of the body usually carries the doc's headline.
      const firstLine = pdf.text
        .split(/\r?\n/)
        .map((s) => s.trim())
        .find((s) => s.length > 12);
      if (firstLine) parts.push(firstLine.slice(0, 240));
      const joined = parts.join(' — ');
      if (joined) {
        return input.referenceHint
          ? `${joined} (reference vibe: ${input.referenceHint})`
          : joined;
      }
    }
    return input.referenceHint
      ? `${safeTriggerPayload} (reference vibe: ${input.referenceHint})`
      : safeTriggerPayload;
  })();
  // Creator-prompt lead reflects the ingested brief when available — a
  // URL or data: URL string is uninformative to the image generator.
  const creatorPrompt = (() => {
    if (input.urlIngestion?.title) {
      return input.urlIngestion.description
        ? `${input.urlIngestion.title} — ${input.urlIngestion.description}`
        : input.urlIngestion.title;
    }
    if (input.pdfIngestion?.title) {
      return input.pdfIngestion.title;
    }
    return safeTriggerPayload;
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
    pdfIngestion: input.pdfIngestion,
    referenceDescriptions: input.referenceDescriptions,
    referenceImageCount: refs.length,
  });

  // For image / pdf data URLs the payload can be megabytes of base64 — replace
  // it with a friendly summary so the variation prompt stays small.
  const triggerDisplay = (() => {
    const p = input.trigger.payload;
    if (p.startsWith('data:')) {
      const head = p.slice(5, p.indexOf(','));
      const mime = head.split(';', 1)[0] || 'unknown';
      return `<inline ${mime} (${Math.round(p.length / 1024)} KB)>`;
    }
    return p;
  })();

  const lines = [
    `Auto-Mode lap. You are running variation ${input.index} of ${input.total}.`,
    '',
    `Trigger (${input.trigger.kind}): ${triggerDisplay}`,
  ];

  // URL ingestion enrichment — when the trigger was a URL we already
  // fetched the page; weave the title / description / product info /
  // body excerpt into the prompt so the agent has the page's actual
  // story to work from, not just the URL string.
  if (input.urlIngestion) {
    const ing = input.urlIngestion;
    lines.push('', '--- INGESTED PAGE CONTENT (auto-extracted from URL) ---');
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

  // PDF ingestion enrichment — same shape as URL but pulls from a
  // document (spec sheet, marketing PDF, brief). No image extraction in v2.
  if (input.pdfIngestion) {
    const pdf = input.pdfIngestion;
    lines.push('', '--- INGESTED PDF CONTENT (auto-extracted from file) ---');
    if (pdf.title) lines.push(`Document title: ${pdf.title}`);
    if (pdf.author) lines.push(`Author: ${pdf.author}`);
    lines.push(`Pages: ${pdf.pageCount}`);
    if (pdf.textExcerpt) {
      lines.push(
        'Text excerpt (head, ~1500 chars):',
        pdf.textExcerpt
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter((l) => l.length > 0)
          .slice(0, 16)
          .map((l) => `  · ${l}`)
          .join('\n')
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

  // Vision-described references: Claude 4.7 looked at each ref and wrote
  // out what's in it (faces, products, brands, components). This is HOW
  // the gen learns "the Pod 4 Ultra is the mattress cover with the chrome
  // under-bed glow" instead of guessing from the URL string alone. Fixes
  // the "generic bedroom" complaint when the og:image doesn't visually
  // foreground the actual product.
  if (input.referenceDescriptions && input.referenceDescriptions.length > 0) {
    lines.push('', '--- VISION-DESCRIBED REFERENCES (auto-extracted) ---');
    input.referenceDescriptions.forEach((desc, idx) => {
      lines.push(`Reference ${idx + 1}:`);
      if (desc.faces.length > 0) {
        lines.push(
          `  Faces: ${desc.faces
            .map((f) => f.description + (f.name ? ` (${f.name})` : ''))
            .join('; ')}`
        );
      }
      if (desc.products.length > 0) {
        lines.push(
          `  Products: ${desc.products
            .map((p) => p.name + (p.description ? ` — ${p.description}` : ''))
            .join('; ')}`
        );
      }
      if (desc.brands.length > 0) {
        lines.push(
          `  Brands: ${desc.brands.map((b) => b.name).join(', ')}`
        );
      }
      if (desc.otherComponents.length > 0) {
        lines.push(
          `  Other: ${desc.otherComponents
            .slice(0, 6)
            .map((c) => `${c.name} (${c.kind})`)
            .join(', ')}`
        );
      }
      if (desc.background.description) {
        lines.push(`  Setting: ${desc.background.description}`);
      }
    });
    lines.push(
      'Use these descriptions to ground your hero in the ACTUAL products / setting / faces shown in the references. When products are explicitly named, the hero MUST feature them recognisably — do not fall back to a generic scene.',
      '---'
    );
  }

  // B2 Research Managed Agent bundle — competitor signals + locale insights.
  // When present, the agent uses this to inform caption tone, hashtag
  // choices, and whenLocal scheduling (e.g. avoid clashing with a competitor
  // campaign that just ran). Surfaced after vision-described refs so the
  // agent sees product facts first, then market context.
  if (input.researchBundle) {
    const rb = input.researchBundle;
    lines.push('', '--- RESEARCH SIGNALS (from Anthropic Research Agent) ---');
    if (rb.summary) lines.push(`Summary: ${rb.summary}`);
    if (rb.competitors.length > 0) {
      lines.push(`Competitors in SG: ${rb.competitors.slice(0, 4).join(', ')}`);
    }
    if (rb.recentCampaigns.length > 0) {
      lines.push(
        'Recent campaigns to differentiate from:',
        ...rb.recentCampaigns.slice(0, 3).map((c) => `  · ${c}`)
      );
    }
    if (rb.localeInsights.length > 0) {
      lines.push('Locale copy insights:');
      for (const li of rb.localeInsights) {
        lines.push(`  ${li.locale}: ${li.insight}`);
      }
    }
    lines.push(
      'Use the above to write a caption that feels locally relevant and differentiates from the listed competitors and campaigns.',
      '---'
    );
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
  if (typeof parsed.caption === 'string' && parsed.caption.trim().length > 0) {
    out.caption = parsed.caption;
  }
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
  // Hoist en-SG → caption when top-level was missing/empty. The IKEA bug:
  // the agent emitted only captionsByLocale, leaving lap-end pings to print
  // `<no caption>` because the text-body builder reads v.caption directly.
  // Doing this once here keeps every downstream consumer (Discord text +
  // embed + persistence) coherent without scattered fallbacks.
  if (!out.caption && out.captionsByLocale?.['en-SG']) {
    out.caption = out.captionsByLocale['en-SG'];
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

/** Quick PDF sniff: data URL with application/pdf, or path/URL ending in .pdf. */
function isPdfPayload(payload: string): boolean {
  if (!payload) return false;
  if (
    payload.startsWith('data:') &&
    payload.toLowerCase().includes('application/pdf')
  ) {
    return true;
  }
  return /\.pdf(\?|#|$)/i.test(payload);
}

/**
 * Quick image sniff: data URL with image/*, or path/URL ending in a common
 * raster image extension. Used to route file triggers whose payload IS the
 * image bytes (drag-drop / upload) into the reference-image plumbing.
 */
function isImagePayload(payload: string): boolean {
  if (!payload) return false;
  if (payload.startsWith('data:image/')) return true;
  return /\.(png|jpe?g|webp|gif|avif|heic|heif)(\?|#|$)/i.test(payload);
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

  // 1. Segmentation A/B — run BOTH paths in parallel BEFORE crop math so
  // mask bboxes can feed safeZones (mask-aware crop). Either path failing
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

  // 2. Mask-aware safe zones — convert face / product / logo mask bboxes
  // into SafeZone entries so cropHeroToFormats avoids cropping out the
  // subject when generating 4:5 / 9:16 / 16:9 frames. Replaces the old
  // "always center-crop with static safe zones" behaviour. Static safe
  // zones (DEFAULT_TEXT_SAFE_ZONES) stay in for the text bands; mask
  // zones are appended so cropping respects the actual subject geometry.
  const maskSafeZones: SafeZone[] = (forbiddenRegions ?? [])
    .filter((r) => r.kind === 'face' || r.kind === 'product' || r.kind === 'logo')
    .map((r) => ({
      purpose:
        r.kind === 'logo'
          ? 'logo'
          : r.kind === 'product'
            ? 'product'
            : 'hero',
      bbox: r.bbox,
      mustSurviveAllCrops: true,
    }));
  const allSafeZones: SafeZone[] = [
    ...DEFAULT_TEXT_SAFE_ZONES,
    ...maskSafeZones,
  ];

  // 3. Format crops — pure math, never throws. Now mask-aware: crops are
  // chosen so face / product / logo bboxes survive every aspect.
  const cropped: CroppedFormat[] = cropHeroToFormats({
    heroAsset,
    formats: STANDARD_FORMATS,
    safeZones: allSafeZones,
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
  const rawHeroImageUrl = pickHeroImageUrl(agentStepsForVariation);

  // gpt-image-2 returns the hero as a data URL. SAM3 (Modal-hosted,
  // external) can't fetch data URLs, so we upload to Convex File Storage
  // and use the public CDN URL downstream. Fail-soft: if Convex isn't
  // reachable, we keep the data URL and downstream segmentation skips
  // (legacy behaviour). Provenance preserved on the asset row's sourceUrl.
  let heroImageUrl = rawHeroImageUrl;
  let heroAssetId: string | undefined;
  if (rawHeroImageUrl && rawHeroImageUrl.startsWith('data:')) {
    // Save a local copy for visual inspection before the upload swap.
    // Path: /tmp/aether-demo-runs/heroes/v<i>-<ts>.png. Fail-soft.
    try {
      const fs = await import('node:fs');
      const path = await import('node:path');
      const dir = '/tmp/aether-demo-runs/heroes';
      fs.mkdirSync(dir, { recursive: true });
      const b64 = rawHeroImageUrl.slice(rawHeroImageUrl.indexOf(',') + 1);
      const file = path.join(
        dir,
        `v${input.promptInput.index}-${new Date()
          .toISOString()
          .replace(/[:.]/g, '-')
          .slice(0, 19)}.png`
      );
      fs.writeFileSync(file, Buffer.from(b64, 'base64'));
      // eslint-disable-next-line no-console
      console.log(`[auto-mode v${input.promptInput.index}] saved hero → ${file}`);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(
        `[auto-mode v${input.promptInput.index}] hero save failed:`,
        err instanceof Error ? err.message : String(err)
      );
    }
    const uploaded = await uploadAssetToConvex({
      source: rawHeroImageUrl,
      kind: 'hero',
      sourceUrl: 'auto-mode hero render',
      width: 1024,
      height: 1024,
    });
    if (uploaded) {
      heroImageUrl = uploaded.publicUrl;
      heroAssetId = uploaded.id;
    }
  }

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

  // Native-per-format hero renders (AUTO_MODE_NATIVE_PER_FORMAT=1 only).
  // Bug-4: cropping the 1:1 hero to 4:5/9:16/16:9 can clip subjects. When
  // enabled, we re-render the missing aspects natively in PARALLEL so the
  // model frames each format correctly. Cost: 3× extra OpenAI image gens
  // per variation (~$0.57 at gpt-image-2 high quality), so it's opt-in.
  // Fail-soft: any rejected aspect just falls through to crop-from-1:1.
  let nativePerFormatBytes:
    | Partial<Record<'1x1' | '4x5' | '9x16' | '16x9', Buffer>>
    | undefined;
  let nativePerFormatRendered: Array<'4x5' | '9x16' | '16x9'> = [];
  let nativePerFormatErrors: Record<string, string> | undefined;
  const flagOn = process.env.AUTO_MODE_NATIVE_PER_FORMAT === '1';
  // eslint-disable-next-line no-console
  console.log(
    `[auto-mode v${input.promptInput.index}] native-per-format gate: flagOn=${flagOn}, hasHero=${!!heroImageUrl}, effectiveError=${effectiveError ?? 'none'}`
  );
  if (!effectiveError && heroImageUrl && flagOn) {
    const heroPrompt = extractHeroPrompt(agentStepsForVariation);
    // eslint-disable-next-line no-console
    console.log(
      `[auto-mode v${input.promptInput.index}] heroPrompt extracted: ${heroPrompt ? `${heroPrompt.length} chars` : 'NONE'}`
    );
    if (heroPrompt) {
      try {
        const refs = (input.referenceImages ?? [])
          .map((r) => ({ url: r.url ?? r.dataUrl ?? '' }))
          .filter((r) => r.url.length > 0);

        // Hero anchoring (2026-04-27): pass the agent's just-rendered 1:1
        // hero as the FIRST ref so the per-aspect calls preserve subjects /
        // styling / lighting / composition identity. Toggle off via
        // AUTO_MODE_HERO_ANCHOR=0 to fall back to free-recompose. The hero
        // URL is the Convex storage URL the agent uploaded; gpt-image-2's
        // edits endpoint fetches it as image[]. Without this, every aspect
        // came back as a different shoot — user complained 2026-04-27.
        const heroAnchorEnabled =
          process.env.AUTO_MODE_HERO_ANCHOR !== '0';
        const heroAnchor =
          heroAnchorEnabled && heroImageUrl ? { url: heroImageUrl } : undefined;

        // eslint-disable-next-line no-console
        console.log(
          `[auto-mode v${input.promptInput.index}] firing renderPerFormatHeroes — ${refs.length} brand refs + ${heroAnchor ? 'HERO-ANCHORED' : 'free-recompose'}, 3 aspects in parallel…`
        );
        refs.forEach((r, i) => {
          const isData = r.url.startsWith('data:');
          // eslint-disable-next-line no-console
          console.log(
            `[auto-mode v${input.promptInput.index}]   brand-ref[${i}] ${
              isData ? `DATA ${Math.round(r.url.length / 1024)}KB b64` : `URL ${r.url.slice(0, 80)}`
            }`
          );
        });
        if (heroAnchor) {
          // eslint-disable-next-line no-console
          console.log(
            `[auto-mode v${input.promptInput.index}]   hero-anchor URL ${heroAnchor.url.slice(0, 80)}`
          );
        }
        const result = await renderPerFormatHeroes({
          prompt: heroPrompt,
          refs,
          heroAnchor,
          heroAnchorEnabled,
          aspectRatios: ['4:5', '9:16', '16:9'] as AspectRatio[],
        });
        // eslint-disable-next-line no-console
        console.log(
          `[auto-mode v${input.promptInput.index}] renderPerFormatHeroes returned: ${result.byAspect.size} fulfilled, ${result.errorsByAspect.size} errored, totalLatencyMs=${result.totalLatencyMs}`
        );
        if (result.errorsByAspect.size > 0) {
          nativePerFormatErrors = {};
          for (const [aspect, err] of result.errorsByAspect) {
            nativePerFormatErrors[aspect] = err;
            // eslint-disable-next-line no-console
            console.warn(`[auto-mode v${input.promptInput.index}] ${aspect} failed: ${err}`);
          }
        }
        const aspectToFormatId: Record<string, '4x5' | '9x16' | '16x9'> = {
          '4:5': '4x5',
          '9:16': '9x16',
          '16:9': '16x9',
        };
        const collected: Partial<Record<'4x5' | '9x16' | '16x9', Buffer>> = {};
        for (const [aspect, render] of result.byAspect) {
          const formatId = aspectToFormatId[aspect];
          if (!formatId) continue;
          const bytes = await fetchHeroBytes(render.dataUrl ?? render.url);
          if (bytes) {
            collected[formatId] = bytes;
            nativePerFormatRendered.push(formatId);
            // Save the per-format render for inspection.
            try {
              const fs = await import('node:fs');
              const path = await import('node:path');
              const dir = '/tmp/aether-demo-runs/heroes';
              fs.mkdirSync(dir, { recursive: true });
              const file = path.join(
                dir,
                `v${input.promptInput.index}-${formatId}-${new Date()
                  .toISOString()
                  .replace(/[:.]/g, '-')
                  .slice(0, 19)}.png`
              );
              fs.writeFileSync(file, bytes);
              // eslint-disable-next-line no-console
              console.log(
                `[auto-mode v${input.promptInput.index}] saved ${formatId} → ${file}`
              );
            } catch (err) {
              // eslint-disable-next-line no-console
              console.warn(
                `[auto-mode v${input.promptInput.index}] save ${formatId} failed:`,
                err instanceof Error ? err.message : String(err)
              );
            }
          } else {
            // eslint-disable-next-line no-console
            console.warn(
              `[auto-mode v${input.promptInput.index}] ${aspect} bytes fetch failed (url len ${render.url?.length ?? 0}, dataUrl present=${!!render.dataUrl})`
            );
          }
        }
        if (Object.keys(collected).length > 0) {
          nativePerFormatBytes = collected;
          // eslint-disable-next-line no-console
          console.log(
            `[auto-mode v${input.promptInput.index}] nativePerFormatBytes populated for: ${Object.keys(collected).join(', ')}`
          );
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn(
          `[auto-mode v${input.promptInput.index}] native-per-format render threw:`,
          err instanceof Error ? err.message : String(err)
        );
      }
    }
  }

  // Upload native per-format renders to Convex storage so each format
  // frame on the canvas can show its own native render instead of
  // repeating the atlas. 1:1 always equals heroImageUrl (the 1:1 hero IS
  // the original render). 4x5/9x16/16x9 entries appear only when the
  // bytes-collected step above produced them AND Convex is configured.
  // Fail-soft per format: an upload reject just leaves that key absent
  // and the canvas drop falls back to atlas → hero.
  let nativePerFormatUrls:
    | Partial<Record<'1x1' | '4x5' | '9x16' | '16x9', string>>
    | undefined;
  if (!effectiveError && heroImageUrl) {
    const urls: Partial<Record<'1x1' | '4x5' | '9x16' | '16x9', string>> = {
      '1x1': heroImageUrl,
    };
    if (nativePerFormatBytes) {
      const aspects = (['4x5', '9x16', '16x9'] as const).filter(
        (a) => Boolean(nativePerFormatBytes[a])
      );
      // Parallel uploads — each format is independent, sequential awaits cost
      // ~3× wall-time. allSettled keeps one slow/failing aspect from blocking
      // the others: per-format upload errors stay scoped to that format.
      const settled = await Promise.allSettled(
        aspects.map((formatId) =>
          uploadAssetToConvex({
            source: nativePerFormatBytes![formatId]!,
            kind: 'hero',
            mime: 'image/png',
            sourceUrl: `auto-mode v${input.promptInput.index} ${formatId} native`,
          }).then((uploaded) => ({ formatId, uploaded }))
        )
      );
      for (const res of settled) {
        if (res.status === 'fulfilled' && res.value.uploaded) {
          urls[res.value.formatId] = res.value.uploaded.publicUrl;
        } else if (res.status === 'rejected') {
          // eslint-disable-next-line no-console
          console.warn(
            `[auto-mode v${input.promptInput.index}] native upload failed:`,
            res.reason instanceof Error ? res.reason.message : String(res.reason)
          );
        }
      }
    }
    nativePerFormatUrls = urls;
  }

  // Variant atlas — 4 formats × 4 SG locales composed into one PNG so
  // Discord shows every (aspect ratio, language) at-a-glance per variation
  // before posts fire. Failures are fail-soft: a missing atlas just means
  // the embed falls back to the 1:1 hero. Skipped entirely on failed
  // variations or when AUTO_MODE_DISABLE_ATLAS=1 (escape hatch for tests
  // that don't want sharp pulled in).
  let atlasUrl: string | undefined;
  let atlasAssetId: string | undefined;
  if (
    !effectiveError &&
    heroImageUrl &&
    process.env.AUTO_MODE_DISABLE_ATLAS !== '1'
  ) {
    try {
      // Build perFormatCrops from the mask-aware formatCrops produced by
      // postHero so the atlas tiles use the same crop rectangles the
      // canvas does (subjects survive every aspect, no center-crop).
      const perFormatCrops: Partial<
        Record<
          '1x1' | '4x5' | '9x16' | '16x9',
          { topLeft: { x: number; y: number }; bottomRight: { x: number; y: number } }
        >
      > = {};
      for (const fc of postHero.formatCrops ?? []) {
        const id = fc.formatId as '1x1' | '4x5' | '9x16' | '16x9';
        if (id === '1x1' || id === '4x5' || id === '9x16' || id === '16x9') {
          perFormatCrops[id] = fc.crop;
        }
      }
      const atlas = await composeAndUploadAtlas({
        heroSource: rawHeroImageUrl ?? heroImageUrl,
        textOverlays: postHero.textOverlays,
        captionsByLocale: envelope.captionsByLocale,
        nativePerFormatBytes,
        perFormatCrops,
      });
      if (atlas) {
        atlasUrl = atlas.publicUrl;
        atlasAssetId = atlas.assetId;
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(
        `[auto-mode] atlas compose failed for variation ${input.promptInput.index}:`,
        err instanceof Error ? err.message : String(err)
      );
    }
  }

  return {
    index: input.promptInput.index,
    status: effectiveError ? 'failed' : 'ready',
    heroImageUrl,
    heroAssetId,
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
    atlasUrl,
    atlasAssetId,
    nativePerFormatRendered,
    nativePerFormatErrors,
    nativePerFormatUrls,
    agentSteps: agentStepsForVariation,
    agentFinalText,
    error: effectiveError,
  };
}

/**
 * Fetch the hero PNG bytes (data URL or remote), compose the 4×4 atlas
 * with the per-locale text overlays, and upload to Convex storage.
 * Returns null when Convex isn't configured or the upload itself failed —
 * the caller treats that as "atlas unavailable" and the lap continues.
 */
/**
 * Exported so /api/auto-mode/post-now can re-render the atlas from the
 * latest Convex `textOverlays` rows at post time — keeps the published
 * preview thumbnail in sync with creator text edits made after the lap
 * completed. The lap-time caller (runAutoMode) doesn't need that since
 * the atlas is built once from fresh planner output.
 */
export async function composeAndUploadAtlas(input: {
  heroSource: string;
  textOverlays?: ProposedTextOverlay[];
  captionsByLocale?: Partial<Record<LocaleCode, string>>;
  nativePerFormatBytes?: Partial<
    Record<'1x1' | '4x5' | '9x16' | '16x9', Buffer>
  >;
  /** Mask-aware crop rectangles per format (cropHeroToFormats output). */
  perFormatCrops?: Partial<
    Record<
      '1x1' | '4x5' | '9x16' | '16x9',
      { topLeft: { x: number; y: number }; bottomRight: { x: number; y: number } }
    >
  >;
}): Promise<{ publicUrl: string; assetId: string } | null> {
  const heroBytes = await fetchHeroBytes(input.heroSource);
  if (!heroBytes) return null;
  const composed = await composeVariantSet({
    heroBytes,
    textOverlays: input.textOverlays,
    fallbackCaptions: input.captionsByLocale,
    nativePerFormatBytes: input.nativePerFormatBytes,
    perFormatCrops: input.perFormatCrops,
  });
  const uploaded = await uploadAssetToConvex({
    source: composed.atlas,
    kind: 'other',
    mime: 'image/png',
    sourceUrl: 'auto-mode variant atlas (4 formats × 4 SG locales)',
    width: composed.atlasWidth,
    height: composed.atlasHeight,
  });
  if (!uploaded) return null;
  return { publicUrl: uploaded.publicUrl, assetId: uploaded.id };
}

/**
 * Recover the prompt the agent passed to its 1:1 generate_image tool call.
 * Used when re-rendering at non-1:1 aspects so the new renders share the
 * agent's framing/composition language rather than diverging.
 */
function extractHeroPrompt(steps: MultiAgentToolStep[]): string | undefined {
  for (const step of steps) {
    if (step.name !== 'generate_image' || !step.ok) continue;
    const i = step.input as { prompt?: unknown } | undefined;
    if (typeof i?.prompt === 'string' && i.prompt.length > 0) {
      return i.prompt;
    }
  }
  return undefined;
}

async function fetchHeroBytes(source: string): Promise<Buffer | null> {
  if (source.startsWith('data:')) {
    const commaIdx = source.indexOf(',');
    if (commaIdx <= 5) return null;
    try {
      return Buffer.from(source.slice(commaIdx + 1), 'base64');
    } catch {
      return null;
    }
  }
  try {
    const res = await fetch(source);
    if (!res.ok) return null;
    const arr = await res.arrayBuffer();
    return Buffer.from(arr);
  } catch {
    return null;
  }
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
/**
 * Resolve the list of platforms a variation should publish to.
 *
 * Two modes:
 *   1. AUTO_MODE_PLATFORMS env set → comma-separated list, fan-out mode.
 *      Filter to PUBLISH_PLATFORMS validated entries. Used for "post one
 *      variation simultaneously to X + IG + LinkedIn" behaviour.
 *   2. Env unset → fall back to the agent's chosen `schedulePlatform`.
 *      Single-platform behaviour as before — preserves backwards compat
 *      for cached campaigns and any flow that hasn't migrated to fan-out.
 */
export function resolvePlatformsForVariation(
  variation: AutoModeVariationResult
): PublishPlatform[] {
  const envList = process.env.AUTO_MODE_PLATFORMS?.trim();
  if (envList && envList.length > 0) {
    return envList
      .split(',')
      .map((p) => p.trim().toLowerCase())
      .filter((p): p is PublishPlatform =>
        PUBLISH_PLATFORMS.includes(p as PublishPlatform)
      );
  }
  // Backwards-compat path: agent picked one platform.
  if (
    variation.schedulePlatform &&
    PUBLISH_PLATFORMS.includes(
      variation.schedulePlatform as PublishPlatform
    )
  ) {
    return [variation.schedulePlatform as PublishPlatform];
  }
  return [];
}

/**
 * Pick the best hero image URL for a given platform's preferred aspect.
 * Falls through native-per-format → heroImageUrl when the preferred
 * aspect isn't available. Avoids forcing IG to post a 16:9 banner when
 * it has a 4:5 native render in hand.
 */
export function pickHeroForPlatform(
  variation: AutoModeVariationResult,
  platform: PublishPlatform
): string | undefined {
  const npfu = variation.nativePerFormatUrls ?? {};
  const fallback = variation.heroImageUrl;
  switch (platform) {
    case 'instagram':
      return npfu['4x5'] ?? npfu['1x1'] ?? fallback;
    case 'linkedin':
      return npfu['16x9'] ?? npfu['1x1'] ?? fallback;
    case 'x':
      return npfu['16x9'] ?? npfu['1x1'] ?? fallback;
    case 'tiktok':
    case 'youtube-shorts':
      return npfu['9x16'] ?? npfu['1x1'] ?? fallback;
    default:
      return npfu['1x1'] ?? fallback;
  }
}

export async function scheduleVariationPosts(input: {
  variations: AutoModeVariationResult[];
  workspaceId?: string;
  baseUrl: string;
  /** When true, override scheduledAt to (now + 30s). Required for
   *  immediate-fire on adapters that reject true future scheduling
   *  (X / IG / TikTok direct). */
  forcePostNow?: boolean;
  /** Campaign id for Discord ping idempotency. `null` when running in
   *  local-only mode (no Convex) — those laps don't dedupe. */
  campaignId?: string | null;
}): Promise<string[]> {
  const ids: string[] = [];
  if (!input.workspaceId) return ids;

  for (const variation of input.variations) {
    if (variation.status !== 'ready') continue;
    if (!variation.heroImageUrl) continue;
    if (!variation.scheduleWhenLocal) continue;

    // Fan-out (2026-04-27): publish a single variation to ALL platforms
    // listed in AUTO_MODE_PLATFORMS instead of just the agent's chosen
    // one. Each platform gets its format-appropriate hero (IG → 4:5,
    // LinkedIn → 16:9, X → 16:9, TT → 9:16). Set
    // AUTO_MODE_PLATFORMS=instagram,linkedin,x to enable.
    const targetPlatforms = resolvePlatformsForVariation(variation);
    if (targetPlatforms.length === 0) continue;

    for (const platform of targetPlatforms) {
      const hero = pickHeroForPlatform(variation, platform);
      if (!hero) continue;

      // forcePostNow overrides the agent's whenLocal so X/IG/TT direct
      // adapters don't reject for being too far in the future. Stagger
      // platforms by 5s each so we don't fire 3 simultaneous publishes.
      const platformOffset = targetPlatforms.indexOf(platform) * 5_000;
      const scheduledAt = input.forcePostNow
        ? new Date(Date.now() + 30_000 + platformOffset).toISOString()
        : normalizeScheduledAt(variation.scheduleWhenLocal);
      if (!scheduledAt) continue;

      const post: ScheduledPost = {
        id: '',
        platform,
        mediaUrls: [hero],
        caption: variation.caption ?? '',
        hashtags: variation.hashtags ?? [],
        scheduledAt,
      };

    // Per-post resolution so X posts route to X, IG posts to IG, TT to
    // postiz/social-auto-upload, with preview as the always-available
    // fallback. The previous "preview-only" wiring meant we never hit a
    // real adapter even when X creds were present.
    let publisher;
    try {
      publisher = resolvePublisherForPost({
        workspaceId: input.workspaceId,
        baseUrl: input.baseUrl,
        post,
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(
        `[auto-mode] scheduleVariationPosts: no publisher for ${platform}:`,
        err instanceof Error ? err.message : String(err)
      );
      continue;
    }

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

      // Per-publish Discord ping with the live link so Ernie sees the
      // post URL the moment it goes live, instead of digging through
      // /inspect or the platform's app. Skips preview/postiz which
      // don't return a clickable platform url.
      const isReal =
        publisher.id !== 'preview' && publisher.id !== 'postiz';
      if (isReal) {
        await notifyDiscord({
          campaignId: input.campaignId ?? undefined,
          // Variation index in the tag so each (campaign, platform, variation)
          // dedupes independently — multiple variations posting to the same
          // platform must all fire.
          tag: `publish-${platform}-v${variation.index}`,
          content: [
            `🟢 Posted to ${platform.toUpperCase()} — v${variation.index}`,
            `link: ${result.previewUrl ?? '(no preview url)'}`,
            result.externalId ? `id: ${result.externalId}` : '',
            variation.caption
              ? `caption: ${variation.caption.slice(0, 120)}${variation.caption.length > 120 ? '…' : ''}`
              : '',
          ]
            .filter(Boolean)
            .join('\n'),
        });
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(
        `[auto-mode] scheduleVariationPosts: variation ${variation.index} (${platform}) failed:`,
        err instanceof Error ? err.message : String(err)
      );
      // Notify on failure too — Ernie wants to see when something
      // didn't publish so he can act, not just when it did.
      await notifyDiscord({
        campaignId: input.campaignId ?? undefined,
        tag: `publish-fail-${platform}-v${variation.index}`,
        content: [
          `🔴 Publish to ${platform.toUpperCase()} failed — v${variation.index}`,
          `error: ${err instanceof Error ? err.message.slice(0, 200) : String(err).slice(0, 200)}`,
        ].join('\n'),
      });
    }
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
    heroAssetId: variation.heroAssetId,
    caption: variation.caption,
    captionsByLocale: variation.captionsByLocale,
    hashtags: variation.hashtags,
    moodNote: variation.moodNote,
    schedulePlatform: variation.schedulePlatform,
    scheduleWhenLocal: variation.scheduleWhenLocal,
    formatCrops: variation.formatCrops,
    masksOneShot: variation.masksOneShot,
    masksVisionGuided: variation.masksVisionGuided,
    nativePerFormatUrls: variation.nativePerFormatUrls,
    atlasUrl: variation.atlasUrl,
    atlasAssetId: variation.atlasAssetId,
    textOverlays: variation.textOverlays,
    nativePerFormatRendered: variation.nativePerFormatRendered,
    textOverlayWarnings: variation.textOverlayWarnings,
    agentRunIds,
    error: variation.error,
  });
}

/** Discord embed accent colours (decimal). */
const EMBED_COLOR_GREEN = 0x57f287; // ready
const EMBED_COLOR_YELLOW = 0xfee75c; // review / pending
const EMBED_COLOR_RED = 0xed4245; // failed

/**
 * Build the action-row link buttons that go on the lap-end Discord
 * message. Approve/Reject pairs per ready variation in review mode;
 * Cancel buttons in auto-post mode; a "Review in Aether ↗" link in
 * every mode so the click can land on the inspect page when the user
 * wants more context. Skipped when there's nothing to act on (no ready
 * variations OR campaignId missing — the endpoints both look up the
 * campaign by id, so a local-only lap can't expose useful buttons).
 */
function buildLapEndActionRows(input: {
  campaignId: string | null;
  variations: AutoModeVariationResult[];
  notifyMode: AutoModeNotifyMode;
  baseUrl: string;
}): DiscordActionRow[] {
  const { campaignId, variations, notifyMode, baseUrl } = input;
  if (!campaignId) return [];
  const origin = baseUrl.replace(/\/+$/, '');
  const ready = variations.filter((v) => v.status === 'ready');
  if (ready.length === 0) return [];

  const rows: DiscordActionRow[] = [];

  if (notifyMode === 'review' || notifyMode === 'notify') {
    // Approve/Reject pair per ready variation. Discord caps each row at 5
    // buttons; with up to 4 variations × 2 buttons = 8 we may spill into a
    // second row.
    for (let i = 0; i < ready.length; i += 2) {
      const slice = ready.slice(i, i + 2);
      const components = slice.flatMap((v) => [
        {
          type: 2 as const,
          style: 5 as const,
          label: `Approve v${v.index}`,
          // /post-now skips the lap-rerun that /approve→/run used to do —
          // loads the existing variation from Convex and calls
          // scheduleVariationPosts directly.
          url: `${origin}/api/auto-mode/post-now?c=${encodeURIComponent(campaignId)}&v=${v.index}`,
          emoji: { name: '✅' },
        },
        {
          type: 2 as const,
          style: 5 as const,
          label: `Reject v${v.index}`,
          url: `${origin}/api/auto-mode/reject?c=${encodeURIComponent(campaignId)}&v=${v.index}`,
          emoji: { name: '✖️' },
        },
      ]);
      if (components.length > 0) rows.push({ type: 1, components });
    }
  }

  // "Review in Aether ↗" — opens the inspect page so the user can scrub
  // the full lap timeline + atlas thumbnails before deciding. Always
  // appended on its own row so the approve buttons stay above the fold.
  rows.push({
    type: 1,
    components: [
      {
        type: 2,
        style: 5,
        label: 'Review in Aether ↗',
        url: `${origin}/inspect/${encodeURIComponent(campaignId)}`,
      },
    ],
  });

  return rows.slice(0, 5);
}

/**
 * Build a single Discord embed for one variation at lap-end. Includes:
 *   - Inline hero image (skipped for data: URLs — Discord can't fetch them)
 *   - Title: en-SG caption (truncated to 60 chars) or moodNote fallback
 *   - Description: full caption
 *   - Fields: Platform, Scheduled, Locales populated, Provider, Asset id
 *   - Footer: campaign + variation index
 *   - Deep-link URL when baseUrl is provided (page doesn't exist yet —
 *     the URL is a handoff for the scheduled-post detail page)
 *   - Color: green=ready, yellow=review/pending, red=failed
 *
 * @param variation   The variation result from runOneVariation.
 * @param campaignId  Convex campaign id (may be null in local-only mode).
 * @param baseUrl     App origin — used for the deep-link URL.
 * @param scheduledPostId  The scheduled post row id when auto-post mode ran.
 * @param notifyMode  'notify' | 'review' | 'auto-post' — controls color.
 */
function buildVariationEmbed(input: {
  variation: AutoModeVariationResult;
  campaignId: string | null;
  baseUrl: string;
  scheduledPostId?: string;
  notifyMode: AutoModeNotifyMode;
}): DiscordEmbed {
  const { variation, campaignId, baseUrl, scheduledPostId, notifyMode } = input;

  const isReady = variation.status === 'ready';
  const color = isReady
    ? notifyMode === 'review'
      ? EMBED_COLOR_YELLOW
      : EMBED_COLOR_GREEN
    : EMBED_COLOR_RED;

  // Title: en-SG caption first 60 chars, else moodNote, else fallback.
  const enCaption =
    variation.captionsByLocale?.['en-SG'] ?? variation.caption;
  const title = enCaption
    ? enCaption.slice(0, 60)
    : variation.moodNote
      ? variation.moodNote.slice(0, 60)
      : `Variation ${variation.index}`;

  // Embed image: prefer the variant atlas (4 formats × 4 SG locales) so
  // Ernie can review every aspect ratio and language at-a-glance before
  // posts fire. Falls back to the 1:1 hero when atlas is unavailable
  // (compose failure, no Convex storage). Skip data URLs either way —
  // Discord can't fetch them inline.
  const heroUrl = variation.heroImageUrl;
  const embedImageUrl = variation.atlasUrl ?? heroUrl;
  const hasPublicEmbedImage =
    embedImageUrl && !embedImageUrl.startsWith('data:');

  // Locale presence pill string.
  const locales: string[] = [];
  if (variation.captionsByLocale?.['en-SG']) locales.push('🇸🇬 EN ✓');
  if (variation.captionsByLocale?.['zh-Hans-SG']) locales.push('🇨🇳 ZH ✓');
  if (variation.captionsByLocale?.['ms-SG']) locales.push('🇲🇾 MS ✓');
  if (variation.captionsByLocale?.['ta-SG']) locales.push('🇮🇳 TA ✓');
  const localeStr = locales.length > 0 ? locales.join('  ') : '—';

  // Platform & schedule.
  const platform = variation.schedulePlatform ?? '—';
  const schedTime = variation.scheduleWhenLocal
    ? formatSgTime(variation.scheduleWhenLocal)
    : '—';

  // Asset id.
  const assetId = variation.heroAssetId ?? (heroUrl ? 'inline data URL' : '—');

  // Build fields.
  const fields: DiscordEmbed['fields'] = [
    { name: 'Platform', value: platform, inline: true },
    { name: 'Scheduled', value: schedTime, inline: true },
    { name: 'Locales', value: localeStr, inline: false },
  ];
  if (scheduledPostId) {
    fields.push({ name: 'Provider', value: 'preview', inline: true });
  }
  fields.push({ name: 'Asset', value: assetId, inline: true });

  // Deep link — the scheduled post detail page (handoff: doesn't exist yet).
  const deepLink = scheduledPostId
    ? `${baseUrl.replace(/\/+$/, '')}/scheduled/${scheduledPostId}`
    : undefined;

  const embed: DiscordEmbed = {
    title,
    description: enCaption ?? variation.moodNote ?? undefined,
    color,
    fields,
    footer: {
      text: `campaign ${campaignId ?? 'local-only'} · variation v${variation.index}`,
    },
    timestamp: new Date().toISOString(),
  };
  if (deepLink) embed.url = deepLink;
  if (hasPublicEmbedImage) embed.image = { url: embedImageUrl };

  return embed;
}

/**
 * Build a brand-context string for vision-describe from URL ingestion.
 * Title + description usually carry the brand name and product line
 * already; products[] adds canonical product names when JSON-LD was
 * present. Empty string when no ingestion happened (text trigger).
 *
 * Wired into describeImage so the model labels products with their
 * canonical names rather than guessing by silhouette. Closes the
 * "Pod Hub mis-labelled as air purifier" gap.
 */
/**
 * Best-effort BrandGuardrails derivation from a URL ingestion. The signoff
 * Managed Agent uses this as its evaluation context. We seed brand names
 * from page title + Schema.org Product brand fields; forbidden topics and
 * required elements stay empty by default (creators can override per-
 * workspace once the brand-context store is plumbed end-to-end).
 */
function buildGuardrailsFromIngestion(
  ingestion: UrlIngestion | undefined
): BrandGuardrails {
  const brandNames: string[] = [];
  if (ingestion?.title) brandNames.push(ingestion.title);
  for (const p of ingestion?.products ?? []) {
    if (p.brand && !brandNames.includes(p.brand)) brandNames.push(p.brand);
  }
  return {
    brandNames,
    forbiddenTopics: [],
    requiredElements: [],
    maxCaptionLength: undefined,
  };
}

export function buildBrandContextFromIngestion(
  ingestion: UrlIngestion | undefined
): string | undefined {
  if (!ingestion) return undefined;
  const lines: string[] = [];
  if (ingestion.title) lines.push(`Page title: ${ingestion.title}`);
  if (ingestion.description) lines.push(`Page summary: ${ingestion.description}`);
  if (ingestion.products.length > 0) {
    lines.push('Products mentioned on the page:');
    for (const p of ingestion.products.slice(0, 8)) {
      const desc = p.description ? ` — ${p.description.slice(0, 120)}` : '';
      lines.push(`  - ${p.name}${desc}`);
    }
  }
  if (lines.length === 0) return undefined;
  return lines.join('\n');
}

/**
 * Format an ISO-8601 timestamp as a human-readable SG (UTC+8) string.
 * e.g. "2026-04-27T19:00:00+08:00" → "Mon 27 Apr 2026, 7:00 PM SGT"
 * Fails gracefully to the raw string when parsing fails.
 */
function formatSgTime(isoString: string): string {
  try {
    const d = new Date(isoString);
    if (Number.isNaN(d.getTime())) return isoString;
    return d.toLocaleString('en-SG', {
      timeZone: 'Asia/Singapore',
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }) + ' SGT';
  } catch {
    return isoString;
  }
}

export async function runAutoMode(req: AutoModeRequest): Promise<AutoModeResult> {
  const concurrency: AutoModeConcurrency = req.concurrency ?? 'sequential';

  // Env override (2026-04-27): AUTO_MODE_USE_MANAGED_AGENTS=0 forces the
  // research / cluster / signoff agents to skip the Anthropic Managed
  // Agents API and run on plain messages.create. Useful when managed
  // agents are flaky, when running a fully-local stack, or for the
  // "compare standard vs managed" demo toggle. Off-by-default (true) so
  // existing config still flows through.
  if (process.env.AUTO_MODE_USE_MANAGED_AGENTS === '0') {
    req = { ...req, useManagedAgents: false };
  }

  // URL-only ref summary persisted on the campaign row so /inspect can
  // confirm what visual identity anchors flowed into the lap. Strip
  // dataUrl payloads (often multi-MB base64) and replace with a stable
  // placeholder so the row stays small + reproducible. The `hint` is
  // surfaced to the agent + carries through.
  const refSummary: Array<{ url?: string; hint?: string }> | undefined = (
    req.referenceImages ?? (req.referenceImage ? [req.referenceImage] : [])
  )
    .map((r) => ({
      url: r.url ?? (r.dataUrl ? '(data url)' : undefined),
      hint: r.hint,
    }))
    .filter((r) => r.url || r.hint);

  const campaignId = await startCampaign({
    workspaceId: req.workspaceId,
    triggerKind: req.trigger.kind,
    triggerPayload: req.trigger.payload,
    variationCount: req.variationCount,
    notifyMode: req.notifyMode,
    referenceImages: refSummary && refSummary.length > 0 ? refSummary : undefined,
  });

  logLapEvent({
    campaignId,
    tag: 'lap.start',
    message: `lap kickoff · ${req.trigger.kind} · ${req.variationCount} variations · ${req.notifyMode}`,
    data: {
      triggerKind: req.trigger.kind,
      variationCount: req.variationCount,
      notifyMode: req.notifyMode,
      concurrency,
      workspaceId: req.workspaceId ?? null,
    },
  });

  // Trace log: input refs at the boundary so we can prove what was
  // supplied to runAutoMode without digging through downstream openai/
  // edits POSTs. URLs / data-URL signatures only — no full base64.
  const inboundRefs = req.referenceImages ?? [];
  // eslint-disable-next-line no-console
  console.log(
    `[lap-trace] cid=${campaignId} input-refs=${inboundRefs.length} payload=${
      JSON.stringify(req.trigger.payload).slice(0, 120)
    }`
  );
  inboundRefs.forEach((r, i) => {
    const isData = typeof r.dataUrl === 'string' && r.dataUrl.startsWith('data:');
    const isUrl = typeof r.url === 'string' && !!r.url;
    let sig = '(empty)';
    if (isData) {
      sig = `DATA ${Math.round((r.dataUrl as string).length / 1024)}KB b64`;
    } else if (isUrl) {
      sig = `URL ${(r.url as string).slice(0, 100)}`;
    }
    // eslint-disable-next-line no-console
    console.log(`[lap-trace] cid=${campaignId}   ref[${i}] ${sig}${r.hint ? ` hint="${r.hint}"` : ''}`);
  });

  // ─── Multimodal trigger ingestion ──────────────────────────────────────
  // Run once per lap so all variations share the same enriched context.
  // Fail-soft per source: a network/parse error degrades to plain
  // trigger-as-string with a warning, lap continues.
  //   - URL: fetch the page, extract title/description/products/images
  //   - File (PDF): extract text + page metadata
  //   - File (image, future): treated as reference image
  //   - Text: no ingestion needed
  let urlIngestion: UrlIngestion | undefined;
  let pdfIngestion: PdfIngestion | undefined;
  if (req.trigger.kind === 'url') {
    try {
      urlIngestion = await fetchUrlIngestion(req.trigger.payload);
      if (urlIngestion) {
        logLapEvent({
          campaignId,
          tag: 'ingest.url.ok',
          message: `ingested ${urlIngestion.title || req.trigger.payload}`,
          data: {
            title: urlIngestion.title,
            description: urlIngestion.description?.slice(0, 80),
            productCount: urlIngestion.products.length,
            imageCount: urlIngestion.images.length,
            primaryImage: urlIngestion.primaryImage?.url,
            rawHtmlBytes: urlIngestion.rawHtmlBytes,
          },
        });
        // Persist the ingestion bundle to the campaign row so /inspect
        // and /runs can show what was actually scraped from the URL.
        // Strip rawHtml to keep the payload size sane.
        if (campaignId) {
          await setCampaignUrlIngestion(campaignId, {
            url: urlIngestion.url,
            title: urlIngestion.title,
            description: urlIngestion.description,
            primaryImage: urlIngestion.primaryImage,
            images: urlIngestion.images,
            products: urlIngestion.products,
            rawHtmlBytes: urlIngestion.rawHtmlBytes,
          });
        }
      }
    } catch (err) {
      logLapEvent({
        campaignId,
        level: 'warn',
        tag: 'ingest.url.fail',
        message: `url ingestion failed: ${err instanceof Error ? err.message : String(err)}`,
        data: { url: req.trigger.payload },
      });
    }

    // ── Brand + product enrichment ────────────────────────────────────
    // When Schema.org Product JSON-LD is absent (the eightsleep case —
    // products[] is []), parse the og:title pattern locally for an
    // immediate brand/product hint, then enrich via SerpAPI Google Search
    // when SERPAPI_KEY is configured. Synthesize a single IngestedProduct
    // and prepend so buildBrandContextFromIngestion / vision-describe /
    // the variation prompt all see specific names rather than the
    // generic page title. Fail-soft: every step reverts to the previous
    // state on error so the lap continues unchanged.
    if (urlIngestion && urlIngestion.products.length === 0) {
      const parsed = parseBrandProduct(urlIngestion);
      logLapEvent({
        campaignId,
        tag: 'brand-parse.parsed',
        message: `${parsed.brand} · ${parsed.product} (${parsed.confidence})`,
        data: {
          brand: parsed.brand,
          product: parsed.product,
          confidence: parsed.confidence,
          source: parsed.source,
        },
      });
      let serpProduct: Awaited<ReturnType<typeof searchProductOnSerp>> = null;
      let serpExtraImages: string[] = [];
      try {
        const query = `${parsed.brand} ${parsed.product}`.slice(0, 200);
        serpProduct = await searchProductOnSerp(query);
        if (serpProduct) {
          logLapEvent({
            campaignId,
            tag: 'serp.enriched',
            message: `${serpProduct.brand} · ${serpProduct.product} (${serpProduct.source})`,
            data: {
              brand: serpProduct.brand,
              product: serpProduct.product,
              source: serpProduct.source,
              imageCount: serpProduct.imageUrls.length,
              officialUrl: serpProduct.officialUrl,
            },
          });
        } else {
          logLapEvent({
            campaignId,
            level: 'debug',
            tag: 'serp.skipped',
            message: 'serp returned no product enrichment',
          });
        }
        // Pull a few extra image candidates from Google Images when the
        // og:image was generic — they augment vision-describe references.
        // Only fire when we have low-medium confidence on local parse and
        // the og:image landscape is small.
        if (
          (parsed.confidence !== 'high' || urlIngestion.images.length < 3) &&
          process.env.SERPAPI_KEY
        ) {
          serpExtraImages = await searchProductImagesOnSerp(
            `${parsed.brand} ${parsed.product}`,
            5
          );
          if (serpExtraImages.length > 0) {
            logLapEvent({
              campaignId,
              tag: 'serp.images',
              message: `${serpExtraImages.length} extra reference images`,
              data: { count: serpExtraImages.length },
            });
          }
        }
      } catch (err) {
        logLapEvent({
          campaignId,
          level: 'warn',
          tag: 'serp.failed',
          message: `serp enrichment failed: ${err instanceof Error ? err.message : String(err)}`,
        });
      }

      const finalBrand = serpProduct?.brand ?? parsed.brand;
      const finalProduct = serpProduct?.product ?? parsed.product;
      const finalDescription =
        serpProduct?.description ?? urlIngestion.description ?? '';
      urlIngestion = {
        ...urlIngestion,
        products: [
          {
            name: finalProduct,
            brand: finalBrand,
            description: finalDescription || undefined,
            schemaType: serpProduct?.source ?? 'parsed',
          },
          ...urlIngestion.products,
        ],
        images: [
          ...urlIngestion.images,
          ...serpExtraImages.map((url) => ({
            url,
            source: 'json-ld' as const,
          })),
        ],
      };
    }
  } else if (req.trigger.kind === 'file' && isPdfPayload(req.trigger.payload)) {
    try {
      pdfIngestion = await fetchPdfIngestion(req.trigger.payload);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(
        `[auto-mode] pdf ingestion failed for ${req.trigger.payload.slice(0, 80)}:`,
        err instanceof Error ? err.message : String(err)
      );
    }
  }

  // ─── Vision-describe top references ──────────────────────────────────
  // Before the lap fans out, run Claude 4.7 vision on the top N reference
  // images so the hero prompt has concrete product / brand / face facts
  // to riff off — fixes the "didn't find the Pod" gap where Schema.org
  // Product extraction was empty for eightsleep and the hero rendered as
  // a generic bedroom. Cost: ~$0.005-0.01 per ref. Budget cap of 2.
  // Fail-soft: any reject leaves the slot undefined and the lap continues.
  // (placed BELOW effectiveReferenceImages resolution — moved into a helper)

  // ─── B1 fix: convert primary ingested image URL to data URL ─────────────
  // Root cause of the "air-purifier tower" 1×1 bug: the OpenAI Images Edits
  // API (gpt-image-2) only activates when refs are base64 data URLs. URL-
  // based refs from urlIngestion.images are passed verbatim to the provider
  // which silently drops them (isBase64DataUrl returns false) and falls back
  // to text-only generation — so the 1×1 gets no product-photo anchor.
  //
  // Fix: when URL ingestion found a primary image and the caller didn't
  // supply explicit refs, eagerly fetch the primary image URL and encode
  // it as a base64 data URL so the Edits API gets invoked and anchors the
  // hero render on the ACTUAL product photo. Fail-soft: on any network or
  // decode error we fall back to URL-based refs (same behaviour as before).
  //
  // This is the single highest-leverage fix for the 1×1 atlas cell showing
  // an air-purifier-shaped tower instead of the Eight Sleep Pod 4 Ultra.
  let primaryImageDataUrl: string | undefined;
  if (
    !req.referenceImages?.length &&
    !req.referenceImage &&
    urlIngestion?.primaryImage?.url &&
    !urlIngestion.primaryImage.url.startsWith('data:')
  ) {
    try {
      const res = await fetch(urlIngestion.primaryImage.url);
      if (res.ok) {
        const mime = res.headers.get('content-type') ?? 'image/jpeg';
        const buf = Buffer.from(await res.arrayBuffer());
        primaryImageDataUrl = `data:${mime.split(';')[0]};base64,${buf.toString('base64')}`;
        console.log(
          `[auto-mode] fetched primary image as data URL (${buf.length} bytes) — Edits API will anchor on actual product photo`
        );
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(
        `[auto-mode] failed to fetch primary image as data URL (falling back to URL-based ref):`,
        err instanceof Error ? err.message : String(err)
      );
    }
  }

  // Resolve effective reference images:
  //   1. req.referenceImages (plural, explicit) wins
  //   2. req.referenceImage (legacy singular) wraps to a 1-item array
  //   3. URL ingestion's images: primary first (as data URL when possible,
  //      for Images Edits API anchoring), then top 2 body images as URL refs
  //      (for the vision-describe context step that doesn't need data URLs).
  //   4. Image-file trigger: the payload itself becomes the reference
  let effectiveReferenceImages: AutoModeReferenceImage[] = (() => {
    if (req.referenceImages && req.referenceImages.length > 0) {
      return req.referenceImages;
    }
    if (req.referenceImage) {
      return [req.referenceImage];
    }
    if (urlIngestion?.images && urlIngestion.images.length > 0) {
      const ingestedHint =
        urlIngestion.title || urlIngestion.description || undefined;
      // Primary image: use data URL when we successfully fetched it (enables
      // Edits API); fall back to URL-based ref (vision-describe still works).
      const primaryRef: AutoModeReferenceImage = primaryImageDataUrl
        ? { dataUrl: primaryImageDataUrl, hint: ingestedHint }
        : { url: urlIngestion.images[0].url, hint: ingestedHint };
      // Remaining body images: URL refs (cheaper, vision-describe compatible).
      const bodyRefs = urlIngestion.images.slice(1, 3).map((img) => ({
        url: img.url,
        hint: ingestedHint,
      }));
      return [primaryRef, ...bodyRefs];
    }
    if (
      req.trigger.kind === 'file' &&
      isImagePayload(req.trigger.payload)
    ) {
      const isData = req.trigger.payload.startsWith('data:');
      return [
        {
          ...(isData
            ? { dataUrl: req.trigger.payload }
            : { url: req.trigger.payload }),
          hint: 'creator-uploaded reference image',
        },
      ];
    }
    return [];
  })();

  // Ingest brand refs to durable storage so we don't trust upstream URLs
  // that 404 mid-lap (Eight Sleep / IKEA / Apple all rotate CDN URLs
  // aggressively), AND so data-URL refs (drag-drop / fire-debut-lap) get
  // a public Convex URL — without it, downstream cluster + describe-image
  // agents (which filter `r.url.startsWith('data:')`) silently SKIP every
  // drag-drop ref and the lap runs blind. Fail-soft per ref: if a fetch
  // / decode / upload fails, we KEEP the original ref shape so OpenAI's
  // adapter can still attach the bytes via its own data-URL → blob path.
  const stagedReferenceImages = (
    await Promise.all(
      effectiveReferenceImages.map(async (ref) => {
        // Data URL → decode + upload to Convex so cluster / describe see
        // a real https URL. Keep the dataUrl on the returned ref as a
        // fallback (the openai adapter prefers url when present, but
        // data-URL fallbacks remain durable if Convex is offline).
        if (ref.dataUrl) {
          try {
            const uploaded = await uploadAssetToConvex({
              source: ref.dataUrl,
              kind: 'reference',
              campaignId: campaignId ?? undefined,
              wsId: req.workspaceId,
              sourceUrl: 'inline data URL',
            });
            if (uploaded) {
              return { ...ref, url: uploaded.publicUrl };
            }
          } catch (err) {
            // eslint-disable-next-line no-console
            console.warn(
              '[auto-mode/ingest] data-URL ref upload failed, falling back to inline:',
              err instanceof Error ? err.message : String(err)
            );
          }
          return ref; // Keep the dataUrl so OpenAI can still see it.
        }
        if (!ref.url || ref.url.startsWith('data:')) return ref;
        try {
          const fetched = await fetch(ref.url);
          if (!fetched.ok) {
            // eslint-disable-next-line no-console
            console.warn(
              `[auto-mode/ingest] ref ${ref.url} → HTTP ${fetched.status}, dropping`
            );
            return null;
          }
          const buf = Buffer.from(await fetched.arrayBuffer());
          const mime = fetched.headers.get('content-type') ?? 'image/png';
          const uploaded = await uploadAssetToConvex({
            source: buf,
            mime,
            kind: 'reference',
            campaignId: campaignId ?? undefined,
            wsId: req.workspaceId,
            sourceUrl: ref.url,
          });
          if (!uploaded) {
            // Convex not provisioned — keep the original URL and let the
            // OpenAI adapter's fail-soft fetch take over downstream.
            return ref;
          }
          return { ...ref, url: uploaded.publicUrl };
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn(
            `[auto-mode/ingest] ref ${ref.url} ingest failed, dropping:`,
            err instanceof Error ? err.message : String(err)
          );
          return null;
        }
      })
    )
  ).filter((r): r is AutoModeReferenceImage => r !== null);

  // Replace the in-scope refs with the staged copy so every downstream
  // consumer (cluster agent's URL filter, describe-image's URL filter,
  // runOneVariation's referenceImages plumb-through, lap-trace logging)
  // sees the Convex-hosted URL instead of the original data: blob.
  // This was a multi-week silent bug — see commit message.
  effectiveReferenceImages = stagedReferenceImages;

  // Vision-describe up to 2 top reference images so the hero gen knows
  // what's IN them (products, brands, faces, setting). This is the fix
  // for the "didn't find the Pod" gap — when URL Schema.org Product
  // extraction returns empty, vision fills the gap by looking at the
  // ref pixels directly. Skipped silently for refs that are data URLs
  // OR when ANTHROPIC_API_KEY is absent OR when the call rejects.
  //
  // BRAND CONTEXT (architectural fix from 2026-04-26 night): when URL
  // ingestion captured the page title + description, we pipe it into
  // every describeImage call so the model can label products by their
  // canonical names (e.g. "Pod 4 Ultra") rather than guessing from
  // silhouette ("air purifier"). This is the upstream fix Ernie called
  // out — vision-describe was running blind without source context.
  const brandContext = buildBrandContextFromIngestion(urlIngestion);
  let referenceDescriptions: ImageDescription[] | undefined;
  if (
    process.env.ANTHROPIC_API_KEY &&
    effectiveReferenceImages.length > 0
  ) {
    const describable = effectiveReferenceImages
      .filter((r) => r.url && !r.url.startsWith('data:'))
      .slice(0, 2);
    if (describable.length > 0) {
      const settled = await Promise.allSettled(
        describable.map((r) =>
          describeImage({ imageUrl: r.url as string, brandContext })
        )
      );
      const got: ImageDescription[] = [];
      for (const res of settled) {
        if (res.status === 'fulfilled' && res.value != null) got.push(res.value);
      }
      if (got.length > 0) referenceDescriptions = got;
    }
  }

  // ─── B2 Research Managed Agent ────────────────────────────────────────
  // Run once per lap (before variation fan-out) so all variations can cite
  // competitor signals, locale insights, and recent campaigns in their
  // headline/sub copy. Skipped when:
  //   - ANTHROPIC_API_KEY is absent (no LLM budget)
  //   - AUTO_MODE_SKIP_RESEARCH=1 (escape hatch for tests / tight runs)
  //   - trigger.kind is not 'url' (no brand URL to research)
  // Fail-soft: any error leaves researchBundle undefined and the lap
  // continues with text-only variation prompts (same as before this slice).
  let researchBundle: ResearchBundle | undefined;
  if (
    process.env.ANTHROPIC_API_KEY &&
    process.env.AUTO_MODE_SKIP_RESEARCH !== '1' &&
    req.trigger.kind === 'url' &&
    urlIngestion
  ) {
    try {
      logLapEvent({
        campaignId,
        tag: 'research.start',
        message: 'running research managed agent',
      });
      researchBundle = await runResearchAgent({
        brand: urlIngestion.title || req.trigger.payload,
        url: req.trigger.payload,
        ingestion: urlIngestion,
        workspaceId: req.workspaceId,
        useManagedAgents: req.useManagedAgents,
      });
      logLapEvent({
        campaignId,
        tag: 'research.ok',
        message: `${researchBundle.competitors.length} competitors · ${researchBundle.localeInsights.length} locales · ${researchBundle.sources.length} sources (${researchBundle.usedManagedAgentsApi ? 'managed-agents' : 'tool-use'})`,
        data: {
          competitorCount: researchBundle.competitors.length,
          localeInsightCount: researchBundle.localeInsights.length,
          sourceCount: researchBundle.sources.length,
          usedManagedAgentsApi: researchBundle.usedManagedAgentsApi,
          latencyMs: researchBundle.latencyMs,
        },
      });
      // Persist on the campaign row so /inspect and the right rail
      // surface research signals on page reload (replaces ephemeral
      // component-state holding in WorkspaceShell).
      if (campaignId) {
        await setCampaignResearchBundle(campaignId, researchBundle);
      }
    } catch (err) {
      logLapEvent({
        campaignId,
        level: 'warn',
        tag: 'research.fail',
        message: `research agent failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  // ─── Cluster Managed Agent ────────────────────────────────────────────
  // Group the lap's reference images by visual similarity. Used as
  // provenance + surfaced in /inspect so creators see "these references
  // form 3 distinct visual clusters". Skipped when:
  //   - ANTHROPIC_API_KEY is absent (no LLM budget)
  //   - There are <2 distinct refs to cluster (no signal)
  //   - AUTO_MODE_SKIP_CLUSTER=1 (escape hatch for tight runs)
  // Fail-soft: any error leaves clusterBundle undefined and the lap
  // continues unchanged.
  let clusterBundle: ClusterBundle | undefined;
  const clusterRefs = (() => {
    const urls = new Set<string>();
    for (const r of effectiveReferenceImages ?? []) {
      if (r.url && !r.url.startsWith('data:')) urls.add(r.url);
    }
    for (const i of urlIngestion?.images ?? []) {
      if (i.url) urls.add(i.url);
    }
    return Array.from(urls).slice(0, 12);
  })();
  if (
    process.env.ANTHROPIC_API_KEY &&
    process.env.AUTO_MODE_SKIP_CLUSTER !== '1' &&
    clusterRefs.length >= 2
  ) {
    try {
      logLapEvent({
        campaignId,
        tag: 'cluster.start',
        message: `clustering ${clusterRefs.length} reference images`,
        data: { refCount: clusterRefs.length },
      });
      clusterBundle = await runClusterAgent({
        refs: clusterRefs.map((url) => ({ url })),
        workspaceId: req.workspaceId,
        useManagedAgents: req.useManagedAgents,
      });
      logLapEvent({
        campaignId,
        tag: 'cluster.ok',
        message: `${clusterBundle.clusters.length} clusters · ${clusterBundle.unclustered.length} unclustered (${clusterBundle.usedManagedAgentsApi ? 'managed-agents' : 'messages.create'})`,
        data: {
          clusterCount: clusterBundle.clusters.length,
          unclusteredCount: clusterBundle.unclustered.length,
          usedManagedAgentsApi: clusterBundle.usedManagedAgentsApi,
          latencyMs: clusterBundle.latencyMs,
        },
      });
      if (campaignId) {
        await setCampaignClusterBundle(campaignId, clusterBundle);
      }
    } catch (err) {
      logLapEvent({
        campaignId,
        level: 'warn',
        tag: 'cluster.fail',
        message: `cluster agent failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  // ─── Lap-start ping (always, regardless of notifyMode) ────────────────
  // User wants visibility on kickoff so they know the lap is in flight.
  await notifyDiscord({
    campaignId: campaignId ?? undefined,
    tag: 'lap-start',
    content: [
      `▶︎ Auto Mode lap started`,
      `Trigger: ${req.trigger.kind} · ${req.trigger.payload.slice(0, 80)}`,
      `${req.variationCount} variations · ${concurrency} · ${req.notifyMode}${
        effectiveReferenceImages.length > 0
          ? ` · ${effectiveReferenceImages.length} ref${effectiveReferenceImages.length === 1 ? '' : 's'}`
          : ''
      }${urlIngestion ? ` · url-ingested: "${urlIngestion.title.slice(0, 60)}"` : ''}${
        pdfIngestion
          ? ` · pdf-ingested: "${(pdfIngestion.title || pdfIngestion.source.slice(0, 60))}" (${pdfIngestion.pageCount}p)`
          : ''
      }`,
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
          pdfIngestion,
          referenceDescriptions,
          researchBundle,
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
    // Trace log for parallel branch — sequential logs in its loop already.
    variations.forEach((v) => {
      const heroSig = !v.heroImageUrl
        ? '(no hero)'
        : v.heroImageUrl.startsWith('data:')
        ? `data:${v.heroImageUrl.slice(5, 25)}…`
        : v.heroImageUrl.slice(0, 100);
      // eslint-disable-next-line no-console
      console.log(
        `[lap-trace] cid=${campaignId} v${v.index} status=${v.status} hero=${heroSig} formats=${
          (v.nativePerFormatRendered ?? []).join(',') || 'none'
        }${v.error ? ` error="${v.error.slice(0, 120)}"` : ''}`
      );
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
          pdfIngestion,
          referenceDescriptions,
          researchBundle,
        },
        baseUrl: req.baseUrl,
        workspaceId: req.workspaceId,
        maxIterationsPerVariation: req.maxIterationsPerVariation,
        referenceImages: effectiveReferenceImages,
      });
      if (variation.moodNote) priorMoodNotes.push(variation.moodNote);
      variations.push(variation);
      // Trace log for sequential branch — symmetric with parallel.
      {
        const heroSig = !variation.heroImageUrl
          ? '(no hero)'
          : variation.heroImageUrl.startsWith('data:')
          ? `data:${variation.heroImageUrl.slice(5, 25)}…`
          : variation.heroImageUrl.slice(0, 100);
        // eslint-disable-next-line no-console
        console.log(
          `[lap-trace] cid=${campaignId} v${variation.index} status=${variation.status} hero=${heroSig} formats=${
            (variation.nativePerFormatRendered ?? []).join(',') || 'none'
          }${variation.error ? ` error="${variation.error.slice(0, 120)}"` : ''}`
        );
      }
      logLapEvent({
        campaignId,
        variationIndex: variation.index,
        level: variation.status === 'ready' ? 'info' : 'warn',
        tag:
          variation.status === 'ready'
            ? 'variation.ready'
            : 'variation.failed',
        message:
          variation.status === 'ready'
            ? `${variation.caption?.slice(0, 60) ?? '(no caption)'}`
            : `failed: ${variation.error ?? 'unknown'}`,
        data: {
          status: variation.status,
          hasHero: Boolean(variation.heroImageUrl),
          atlasUrl: variation.atlasUrl ?? null,
          nativePerFormatRendered: variation.nativePerFormatRendered ?? [],
          masksOneShotMatched: variation.masksOneShot?.matched ?? 0,
          masksVisionGuidedMatched: variation.masksVisionGuided?.matched ?? 0,
          textOverlayCount: variation.textOverlays?.length ?? 0,
          schedulePlatform: variation.schedulePlatform,
          scheduleWhenLocal: variation.scheduleWhenLocal,
        },
      });
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

  // ─── Signoff Managed Agent ────────────────────────────────────────────
  // When AUTO_MODE_USE_SIGNOFF=1 and we're in auto-post mode, run the
  // signoff agent before publishing. Its per-variation decision filters
  // which variations actually go through scheduleVariationPosts. The agent
  // also produces a SchedulePlan we surface in AutoModeResult so the UI
  // (and downstream tools) can show why each variation got auto-posted vs
  // held for human review. Fail-soft: any agent error → fall back to the
  // legacy behaviour (every ready variation gets scheduled).
  let schedulePlan: SchedulePlan | undefined;
  let postableVariations = variations;
  if (
    req.notifyMode === 'auto-post' &&
    process.env.AUTO_MODE_USE_SIGNOFF === '1' &&
    process.env.ANTHROPIC_API_KEY
  ) {
    const readyVariations = variations.filter((v) => v.status === 'ready');
    if (readyVariations.length > 0) {
      try {
        const guardrails = buildGuardrailsFromIngestion(urlIngestion);
        const signoffVariations: SignoffVariation[] = readyVariations.map((v) => ({
          index: v.index,
          caption: v.captionsByLocale?.['en-SG'] ?? v.caption,
          platform: v.schedulePlatform,
          scheduleWhenLocal: v.scheduleWhenLocal,
          moodNote: v.moodNote,
          hasHero: Boolean(v.heroImageUrl),
        }));
        schedulePlan = await runSignoffAgent({
          variations: signoffVariations,
          guardrails,
          workspaceId: req.workspaceId,
          useManagedAgents: req.useManagedAgents,
          // Server-supplied "now" so the agent doesn't compute the 36-hour
          // window from its own (stale) date estimate. Bug seen 2026-04-27:
          // model thought today's posts were "far in the future".
          now: new Date(),
        });
        // Persist for /inspect (mirror of researchBundle persistence path).
        if (campaignId) {
          await setCampaignSchedulePlan(campaignId, schedulePlan);
        }
        const planByIndex = new Map(
          schedulePlan.variations.map((p) => [p.variationIndex, p])
        );
        postableVariations = variations.filter((v) => {
          if (v.status !== 'ready') return false;
          const plan = planByIndex.get(v.index);
          return plan?.decision === 'auto-post';
        });
        // Discord ping per held / rejected variation so a human can act.
        for (const v of variations) {
          if (v.status !== 'ready') continue;
          const plan = planByIndex.get(v.index);
          if (!plan) continue;
          if (plan.decision === 'hold-for-review') {
            await notifyDiscord({
              campaignId: campaignId ?? undefined,
              tag: `signoff-hold-v${v.index}`,
              content: [
                `🟡 Signoff held v${v.index} for review`,
                `rationale: ${plan.rationale}`,
                v.caption ? `caption: ${v.caption.slice(0, 120)}` : '',
              ]
                .filter(Boolean)
                .join('\n'),
            });
          } else if (plan.decision === 'reject') {
            // eslint-disable-next-line no-console
            console.warn(
              `[auto-mode] signoff rejected v${v.index}: ${plan.rationale}`
            );
          }
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn(
          '[auto-mode] signoff agent failed — falling back to schedule-all:',
          err instanceof Error ? err.message : String(err)
        );
        schedulePlan = undefined;
        postableVariations = variations;
      }
    }
  }

  // ─── Auto-post step ───────────────────────────────────────────────────
  // Only when the caller asked for auto-post mode. Skips when no
  // workspaceId since the preview publisher requires one.
  let scheduledPostIds: string[] = [];
  if (req.notifyMode === 'auto-post') {
    scheduledPostIds = await scheduleVariationPosts({
      variations: postableVariations,
      workspaceId: req.workspaceId,
      baseUrl: req.baseUrl,
      forcePostNow: req.forcePostNow,
      campaignId,
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

  // Build per-variation embeds for the lap-end ping. Each variation gets
  // one embed card with its hero image inline, caption, locale status, and
  // a deep-link. The lap-start ping stays plain text — only the END ping
  // carries the rich embed array since that's when there's something to show.
  const lapEndEmbeds: DiscordEmbed[] = variations.map((v, idx) =>
    buildVariationEmbed({
      variation: v,
      campaignId,
      baseUrl: req.baseUrl,
      scheduledPostId: scheduledPostIds[idx],
      notifyMode: req.notifyMode,
    })
  );

  logLapEvent({
    campaignId,
    level: lapStatus === 'completed' ? 'info' : 'warn',
    tag: 'lap.end',
    message: `lap ${lapStatus} · ${okCount}/${req.variationCount} ready · ${scheduledPostIds.length} scheduled`,
    data: {
      lapStatus,
      readyCount: okCount,
      variationCount: req.variationCount,
      scheduledPostCount: scheduledPostIds.length,
      notifyMode: req.notifyMode,
      durationMs: Date.now() - (variations[0]?.agentSteps?.[0]?.ms ? Date.now() - variations[0].agentSteps[0].ms : Date.now()),
    },
  });

  // Lap-end button row. In review mode, every ready variation gets a pair
  // of link buttons (Approve / Reject) pointing to GET endpoints that act
  // on the campaign+variation. Plus a "Review in Aether ↗" link to the
  // inspect page so the user can review on canvas before clicking.
  // Discord caps each action row at 5 buttons; we keep approvals together
  // and put the review link on its own row when present.
  const lapEndComponents = buildLapEndActionRows({
    campaignId,
    variations,
    notifyMode: req.notifyMode,
    baseUrl: req.baseUrl,
  });

  const notified = await notifyDiscord({
    campaignId: campaignId ?? undefined,
    tag: `lap-end-${req.notifyMode}`,
    content: endContent,
    embeds: lapEndEmbeds.length > 0 ? lapEndEmbeds : undefined,
    components: lapEndComponents.length > 0 ? lapEndComponents : undefined,
  });

  return {
    campaignId,
    variations,
    status: lapStatus,
    notified,
    scheduledPostIds,
    urlIngestion,
    pdfIngestion,
    referenceDescriptions,
    researchBundle,
    schedulePlan,
    clusterBundle,
  };
}
