/**
 * POST /api/auto-mode/post-now
 * GET  /api/auto-mode/post-now?c=<campaignId>&v=<variationIndex>&ws=<workspaceId>
 *
 * Cheap "post now" path. Loads a campaign + variation from Convex and calls
 * scheduleVariationPosts directly with forcePostNow=true, instead of the old
 * route (/approve → /run) which re-fired the entire lap (image gen, segment,
 * compose, atlas) just to publish bytes that already exist.
 *
 * The GET handler is shaped for Discord link buttons (browser issues a GET
 * when the user clicks). The POST handler is shaped for in-app JSON callers
 * (right-rail VariationActions, /runs row buttons).
 *
 * On both paths the variation must already be persisted to Convex with a
 * heroImageUrl + scheduleWhenLocal — the caller cannot fix a stale variation
 * from this route. If you want to re-run image gen, hit /api/auto-mode/run.
 */

import { NextResponse } from 'next/server';
import { ConvexHttpClient } from 'convex/browser';
import { anyApi } from 'convex/server';
import {
  scheduleVariationPosts,
  type AutoModeVariationResult,
  type LocaleCode,
} from '@/lib/agent/auto-mode';
import {
  COMPOSE_FORMATS,
  COMPOSE_LOCALES,
  composeVariantSet,
  type ComposeFormat,
} from '@/lib/text-overlay/compose';
import { uploadAssetToConvex } from '@/lib/storage/convexAsset';
import {
  normalizePublishLocales,
  normalizePublishPlatforms,
  composePublishPostsForVariation,
  filterTextOverlaysForHeroDirection,
} from '@/lib/publisher/payload';
import { parseDiscordPublishSelection } from '@/lib/publisher/discord-actions';
import type { PublishPlatform } from '@/lib/providers/publisher/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface RequestBody {
  campaignId?: string;
  variationIndex?: number;
  workspaceId?: string;
  platforms?: string[] | string;
  locales?: string[] | string;
}

interface ConvexCampaign {
  id: string;
  workspaceId?: string;
}

interface ConvexVariation {
  id: string;
  index: number;
  status: string;
  heroDirectionId?: string;
  heroImageUrl?: string;
  caption?: string;
  captionsByLocale?: Partial<Record<LocaleCode, string>>;
  hashtags?: string[];
  schedulePlatform?: string;
  scheduleWhenLocal?: string;
  nativePerFormatUrls?: Partial<Record<'1x1' | '4x5' | '9x16' | '16x9', string>>;
  localizedPerFormatUrls?: Partial<
    Record<LocaleCode, Partial<Record<'1x1' | '4x5' | '9x16' | '16x9', string>>>
  >;
  atlasUrl?: string;
  textOverlays?: unknown;
  agentRunIds?: unknown;
}

const campaignsAnyApi = (anyApi as unknown as {
  campaigns: { get: unknown; setVariationRenderedMedia: unknown };
}).campaigns;

async function loadVariationFromConvex(
  campaignId: string,
  variationIndex: number
): Promise<{
  campaign: ConvexCampaign;
  variation: ConvexVariation;
} | null> {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) return null;
  try {
    const client = new ConvexHttpClient(convexUrl);
    const result = (await client.query(campaignsAnyApi.get as never, {
      campaignId,
    } as never)) as {
      campaign: ConvexCampaign;
      variations: ConvexVariation[];
    } | null;
    if (!result) return null;
    const variation = result.variations.find((v) => v.index === variationIndex);
    if (!variation) return null;
    return { campaign: result.campaign, variation };
  } catch {
    return null;
  }
}

type FormatId = ComposeFormat['id'];

function isFormatId(value: unknown): value is FormatId {
  if (typeof value !== 'string') return false;
  return COMPOSE_FORMATS.some((format) => format.id === value);
}

function arrayish(value: string[] | string | undefined): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') return value.split(',');
  return [];
}

function resolveBodyPublishSelection(body: RequestBody): {
  targetPlatforms?: PublishPlatform[];
  targetLocales?: LocaleCode[];
} {
  const targetPlatforms = normalizePublishPlatforms(arrayish(body.platforms));
  const targetLocales = normalizePublishLocales(arrayish(body.locales));
  return {
    targetPlatforms: targetPlatforms.length > 0 ? targetPlatforms : undefined,
    targetLocales: targetLocales.length > 0 ? targetLocales : undefined,
  };
}

async function fetchMediaBytes(source: string | undefined): Promise<Buffer | null> {
  if (!source) return null;
  if (source.startsWith('data:')) {
    const commaIdx = source.indexOf(',');
    if (commaIdx <= 0) return null;
    try {
      return Buffer.from(source.slice(commaIdx + 1), 'base64');
    } catch {
      return null;
    }
  }
  try {
    const res = await fetch(source);
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

/**
 * Re-render share media from the variation's current `textOverlays`, then
 * upload the atlas plus locale-specific tiles per format. Publishing consumes
 * explicit locale/platform/format media rows, so refreshing only the atlas
 * would still post stale provider images.
 */
async function maybeRefreshRenderedMedia(
  variation: ConvexVariation
): Promise<
  | {
      atlasUrl?: string;
      atlasAssetId?: string;
      localizedPerFormatUrls?: Partial<Record<LocaleCode, Partial<Record<FormatId, string>>>>;
      sourceNativePerFormatUrls?: Partial<Record<FormatId, string>>;
    }
  | undefined
> {
  if (!variation.heroImageUrl) return undefined;

  const overlays = (variation.textOverlays ?? undefined) as
    | ReadonlyArray<unknown>
    | undefined;
  // No overlays means the original atlas had no creator-supplied text to
  // begin with — re-rendering would just produce the same composition,
  // so skip the round trip.
  if (!overlays || overlays.length === 0) return undefined;

  try {
    const heroBytes = await fetchMediaBytes(variation.heroImageUrl);
    if (!heroBytes) return undefined;
    const sourceNativePerFormatUrls = { ...(variation.nativePerFormatUrls ?? {}) };

    const nativePerFormatBytes: Partial<Record<FormatId, Buffer>> = {};
    await Promise.all(
      Object.entries(variation.nativePerFormatUrls ?? {}).map(async ([formatId, url]) => {
        if (!isFormatId(formatId)) return;
        const bytes = await fetchMediaBytes(url);
        if (bytes) nativePerFormatBytes[formatId] = bytes;
      })
    );

    const composed = await composeVariantSet({
      heroBytes,
      textOverlays: filterTextOverlaysForHeroDirection(
        overlays as Parameters<typeof composeVariantSet>[0]['textOverlays'],
        variation.heroDirectionId
      ),
      fallbackCaptions: variation.captionsByLocale,
      nativePerFormatBytes,
    });

    const atlasUpload = await uploadAssetToConvex({
      source: composed.atlas,
      kind: 'other',
      mime: 'image/png',
      sourceUrl: 'post-now refreshed variant atlas',
      width: composed.atlasWidth,
      height: composed.atlasHeight,
    });

    const localizedPerFormatUrls: Partial<Record<LocaleCode, Partial<Record<FormatId, string>>>> = {
      ...(variation.localizedPerFormatUrls ?? {}),
    };
    await Promise.all(
      COMPOSE_FORMATS.flatMap((format) =>
        COMPOSE_LOCALES.map(async (locale) => {
          const tile = composed.tiles.get(`${format.id}-${locale}`);
          if (!tile) return;
          const uploaded = await uploadAssetToConvex({
            source: tile,
            kind: 'hero',
            mime: 'image/png',
            sourceUrl: `post-now refreshed ${format.id} ${locale}`,
            width: format.w,
            height: format.h,
          });
          if (!uploaded?.publicUrl) return;
          localizedPerFormatUrls[locale] = {
            ...(localizedPerFormatUrls[locale] ?? {}),
            [format.id]: uploaded.publicUrl,
          };
        })
      )
    );

    const refreshed = {
      atlasUrl: atlasUpload?.publicUrl,
      atlasAssetId: atlasUpload?.id,
      localizedPerFormatUrls,
      sourceNativePerFormatUrls,
    };

    // Persist to Convex so the next /inspect render, Discord embed, and
    // actual publisher media URLs all see the latest text edits.
    const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
    if (convexUrl) {
      try {
        const client = new ConvexHttpClient(convexUrl);
        const patchArgs: Record<string, unknown> = {
          variationId: variation.id,
          localizedPerFormatUrls: refreshed.localizedPerFormatUrls,
        };
        if (refreshed.atlasUrl) patchArgs.atlasUrl = refreshed.atlasUrl;
        if (refreshed.atlasAssetId) patchArgs.atlasAssetId = refreshed.atlasAssetId;
        await client.mutation(campaignsAnyApi.setVariationRenderedMedia as never, {
          ...patchArgs,
        } as never);
      } catch {
        // Media re-render still succeeded; just log-skip persistence.
        // eslint-disable-next-line no-console
        console.warn('[post-now] setVariationRenderedMedia mutation failed; in-memory only');
      }
    }
    return refreshed;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      '[post-now] media refresh failed:',
      err instanceof Error ? err.message : String(err)
    );
    return undefined;
  }
}

/**
 * Convex variation rows match AutoModeVariationResult on every field
 * scheduleVariationPosts actually reads (status / heroImageUrl /
 * scheduleWhenLocal / caption / hashtags / index / nativePerFormatUrls /
 * schedulePlatform). The cast is safe for that subset; the agent-run-only
 * fields (agentSteps, agentFinalText) aren't read on the post path.
 */
function variationToScheduleInput(
  variation: ConvexVariation
): AutoModeVariationResult {
  return {
    index: variation.index,
    status: variation.status === 'ready' ? 'ready' : 'failed',
    heroDirectionId: variation.heroDirectionId,
    heroImageUrl: variation.heroImageUrl,
    caption: variation.caption,
    hashtags: variation.hashtags,
    schedulePlatform: variation.schedulePlatform,
    scheduleWhenLocal: variation.scheduleWhenLocal,
    nativePerFormatUrls: variation.nativePerFormatUrls,
    localizedPerFormatUrls: variation.localizedPerFormatUrls,
    atlasUrl: variation.atlasUrl,
    textOverlays: Array.isArray(variation.textOverlays)
      ? (variation.textOverlays as AutoModeVariationResult['textOverlays'])
      : undefined,
    agentSteps: [],
    agentFinalText: '',
  };
}

export async function POST(request: Request) {
  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return NextResponse.json(
      { ok: false, error: 'request body must be JSON' },
      { status: 400 }
    );
  }

  const { campaignId, variationIndex, workspaceId } = body;
  if (typeof campaignId !== 'string' || campaignId.trim().length === 0) {
    return NextResponse.json(
      { ok: false, error: 'campaignId is required' },
      { status: 400 }
    );
  }
  if (typeof variationIndex !== 'number' || !Number.isInteger(variationIndex)) {
    return NextResponse.json(
      { ok: false, error: 'variationIndex must be an integer' },
      { status: 400 }
    );
  }

  try {
    const loaded = await loadVariationFromConvex(campaignId, variationIndex);
    if (!loaded) {
      return NextResponse.json(
        { ok: false, error: 'variation not found in Convex' },
        { status: 404 }
      );
    }
    const variation = loaded.variation;
    if (variation.status === 'failed') {
      return NextResponse.json(
        { ok: false, error: 'cannot post a failed variation' },
        { status: 422 }
      );
    }
    if (!variation.heroImageUrl) {
      return NextResponse.json(
        { ok: false, error: 'variation has no heroImageUrl' },
        { status: 422 }
      );
    }
    if (!variation.scheduleWhenLocal) {
      return NextResponse.json(
        { ok: false, error: 'variation has no scheduleWhenLocal' },
        { status: 422 }
      );
    }

    const url = new URL(request.url);
    const debug = url.searchParams.get('debug') === '1';
    const baseUrl = `${url.protocol}//${url.host}`;
    const wsId = workspaceId ?? loaded.campaign.workspaceId;
    const selection = resolveBodyPublishSelection(body);
    const sourceNativePerFormatUrls = { ...(variation.nativePerFormatUrls ?? {}) };

    // Re-render share media from the latest Convex text overlays before
    // scheduling. Fail-soft: if compose/upload fails, post the existing URLs.
    const refreshedMedia = await maybeRefreshRenderedMedia(variation);
    if (refreshedMedia?.atlasUrl) {
      variation.atlasUrl = refreshedMedia.atlasUrl;
    }
    if (refreshedMedia?.localizedPerFormatUrls) {
      variation.localizedPerFormatUrls = refreshedMedia.localizedPerFormatUrls;
    }

    const scheduleInput = variationToScheduleInput(variation);
    const requestedPlatforms = selection.targetPlatforms ?? [];
    const requestedLocales = selection.targetLocales ?? [];
    const requestedPosts =
      requestedPlatforms.length > 0 && requestedLocales.length > 0
        ? composePublishPostsForVariation({
            variation: scheduleInput,
            platforms: requestedPlatforms,
            locales: requestedLocales,
            scheduledAt: new Date(Date.now() + 30_000).toISOString(),
          })
        : [];
    const expectedPostCount = requestedPlatforms.length * requestedLocales.length;
    if (expectedPostCount > 0 && requestedPosts.length !== expectedPostCount) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'selected platform/language is missing native media or valid localized copy',
          selection,
          publishableCount: requestedPosts.length,
          requestedCount: expectedPostCount,
        },
        { status: 422 }
      );
    }

    const scheduledPostIds = await scheduleVariationPosts({
      variations: [scheduleInput],
      workspaceId: wsId,
      baseUrl,
      forcePostNow: true,
      campaignId,
      targetPlatforms: selection.targetPlatforms,
      targetLocales: selection.targetLocales,
    });

    return NextResponse.json({
      ok: true,
      variationIndex,
      selection,
      scheduledCount: scheduledPostIds.length,
      ...(debug
        ? {
            campaignId,
            scheduledPostIds,
            posts: requestedPosts.map((post) => ({
              platform: post.platform,
              locale: post.locale,
              format: post.format,
              mediaUrls: post.mediaUrls,
              sourceNativeMediaUrl: isFormatId(post.format)
                ? refreshedMedia?.sourceNativePerFormatUrls?.[post.format] ??
                  sourceNativePerFormatUrls[post.format]
                : undefined,
              caption: post.caption,
              hashtags: post.hashtags,
            })),
          }
        : {}),
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const campaignId = url.searchParams.get('c') ?? '';
  const v = url.searchParams.get('v') ?? '';
  const variationIndex = Number(v);
  const wsId = url.searchParams.get('ws') ?? undefined;
  const baseOrigin = `${url.protocol}//${url.host}`;
  const selection = parseDiscordPublishSelection(url.searchParams);

  if (!campaignId || !Number.isInteger(variationIndex)) {
    return new NextResponse(
      `<!doctype html><meta charset="utf-8"><title>Aether — bad post-now</title>
      <body style="font-family:system-ui;padding:32px;background:#0a0a0a;color:#fafafa;">
      <h2>Post-now link is malformed</h2>
      <p>Missing or invalid <code>c</code> (campaign id) / <code>v</code> (variation index).</p>
      </body>`,
      { status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }

  const synthBody: RequestBody = {
    campaignId,
    variationIndex,
    workspaceId: wsId,
    platforms: selection.platforms,
    locales: selection.locales,
  };
  let result: {
    ok: boolean;
    error?: string;
    scheduledPostIds?: string[];
    selection?: {
      targetPlatforms?: PublishPlatform[];
      targetLocales?: LocaleCode[];
    };
  };
  try {
    const synthReq = new Request(request.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(synthBody),
    });
    const res = await POST(synthReq);
    result = (await res.json()) as typeof result;
  } catch (err) {
    result = {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  const heading = result.ok
    ? `Posting v${variationIndex} now`
    : `Post-now failed for v${variationIndex}`;
  const selectedPlatforms =
    result.selection?.targetPlatforms?.join(', ') ||
    selection.platforms.join(', ') ||
    'configured platforms';
  const selectedLocales =
    result.selection?.targetLocales?.join(', ') ||
    selection.locales.join(', ') ||
    'configured language';
  const debug = url.searchParams.get('debug') === '1';
  const body = result.ok
    ? `<p>Posting ${escapeHtml(selectedPlatforms)} in ${escapeHtml(selectedLocales)}. Watch Discord for the live link.</p>
       ${
         debug && (result.scheduledPostIds ?? []).length > 0
           ? `<p style="opacity:0.6;font-size:13px;font-family:Menlo,Consolas,monospace;">
                scheduled ids: ${(result.scheduledPostIds ?? []).map(escapeHtml).join(', ')}
              </p>`
           : ''
       }`
    : `<p>${escapeHtml(result.error ?? 'unknown error')}</p>`;

  const html = `<!doctype html><meta charset="utf-8"><title>Aether — post v${variationIndex}</title>
  <body style="font-family:system-ui,-apple-system,sans-serif;padding:48px;background:#0a0a0a;color:#fafafa;line-height:1.5;">
    <h2 style="margin-top:0">${escapeHtml(heading)}</h2>
    ${body}
    <p style="margin-top:24px"><a href="${escapeHtml(baseOrigin)}/inspect/${encodeURIComponent(campaignId)}" style="color:#7eb6ff">Review the full lap in Aether</a></p>
    <p style="opacity:0.5;font-size:13px;margin-top:32px;font-family:Menlo,Consolas,monospace;">campaign=${escapeHtml(campaignId)} · v${variationIndex}</p>
  </body>`;
  return new NextResponse(html, {
    status: result.ok ? 200 : 500,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
