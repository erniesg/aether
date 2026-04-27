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
  hashtags?: string[];
  schedulePlatform?: string;
  scheduleWhenLocal?: string;
  nativePerFormatUrls?: Partial<Record<'1x1' | '4x5' | '9x16' | '16x9', string>>;
  atlasUrl?: string;
  agentRunIds?: unknown;
}

const campaignsAnyApi = (anyApi as unknown as {
  campaigns: { get: unknown };
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
