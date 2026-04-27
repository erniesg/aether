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
  insertCampaignVariation,
  setCampaignStatus,
  startCampaign,
} from '@/lib/convex/http';
import { scheduleVariationPosts } from '@/lib/agent/auto-mode';
import { uploadAssetToConvex } from '@/lib/storage/convexAsset';

export interface PersistGenerationInput {
  workspaceId?: string;
  baseUrl: string;
  prompt: string;
  refs?: ReadonlyArray<{ url?: string }>;
  heroImageUrl: string;
  /** Optional per-format URLs (keyed by format id). When supplied the
   *  variation row carries nativePerFormatUrls so /inspect + /runs can
   *  show every aspect, not just the hero. */
  nativePerFormatUrls?: Partial<
    Record<'1x1' | '4x5' | '9x16' | '16x9', string>
  >;
  provider?: string;
  model?: string;
  aspectRatio?: string;
  /** When false / omitted, Discord ping is skipped (campaign still persists). */
  notifyDiscord?: boolean;
  /** Drag-drop publishing intent. 'review' (default): persist + Discord
   *  ping with a Post-now button. 'auto-post': persist + immediately fire
   *  scheduleVariationPosts with forcePostNow=true. The composer's
   *  notify-mode chip drives this per-fire. */
  notifyMode?: 'review' | 'auto-post';
}

export interface PersistGenerationResult {
  campaignId: string | null;
  discordSent: boolean;
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
    return { campaignId: null, discordSent: false };
  }

  if (!campaignId) {
    return { campaignId: null, discordSent: false };
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
  // entry in nativePerFormatUrls. wsId is intentionally NOT passed:
  // the asset table validates it as v.id('workspace') (doc id), but
  // workspaceId here is a slug like 'demo-dingman-joe' that doesn't
  // round-trip. Asset rows persist without ws scoping in this path —
  // the campaign+variation already carry the slug.
  let persistedHeroUrl = input.heroImageUrl;
  if (persistedHeroUrl.startsWith('data:')) {
    const uploaded = await uploadAssetToConvex({
      source: persistedHeroUrl,
      kind: 'hero',
      sourceUrl: `drag-drop generation · ${input.prompt.slice(0, 60)}`,
    });
    if (uploaded) {
      persistedHeroUrl = uploaded.publicUrl;
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
  if (input.nativePerFormatUrls) {
    const entries = await Promise.all(
      Object.entries(input.nativePerFormatUrls).map(async ([fid, url]) => {
        if (!url) return [fid, url] as const;
        if (!url.startsWith('data:')) return [fid, url] as const;
        const uploaded = await uploadAssetToConvex({
          source: url,
          kind: 'hero',
          sourceUrl: `drag-drop generation · ${fid} · ${input.prompt.slice(0, 60)}`,
        });
        return [fid, uploaded?.publicUrl ?? url] as const;
      })
    );
    persistedPerFormatUrls = Object.fromEntries(entries) as typeof input.nativePerFormatUrls;
  }

  try {
    await insertCampaignVariation({
      campaignId,
      workspaceId: input.workspaceId,
      index: 1,
      status: 'ready',
      heroImageUrl: persistedHeroUrl,
      nativePerFormatUrls: persistedPerFormatUrls,
      caption: input.prompt,
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
  if (notifyMode === 'auto-post' && input.workspaceId) {
    try {
      await scheduleVariationPosts({
        variations: [
          {
            index: 1,
            status: 'ready',
            heroImageUrl: persistedHeroUrl,
            nativePerFormatUrls: persistedPerFormatUrls,
            caption: input.prompt,
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
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(
        '[persist-generation] auto-post scheduleVariationPosts failed:',
        err instanceof Error ? err.message : String(err)
      );
    }
  }

  return { campaignId, discordSent };
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
  const postNowLink = `[🚀 Post now to all platforms](${origin}/api/auto-mode/post-now?c=${encodeURIComponent(input.campaignId)}&v=1)`;
  const reviewLink = `[👁 Review on /runs](${origin}/runs)`;
  const inspectLink = `[🔍 Full inspect](${origin}/inspect/${encodeURIComponent(input.campaignId)})`;
  const linksLine = isAutoPost
    ? `${reviewLink} · ${inspectLink}`
    : `${postNowLink} · ${reviewLink} · ${inspectLink}`;
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
  const components: DiscordActionRow[] = [
    {
      type: 1,
      components: isAutoPost
        ? [
            {
              type: 2,
              style: 5,
              label: 'Review in Aether',
              emoji: { name: '👁' },
              url: `${origin}/inspect/${encodeURIComponent(input.campaignId)}`,
            },
          ]
        : [
            {
              type: 2,
              style: 5,
              label: 'Post now to all platforms',
              emoji: { name: '🚀' },
              // /post-now loads the persisted variation from Convex and calls
              // scheduleVariationPosts directly with forcePostNow=true. Skips
              // the redundant lap-rerun that the old /approve→/run flow did
              // just to publish bytes that already existed.
              url: `${origin}/api/auto-mode/post-now?c=${encodeURIComponent(
                input.campaignId
              )}&v=1`,
            },
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
