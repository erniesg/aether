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

  let campaignId: string | null = null;
  try {
    campaignId = await startCampaign({
      workspaceId: input.workspaceId,
      triggerKind: 'text',
      triggerPayload: input.prompt,
      variationCount: 1,
      notifyMode: 'review',
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

  // Insert the variation row carrying the hero. Index 1 so the approve
  // link `?c=<id>&v=1` matches the existing handler shape.
  try {
    await insertCampaignVariation({
      campaignId,
      workspaceId: input.workspaceId,
      index: 1,
      status: 'ready',
      heroImageUrl: input.heroImageUrl,
      nativePerFormatUrls: input.nativePerFormatUrls,
      caption: input.prompt,
      schedulePlatform: 'instagram',
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
      heroImageUrl: input.heroImageUrl,
      prompt: input.prompt,
      provider: input.provider,
      model: input.model,
      aspectRatio: input.aspectRatio,
      refCount: referenceImages.length,
    });
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

  const embed: DiscordEmbed = {
    title: '🎨 New generation ready',
    description:
      input.prompt.length > 280
        ? input.prompt.slice(0, 280) + '…'
        : input.prompt,
    color: 0x57f287,
    image: inlineImage,
    fields,
    footer: { text: `campaign ${input.campaignId}` },
    timestamp: new Date().toISOString(),
  };

  const components: DiscordActionRow[] = [
    {
      type: 1,
      components: [
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
