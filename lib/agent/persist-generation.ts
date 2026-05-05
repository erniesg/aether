/**
 * Persist a successful drag-drop / direct generate as a "synthetic" auto-mode
 * campaign so it shows up in /runs alongside real laps, AND fire a Discord
 * ping with a post-now button. Reuses the campaign / variation infrastructure
 * so the post-now button just routes through /api/auto-mode/post-now, which
 * loads the persisted variation and calls scheduleVariationPosts directly.
 *
 * Design notes:
 *   - One synthetic campaign row per generate, one variation row inside it
 *     carrying the hero image (and optional per-format URLs). The variation
 *     index is always 1 — the post-now link uses (campaignId, v=1).
 *   - Reference images are recorded URL-only (data URLs are stripped to a
 *     short signature so the campaign row stays small).
 *   - Fail-soft: if Convex / Discord is unreachable the generate response
 *     is unaffected; we just log and move on.
 */

import { notifyDiscord, type DiscordActionRow, type DiscordEmbed } from '@/lib/notify/discord';
import {
  addCreatorReference,
  insertCampaignVariation,
  setCampaignStatus,
  startCampaign,
} from '@/lib/convex/http';
import {
  buildAutoModeComponent,
  scheduleVariationPosts,
} from '@/lib/agent/auto-mode';
import { uploadAssetToConvex } from '@/lib/storage/convexAsset';
import { genReferenceId } from '@/lib/providers/reference/og';
import type { ReferenceRecord } from '@/lib/providers/reference/types';
import {
  buildDiscordPublishChoiceRow,
  buildDiscordPublishLinks,
} from '@/lib/publisher/discord-actions';
import type { PublishPlatform } from '@/lib/providers/publisher/types';
import { applyTextOverlay, type ProposedTextOverlay } from '@/lib/agent/text-apply';
import {
  COMPOSE_FORMATS,
  COMPOSE_LOCALES,
  composeVariantSet,
  type LocaleCode as ComposeLocaleCode,
} from '@/lib/text-overlay/compose';
import { asBCP47LocaleCode } from '@/lib/text-overlay/types';
import { TARGET_TRANSLATION_LOCALES } from '@/lib/locale/registry';

export interface PersistGenerationInput {
  workspaceId?: string;
  baseUrl: string;
  prompt: string;
  refs?: ReadonlyArray<{ url?: string }>;
  heroImageUrl: string;
  /** Selected hero direction for publish/export resolution when a single
   *  generated campaign contains linked multi-hero artboards. */
  heroDirectionId?: string;
  /** Optional per-format URLs (keyed by format id). When supplied the
   *  variation row carries nativePerFormatUrls so /inspect + /runs can
   *  show every aspect, not just the hero. */
  nativePerFormatUrls?: Partial<
    Record<'1x1' | '4x5' | '9x16' | '16x9', string>
  >;
  provider?: string;
  model?: string;
  sourceRunId?: string;
  aspectRatio?: string;
  /** When false / omitted, Discord ping is skipped (campaign still persists). */
  notifyDiscord?: boolean;
  /** Drag-drop publishing intent. 'review' (default): persist + Discord
   *  ping with a Post-now button. 'auto-post': persist + immediately fire
   *  scheduleVariationPosts with forcePostNow=true. The composer's
   *  notify-mode chip drives this per-fire. */
  notifyMode?: 'review' | 'auto-post';
  /** Optional publish platform scope from creator voice/prompt intent.
   *  When omitted, the persisted/env publish plan is used. */
  targetPlatforms?: PublishPlatform[];
  /** Scene-aware prompt produced by the layout planner — preferred over
   *  `prompt` (orchestration template) when seeding the text-overlay
   *  pipeline so multilingual headlines/captions describe the actual hero
   *  scene, not the boilerplate instruction. */
  rewrittenPrompt?: string;
}

export interface PersistGenerationResult {
  campaignId: string | null;
  variationId: string | null;
  discordSent: boolean;
  scheduledPostIds?: string[];
  autoPostError?: string;
}

/** Build a short signature for a possibly-data-URL ref so the campaign
 *  row stays small. URLs pass through. */
function refSignature(url?: string): string | undefined {
  if (!url) return undefined;
  if (url.startsWith('data:')) {
    return `data:${url.slice(5, 25)}…(${Math.round(url.length / 1024)}KB b64)`;
  }
  return url;
}

async function fetchMediaBytes(url: string): Promise<Buffer | null> {
  if (!url) return null;
  try {
    if (url.startsWith('data:')) {
      const comma = url.indexOf(',');
      if (comma < 0) return null;
      return Buffer.from(url.slice(comma + 1), 'base64');
    }
    const res = await fetch(url);
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

function deriveCaptionsByLocale(
  layers: ReadonlyArray<ProposedTextOverlay>
): Record<string, string> {
  const captionLayer = layers.find((l) => l.zone.purpose === 'caption');
  const headlineLayer = layers.find((l) => l.zone.purpose === 'headline');
  const out: Record<string, string> = {};
  const seenLocales = new Set<string>();
  for (const layer of layers) {
    for (const locale of Object.keys(layer.content ?? {})) {
      seenLocales.add(locale);
    }
  }
  for (const locale of seenLocales) {
    const branded = asBCP47LocaleCode(locale);
    const c = captionLayer?.content?.[branded];
    const h = headlineLayer?.content?.[branded];
    const text = c && c.trim() ? c.trim() : h && h.trim() ? h.trim() : '';
    if (text) out[locale] = text;
  }
  return out;
}

interface OverlayPipelineResult {
  layers: ProposedTextOverlay[];
  captionsByLocale: Record<string, string>;
  localizedPerFormatUrls: Record<string, Record<string, string>>;
  atlasUrl?: string;
  atlasAssetId?: string;
}

/**
 * Run text-overlay → composeVariantSet → tile/atlas upload synchronously
 * before the variation is persisted. Without this the voice / drag-drop
 * generate flow lands a variation with empty `captionsByLocale` and
 * `localizedPerFormatUrls`, and `auto-post` then publishes a bare image
 * with whatever caption fallback the publisher can find. Fail-soft —
 * any step that breaks returns null and the caller persists what it has.
 */
async function runOverlayPipeline(input: {
  workspaceId?: string;
  heroUrl: string;
  nativePerFormatUrls?: Partial<
    Record<'1x1' | '4x5' | '9x16' | '16x9', string>
  >;
  sceneDescription: string;
  creatorIntent?: string;
}): Promise<OverlayPipelineResult | null> {
  if (process.env.AETHER_OVERLAY_ON_GEN === '0') return null;
  try {
    const component = buildAutoModeComponent({
      rewrittenPromptOrCaption: input.sceneDescription,
    });
    const overlay = await applyTextOverlay({
      component,
      sourceLocale: asBCP47LocaleCode('en-SG'),
      targetLocales: [...TARGET_TRANSLATION_LOCALES],
      creatorIntent: input.creatorIntent,
      wsId: input.workspaceId,
    });
    if (!overlay.layers || overlay.layers.length === 0) return null;

    const heroBytes = await fetchMediaBytes(input.heroUrl);
    if (!heroBytes) return null;

    const nativePerFormatBytes: Partial<
      Record<'1x1' | '4x5' | '9x16' | '16x9', Buffer>
    > = {};
    if (input.nativePerFormatUrls) {
      await Promise.all(
        Object.entries(input.nativePerFormatUrls).map(async ([fid, url]) => {
          if (!url) return;
          const bytes = await fetchMediaBytes(url);
          if (bytes) {
            nativePerFormatBytes[fid as '1x1' | '4x5' | '9x16' | '16x9'] = bytes;
          }
        })
      );
    }

    const captionsByLocale = deriveCaptionsByLocale(overlay.layers);

    const composed = await composeVariantSet({
      heroBytes,
      textOverlays: overlay.layers,
      fallbackCaptions: captionsByLocale as Partial<
        Record<ComposeLocaleCode, string>
      >,
      nativePerFormatBytes,
    });

    const atlasUploaded = await uploadAssetToConvex({
      source: composed.atlas,
      kind: 'other',
      mime: 'image/png',
      sourceUrl: 'voice generate variant atlas',
      width: composed.atlasWidth,
      height: composed.atlasHeight,
      workspaceId: input.workspaceId,
    });

    const localizedPerFormatUrls: Record<string, Record<string, string>> = {};
    await Promise.all(
      COMPOSE_FORMATS.flatMap((format) =>
        COMPOSE_LOCALES.map(async (locale) => {
          const tile = composed.tiles.get(`${format.id}-${locale}`);
          if (!tile) return;
          const uploaded = await uploadAssetToConvex({
            source: tile,
            kind: 'hero',
            mime: 'image/png',
            sourceUrl: `voice generate ${format.id} ${locale}`,
            width: format.w,
            height: format.h,
            workspaceId: input.workspaceId,
          });
          if (!uploaded?.publicUrl) return;
          if (!localizedPerFormatUrls[locale]) {
            localizedPerFormatUrls[locale] = {};
          }
          localizedPerFormatUrls[locale][format.id] = uploaded.publicUrl;
        })
      )
    );

    return {
      layers: overlay.layers,
      captionsByLocale,
      localizedPerFormatUrls,
      atlasUrl: atlasUploaded?.publicUrl,
      atlasAssetId: atlasUploaded?.id as string | undefined,
    };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      '[persist-generation] runOverlayPipeline failed:',
      err instanceof Error ? err.message : String(err)
    );
    return null;
  }
}

export async function persistGenerateAsCampaign(
  input: PersistGenerationInput
): Promise<PersistGenerationResult> {
  // Strip data URLs to short signatures so the persisted row stays small
  // (Convex docs are 1MB max and a 7MB base64 ref would obviously overflow).
  const referenceImages = (input.refs ?? [])
    .map((r) => ({ url: refSignature(r.url) }))
    .filter((r): r is { url: string } => typeof r.url === 'string');

  const notifyMode: 'review' | 'auto-post' =
    input.notifyMode === 'auto-post' ? 'auto-post' : 'review';

  let campaignId: string | null = null;
  try {
    campaignId = await startCampaign({
      workspaceId: input.workspaceId,
      triggerKind: 'text',
      triggerPayload: input.prompt,
      variationCount: 1,
      notifyMode,
      referenceImages: referenceImages.length > 0 ? referenceImages : undefined,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      '[persist-generation] startCampaign failed (drag-drop persistence disabled this run):',
      err instanceof Error ? err.message : String(err)
    );
    return { campaignId: null, variationId: null, discordSent: false };
  }

  if (!campaignId) {
    return { campaignId: null, variationId: null, discordSent: false };
  }

  // Insert the variation row carrying the hero. Index 1 so the post-now
  // link `?c=<id>&v=1` matches the existing handler shape. scheduleWhenLocal
  // is set to "now" so scheduleVariationPosts (which skips variations
  // missing it) can fire when notifyMode='auto-post'. For review mode the
  // value is harmless — the lap-end card uses it as the default schedule
  // suggestion when the creator opens the schedule picker.
  const scheduleWhenLocal = new Date().toISOString();

  // Convex docs cap at 1 MiB. gpt-image-2 / gemini-flash-image return
  // base64 data URLs (~3-5 MB each), so attempting to write them
  // directly into a `campaignVariation.heroImageUrl` row fails with
  // "Value is too large". Stage data URLs through Convex File Storage
  // first — the resulting publicUrl is a short string. Same for each
  // entry in nativePerFormatUrls. We pass the route-level workspace slug
  // separately from Convex's legacy wsId so generated assets can rejoin
  // the creator library without requiring a workspace doc id.
  let persistedHeroUrl = input.heroImageUrl;
  let heroAssetId: string | undefined;
  if (persistedHeroUrl.startsWith('data:')) {
    const uploaded = await uploadAssetToConvex({
      source: persistedHeroUrl,
      kind: 'hero',
      workspaceId: input.workspaceId,
      sourceUrl: `drag-drop generation · ${input.prompt.slice(0, 60)}`,
    });
    if (uploaded) {
      persistedHeroUrl = uploaded.publicUrl;
      heroAssetId = uploaded.id;
    } else {
      // eslint-disable-next-line no-console
      console.warn(
        '[persist-generation] hero upload returned null — variation row will likely fail the 1 MiB Convex cap'
      );
    }
  }

  // Same staging dance for per-format URLs. Build the staged map in
  // parallel since uploads are independent. Keeps order stable.
  let persistedPerFormatUrls = input.nativePerFormatUrls;
  const perFormatAssetIds: Partial<
    Record<'1x1' | '4x5' | '9x16' | '16x9', string>
  > = {};
  if (input.nativePerFormatUrls) {
    const entries = await Promise.all(
      Object.entries(input.nativePerFormatUrls).map(async ([fid, url]) => {
        if (!url) return [fid, url] as const;
        if (!url.startsWith('data:')) return [fid, url] as const;
        const uploaded = await uploadAssetToConvex({
          source: url,
          kind: 'hero',
          workspaceId: input.workspaceId,
          sourceUrl: `drag-drop generation · ${fid} · ${input.prompt.slice(0, 60)}`,
        });
        if (uploaded?.id) {
          perFormatAssetIds[fid as keyof typeof perFormatAssetIds] = uploaded.id;
        }
        return [fid, uploaded?.publicUrl ?? url] as const;
      })
    );
    persistedPerFormatUrls = Object.fromEntries(entries) as typeof input.nativePerFormatUrls;
  }

  // Run text-overlay + locale render synchronously so the variation lands
  // with captionsByLocale + localizedPerFormatUrls populated. Without this
  // auto-post fires with bare images and an empty caption fallback chain.
  // Fail-soft: returns null on any step failure; the variation persists
  // with whatever it has and the schedule still completes.
  const overlay = await runOverlayPipeline({
    workspaceId: input.workspaceId,
    heroUrl: persistedHeroUrl,
    nativePerFormatUrls: persistedPerFormatUrls,
    sceneDescription: input.rewrittenPrompt ?? input.prompt,
    creatorIntent: input.prompt.slice(0, 240),
  });

  let variationId: string | null = null;
  try {
    variationId = await insertCampaignVariation({
      campaignId,
      workspaceId: input.workspaceId,
      index: 1,
      status: 'ready',
      heroDirectionId: input.heroDirectionId,
      heroImageUrl: persistedHeroUrl,
      nativePerFormatUrls: persistedPerFormatUrls,
      // Top-level caption stays empty by design — pickCaptionForLocale
      // prefers captionsByLocale[locale] first.
      ...(overlay?.captionsByLocale && Object.keys(overlay.captionsByLocale).length > 0
        ? { captionsByLocale: overlay.captionsByLocale }
        : {}),
      ...(overlay?.localizedPerFormatUrls &&
      Object.keys(overlay.localizedPerFormatUrls).length > 0
        ? { localizedPerFormatUrls: overlay.localizedPerFormatUrls }
        : {}),
      ...(overlay?.layers && overlay.layers.length > 0
        ? { textOverlays: overlay.layers }
        : {}),
      ...(overlay?.atlasUrl ? { atlasUrl: overlay.atlasUrl } : {}),
      schedulePlatform: 'instagram',
      scheduleWhenLocal,
      agentRunIds: [],
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      '[persist-generation] insertCampaignVariation failed:',
      err instanceof Error ? err.message : String(err)
    );
  }

  await persistGeneratedLibraryItems({
    workspaceId: input.workspaceId,
    campaignId,
    prompt: input.prompt,
    heroUrl: persistedHeroUrl,
    heroAssetId,
    perFormatUrls: persistedPerFormatUrls,
    perFormatAssetIds,
    sourceRunId: input.sourceRunId,
  });

  try {
    await setCampaignStatus(campaignId, 'completed');
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      '[persist-generation] setCampaignStatus failed:',
      err instanceof Error ? err.message : String(err)
    );
  }

  let discordSent = false;
  if (input.notifyDiscord !== false) {
    discordSent = await sendDragDropDiscordPing({
      baseUrl: input.baseUrl,
      campaignId,
      // Use the staged URL so the Discord embed can render the inline
      // image preview. Discord refuses data: URIs in embed.image.url.
      heroImageUrl: persistedHeroUrl,
      prompt: input.prompt,
      provider: input.provider,
      model: input.model,
      aspectRatio: input.aspectRatio,
      refCount: referenceImages.length,
      notifyMode,
    });
  }

  // When the creator picked auto-post on the composer, fire publishers
  // immediately (T-30s scheduling on direct adapters). Fail-soft — a
  // publisher error doesn't roll back the persisted campaign. Uses the
  // staged (Convex-public) URLs so platform pullers (Meta especially)
  // get something they can fetch — the original data: URLs would be
  // unfetchable across origins.
  let scheduledPostIds: string[] = [];
  let autoPostError: string | undefined;
  if (notifyMode === 'auto-post' && input.workspaceId) {
    if (process.env.AETHER_AUTOPOST_DRY_RUN === '1') {
      // eslint-disable-next-line no-console
      console.warn(
        '[persist-generation] AETHER_AUTOPOST_DRY_RUN=1 — skipping scheduleVariationPosts'
      );
    } else {
      try {
        scheduledPostIds = await scheduleVariationPosts({
          variations: [
            {
              index: 1,
              status: 'ready',
              heroDirectionId: input.heroDirectionId,
              heroImageUrl: persistedHeroUrl,
              nativePerFormatUrls: persistedPerFormatUrls,
              ...(overlay?.captionsByLocale &&
              Object.keys(overlay.captionsByLocale).length > 0
                ? { captionsByLocale: overlay.captionsByLocale as never }
                : {}),
              ...(overlay?.localizedPerFormatUrls &&
              Object.keys(overlay.localizedPerFormatUrls).length > 0
                ? { localizedPerFormatUrls: overlay.localizedPerFormatUrls as never }
                : {}),
              ...(overlay?.layers && overlay.layers.length > 0
                ? { textOverlays: overlay.layers }
                : {}),
              caption: undefined,
              schedulePlatform: 'instagram',
              scheduleWhenLocal,
              agentSteps: [],
              agentFinalText: '',
            },
          ],
          workspaceId: input.workspaceId,
          baseUrl: input.baseUrl,
          forcePostNow: true,
          campaignId,
          targetPlatforms: input.targetPlatforms,
        });
      } catch (err) {
        autoPostError = err instanceof Error ? err.message : String(err);
        // eslint-disable-next-line no-console
        console.warn(
          '[persist-generation] auto-post scheduleVariationPosts failed:',
          autoPostError
        );
      }
    }
  }

  return {
    campaignId,
    variationId,
    discordSent,
    ...(scheduledPostIds.length > 0 ? { scheduledPostIds } : {}),
    ...(autoPostError ? { autoPostError } : {}),
  };
}

async function persistGeneratedLibraryItems(input: {
  workspaceId?: string;
  campaignId: string;
  prompt: string;
  heroUrl: string;
  heroAssetId?: string;
  perFormatUrls?: Partial<Record<'1x1' | '4x5' | '9x16' | '16x9', string>>;
  perFormatAssetIds?: Partial<Record<'1x1' | '4x5' | '9x16' | '16x9', string>>;
  sourceRunId?: string;
}) {
  if (!input.workspaceId) return;
  const capturedAt = new Date().toISOString();
  const titleBase =
    input.prompt.length > 72 ? `${input.prompt.slice(0, 72)}…` : input.prompt;
  const records: ReferenceRecord[] = [
    {
      id: genReferenceId('ref_gen'),
      kind: 'image',
      previewUrl: input.heroUrl,
      fullUrl: input.heroUrl,
      attribution: { source: 'generated', url: input.heroUrl },
      capturedAt,
      title: titleBase || 'generated asset',
      usageIntent: 'key visual',
      tags: ['generated', 'hero'],
      assetId: input.heroAssetId,
      origin: 'generated',
      sourceRunId: input.sourceRunId,
      sourceCampaignId: input.campaignId,
    },
  ];

  for (const [formatId, url] of Object.entries(input.perFormatUrls ?? {})) {
    if (!url || url === input.heroUrl) continue;
    records.push({
      id: genReferenceId('ref_gen'),
      kind: 'image',
      previewUrl: url,
      fullUrl: url,
      attribution: { source: 'generated', url },
      capturedAt,
      title: `${titleBase || 'generated asset'} · ${formatId}`,
      usageIntent: 'format variant',
      tags: ['generated', 'variant', formatId],
      assetId:
        input.perFormatAssetIds?.[
          formatId as '1x1' | '4x5' | '9x16' | '16x9'
        ],
      origin: 'generated',
      sourceRunId: input.sourceRunId,
      sourceCampaignId: input.campaignId,
      sourceFormatId: formatId,
    });
  }

  await Promise.all(
    records.map((reference) =>
      addCreatorReference({
        workspaceId: input.workspaceId,
        reference,
      })
    )
  );
}

interface SendPingInput {
  baseUrl: string;
  campaignId: string;
  heroImageUrl: string;
  prompt: string;
  provider?: string;
  model?: string;
  aspectRatio?: string;
  refCount: number;
  notifyMode: 'review' | 'auto-post';
}

async function sendDragDropDiscordPing(input: SendPingInput): Promise<boolean> {
  const origin = input.baseUrl.replace(/\/+$/, '');

  // Discord can't render data: URLs in embed images. Skip the inline
  // preview when the hero is a data URL — the buttons still work.
  const inlineImage = input.heroImageUrl.startsWith('data:')
    ? undefined
    : { url: input.heroImageUrl };

  const fields: DiscordEmbed['fields'] = [];
  if (input.provider) fields.push({ name: 'provider', value: input.provider, inline: true });
  if (input.model) fields.push({ name: 'model', value: input.model, inline: true });
  if (input.aspectRatio)
    fields.push({ name: 'aspect', value: input.aspectRatio, inline: true });
  if (input.refCount > 0)
    fields.push({ name: 'refs', value: String(input.refCount), inline: true });
  fields.push({ name: 'mode', value: input.notifyMode, inline: true });

  const isAutoPost = input.notifyMode === 'auto-post';
  // Inline-link fallback. The structured `components` action row below is
  // dropped silently by Discord when the webhook is an incoming-channel
  // webhook (most servers' default). Application-owned webhooks render
  // buttons; incoming webhooks don't. So we ALSO surface the same actions
  // as markdown links inside the embed description — Discord renders
  // markdown links in embed descriptions on every webhook type.
  const publishLinks = buildDiscordPublishLinks({
    baseUrl: origin,
    campaignId: input.campaignId,
    variationIndex: 1,
    availableLocales: ['en-SG'],
  });
  const reviewLink = `[👁 Review on /runs](${origin}/runs)`;
  const inspectLink = `[🔍 Full inspect](${origin}/inspect/${encodeURIComponent(input.campaignId)})`;
  const linksLine = isAutoPost
    ? `${reviewLink} · ${inspectLink}`
    : `${publishLinks.join(' · ')} · ${reviewLink} · ${inspectLink}`;
  const promptText =
    input.prompt.length > 240
      ? input.prompt.slice(0, 240) + '…'
      : input.prompt;
  const description = `${promptText}\n\n${linksLine}`;

  const embed: DiscordEmbed = {
    title: isAutoPost
      ? '🚀 New generation — auto-posting now'
      : '🎨 New generation ready',
    description,
    color: isAutoPost ? 0xfee75c : 0x57f287,
    image: inlineImage,
    fields,
    footer: { text: `campaign ${input.campaignId}` },
    timestamp: new Date().toISOString(),
  };

  // In auto-post mode the per-publish ping (from scheduleVariationPosts)
  // already surfaces the live link, so the embed only needs the Review
  // button. In review mode show the explicit Post-now button so the
  // creator can fire publishers when they're ready.
  const publishChoiceRow = isAutoPost
    ? null
    : buildDiscordPublishChoiceRow({
        baseUrl: origin,
        campaignId: input.campaignId,
        variationIndex: 1,
        availableLocales: ['en-SG'],
      });
  const components: DiscordActionRow[] = [
    ...(publishChoiceRow ? [publishChoiceRow] : []),
    {
      type: 1,
      components: [
        {
          type: 2,
          style: 5,
          label: 'Review in Aether',
          emoji: { name: '👁' },
          url: `${origin}/inspect/${encodeURIComponent(input.campaignId)}`,
        },
      ],
    },
  ];

  return notifyDiscord({
    content: '',
    embeds: [embed],
    components,
    tag: 'generate.completed',
    campaignId: input.campaignId,
  });
}
