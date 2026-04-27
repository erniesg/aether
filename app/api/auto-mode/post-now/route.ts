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
  composeAndUploadAtlas,
  scheduleVariationPosts,
  type AutoModeVariationResult,
  type LocaleCode,
} from '@/lib/agent/auto-mode';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface RequestBody {
  campaignId?: string;
  variationIndex?: number;
  workspaceId?: string;
}

interface ConvexCampaign {
  id: string;
  workspaceId?: string;
}

interface ConvexVariation {
  id: string;
  index: number;
  status: string;
  heroImageUrl?: string;
  caption?: string;
  captionsByLocale?: Partial<Record<LocaleCode, string>>;
  hashtags?: string[];
  schedulePlatform?: string;
  scheduleWhenLocal?: string;
  nativePerFormatUrls?: Partial<Record<'1x1' | '4x5' | '9x16' | '16x9', string>>;
  atlasUrl?: string;
  textOverlays?: unknown;
  agentRunIds?: unknown;
}

const campaignsAnyApi = (anyApi as unknown as {
  campaigns: { get: unknown; setVariationAtlas: unknown };
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

/**
 * Re-render the atlas from the variation's current `textOverlays` (which
 * receive canvas-side edits via `campaigns.updateVariationOverlay`) and
 * upload the result. Returns the new public URL on success, undefined on
 * any failure (refresh is best-effort — posting itself shouldn't fail
 * just because the preview thumbnail couldn't be re-rendered).
 *
 * Side-effect: when refresh succeeds, persists the new URL to Convex so
 * /inspect and any future Discord embed reads see it too.
 */
async function maybeRefreshAtlas(
  variation: ConvexVariation
): Promise<string | undefined> {
  if (!variation.heroImageUrl) return undefined;
  if (variation.heroImageUrl.startsWith('data:')) return undefined;

  const overlays = (variation.textOverlays ?? undefined) as
    | ReadonlyArray<unknown>
    | undefined;
  // No overlays means the original atlas had no creator-supplied text to
  // begin with — re-rendering would just produce the same composition,
  // so skip the round trip.
  if (!overlays || overlays.length === 0) return undefined;

  try {
    const refreshed = await composeAndUploadAtlas({
      heroSource: variation.heroImageUrl,
      textOverlays: overlays as Parameters<typeof composeAndUploadAtlas>[0]['textOverlays'],
      captionsByLocale: variation.captionsByLocale,
    });
    if (!refreshed) return undefined;

    // Persist to Convex so the next /inspect render and any future
    // Discord ping (which reads variation.atlasUrl) see the fresh URL.
    const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
    if (convexUrl) {
      try {
        const client = new ConvexHttpClient(convexUrl);
        await client.mutation(campaignsAnyApi.setVariationAtlas as never, {
          variationId: variation.id,
          atlasUrl: refreshed.publicUrl,
          atlasAssetId: refreshed.assetId,
        } as never);
      } catch {
        // Atlas re-render still succeeded; just log-skip persistence.
        // eslint-disable-next-line no-console
        console.warn('[post-now] setVariationAtlas mutation failed; in-memory only');
      }
    }
    return refreshed.publicUrl;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      '[post-now] atlas refresh failed:',
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
    heroImageUrl: variation.heroImageUrl,
    caption: variation.caption,
    hashtags: variation.hashtags,
    schedulePlatform: variation.schedulePlatform,
    scheduleWhenLocal: variation.scheduleWhenLocal,
    nativePerFormatUrls: variation.nativePerFormatUrls,
    atlasUrl: variation.atlasUrl,
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
    const baseUrl = `${url.protocol}//${url.host}`;
    const wsId = workspaceId ?? loaded.campaign.workspaceId;

    // Path A from the canvas-as-source-of-truth handoff: re-render the
    // atlas against the LATEST Convex `textOverlays` so creator edits
    // (made after the lap completed) propagate to the published preview
    // thumbnail. Fail-soft — if compose / upload errors, post anyway with
    // the stale atlas. Path B (tldraw export of actual canvas frames) is
    // the real answer for non-text edits and is tracked for follow-up.
    const refreshedAtlasUrl = await maybeRefreshAtlas(variation);
    if (refreshedAtlasUrl) {
      variation.atlasUrl = refreshedAtlasUrl;
    }

    const scheduledPostIds = await scheduleVariationPosts({
      variations: [variationToScheduleInput(variation)],
      workspaceId: wsId,
      baseUrl,
      forcePostNow: true,
      campaignId,
    });

    return NextResponse.json({
      ok: true,
      campaignId,
      variationIndex,
      scheduledPostIds,
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

  const synthBody: RequestBody = { campaignId, variationIndex, workspaceId: wsId };
  let result: {
    ok: boolean;
    error?: string;
    scheduledPostIds?: string[];
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
  const body = result.ok
    ? `<p>Firing every configured publisher (T-30s scheduling). Watch Discord for the live link.</p>
       ${
         (result.scheduledPostIds ?? []).length > 0
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
