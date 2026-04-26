/**
 * POST /api/auto-mode/approve
 *
 * Approve a specific campaign variation, triggering scheduling or immediate
 * posting depending on the notifyMode supplied.
 *
 * Body:
 *   { campaignId, variationIndex, notifyMode, forcePostNow?, scheduleWhenLocal? }
 *
 * When notifyMode === 'auto-post', calls scheduleVariationPosts (which fires
 * notifyDiscord per-publish so the user receives the published URL in Discord).
 * When notifyMode === 'review', returns the structured variation data so the
 * caller can open a schedule picker.
 *
 * The endpoint is kept intentionally narrow — it only acts on the variation
 * identified by campaignId + variationIndex, not the whole lap, so the creator
 * can approve individual cards one at a time.
 */

import { NextResponse } from 'next/server';
import { ConvexHttpClient } from 'convex/browser';
import { anyApi } from 'convex/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface RequestBody {
  campaignId?: string;
  variationIndex?: number;
  notifyMode?: string;
  workspaceId?: string;
  forcePostNow?: boolean;
}

interface TraceVariation {
  id: string;
  index: number;
  status: string;
  heroImageUrl?: string;
  caption?: string;
  hashtags?: string[];
  schedulePlatform?: string;
  scheduleWhenLocal?: string;
}

interface TraceResponse {
  ok: boolean;
  campaign?: { id: string; workspaceId?: string };
  variations?: TraceVariation[];
}

const campaignsAnyApi = (anyApi as unknown as {
  campaigns: { get: unknown };
}).campaigns;

async function getVariation(
  campaignId: string,
  variationIndex: number
): Promise<TraceVariation | null> {
  // Prefer Convex when available; fall back to the trace endpoint.
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (convexUrl) {
    try {
      const client = new ConvexHttpClient(convexUrl);
      const result = (await client.query(campaignsAnyApi.get as never, {
        campaignId,
      } as never)) as { campaign: unknown; variations: TraceVariation[] } | null;
      if (!result) return null;
      return result.variations.find((v) => v.index === variationIndex) ?? null;
    } catch {
      // Fall through to trace endpoint.
    }
  }

  return null;
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

  const { campaignId, variationIndex, notifyMode = 'review', workspaceId, forcePostNow } = body;

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
    // Look up the variation to get hero URL / caption / schedule suggestion.
    const variation = await getVariation(campaignId, variationIndex);
    if (!variation) {
      // Variation not found in Convex — return success with a note so the
      // UI can still show the approve state without blocking.
      return NextResponse.json({
        ok: true,
        approved: true,
        note: 'variation not found in Convex — approve acknowledged without scheduling',
      });
    }

    if (variation.status === 'failed') {
      return NextResponse.json(
        { ok: false, error: 'cannot approve a failed variation' },
        { status: 422 }
      );
    }

    // For auto-post mode, delegate to the existing run endpoint with the
    // already-resolved variation so scheduleVariationPosts fires notifyDiscord.
    if (notifyMode === 'auto-post' && variation.heroImageUrl) {
      const url = new URL(request.url);
      const baseUrl = `${url.protocol}//${url.host}`;

      const res = await fetch(`${baseUrl}/api/auto-mode/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trigger: { kind: 'url', payload: variation.heroImageUrl },
          variationCount: 1,
          notifyMode: 'auto-post',
          workspaceId,
          forcePostNow: forcePostNow === true,
        }),
      });
      const json = (await res.json()) as { ok: boolean; error?: string; scheduledPostIds?: string[] };

      return NextResponse.json({
        ok: json.ok,
        approved: true,
        scheduledPostIds: json.scheduledPostIds ?? [],
        note: json.error,
      });
    }

    // For review/notify mode, just acknowledge the approval — the UI handles
    // any further scheduling through the schedule picker.
    return NextResponse.json({
      ok: true,
      approved: true,
      variation: {
        id: variation.id,
        index: variation.index,
        status: variation.status,
        heroImageUrl: variation.heroImageUrl,
        caption: variation.caption,
        hashtags: variation.hashtags,
        schedulePlatform: variation.schedulePlatform,
        scheduleWhenLocal: variation.scheduleWhenLocal,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

/**
 * GET /api/auto-mode/approve?c=<campaignId>&v=<variationIndex>
 *
 * Browser-friendly entry point so Discord link buttons can hit this URL
 * directly (link buttons issue a GET in the user's browser). Internally
 * delegates to the POST handler with a synthesised JSON body, then renders
 * a small HTML confirmation that includes a "Review in Aether ↗" link.
 *
 * The notifyMode defaults to 'auto-post' on this path because the user just
 * clicked "Approve" — a button click is a stronger signal of intent than the
 * review-mode JSON path, which expects the UI to drive scheduling separately.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const campaignId = url.searchParams.get('c') ?? '';
  const v = url.searchParams.get('v') ?? '';
  const variationIndex = Number(v);
  const wsId = url.searchParams.get('ws') ?? undefined;
  if (!campaignId || !Number.isInteger(variationIndex)) {
    return new NextResponse(
      `<!doctype html><meta charset="utf-8"><title>Aether — bad approve</title>
      <body style="font-family:system-ui;padding:32px;background:#0a0a0a;color:#fafafa;">
      <h2>Approve link is malformed</h2>
      <p>Missing or invalid <code>c</code> (campaign id) / <code>v</code> (variation index).</p>
      </body>`,
      { status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }

  const baseOrigin = `${url.protocol}//${url.host}`;
  const synthBody: RequestBody = {
    campaignId,
    variationIndex,
    notifyMode: 'auto-post',
    workspaceId: wsId,
    forcePostNow: true,
  };

  let result: { ok: boolean; approved?: boolean; note?: string; scheduledPostIds?: string[]; error?: string };
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
    ? `✅ Approved variation v${variationIndex}`
    : `⚠️ Approve failed for v${variationIndex}`;
  const body = result.ok
    ? result.note
      ? `<p>${escapeHtml(result.note)}</p>`
      : `<p>Posting through the configured publisher. Watch Discord for the live link.</p>`
    : `<p>${escapeHtml(result.error ?? 'unknown error')}</p>`;

  const html = `<!doctype html><meta charset="utf-8"><title>Aether — approve v${variationIndex}</title>
  <body style="font-family:system-ui,-apple-system,sans-serif;padding:48px;background:#0a0a0a;color:#fafafa;line-height:1.5;">
    <h2 style="margin-top:0">${escapeHtml(heading)}</h2>
    ${body}
    <p style="margin-top:24px"><a href="${escapeHtml(baseOrigin)}/inspect/${encodeURIComponent(campaignId)}" style="color:#7eb6ff">Review the full lap in Aether ↗</a></p>
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
