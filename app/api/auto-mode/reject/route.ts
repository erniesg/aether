/**
 * GET /api/auto-mode/reject?c=<campaignId>&v=<variationIndex>
 *
 * Browser-friendly reject endpoint, hit from the Discord lap-end action
 * row. Looks up the variation by (campaignId, variationIndex), calls the
 * Convex `campaigns.rejectVariation` mutation, and renders an HTML
 * confirmation page with a link back to the inspect view.
 *
 * No POST handler — rejection is a single-shot side-effect that suits a
 * link button. If callers need a programmatic JSON path later, add POST
 * here following the approve route's pattern.
 */

import { NextResponse } from 'next/server';
import { ConvexHttpClient } from 'convex/browser';
import { anyApi } from 'convex/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const campaignsAnyApi = (anyApi as unknown as {
  campaigns: { get: unknown; rejectVariation: unknown };
}).campaigns;

interface VariationRecord {
  id: string;
  index: number;
  status: string;
}

async function lookupVariation(
  campaignId: string,
  variationIndex: number
): Promise<VariationRecord | null> {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) return null;
  try {
    const client = new ConvexHttpClient(convexUrl);
    const result = (await client.query(campaignsAnyApi.get as never, {
      campaignId,
    } as never)) as { variations: VariationRecord[] } | null;
    if (!result) return null;
    return result.variations.find((v) => v.index === variationIndex) ?? null;
  } catch {
    return null;
  }
}

async function fireReject(variationId: string): Promise<{ ok: boolean; error?: string }> {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) return { ok: false, error: 'Convex not configured' };
  try {
    const client = new ConvexHttpClient(convexUrl);
    await client.mutation(campaignsAnyApi.rejectVariation as never, {
      variationId,
    } as never);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const campaignId = url.searchParams.get('c') ?? '';
  const v = url.searchParams.get('v') ?? '';
  const variationIndex = Number(v);
  if (!campaignId || !Number.isInteger(variationIndex)) {
    return new NextResponse(
      `<!doctype html><meta charset="utf-8"><title>Aether — bad reject</title>
      <body style="font-family:system-ui;padding:32px;background:#0a0a0a;color:#fafafa;">
      <h2>Reject link is malformed</h2>
      <p>Missing or invalid <code>c</code> (campaign id) / <code>v</code> (variation index).</p>
      </body>`,
      { status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }

  const baseOrigin = `${url.protocol}//${url.host}`;
  const variation = await lookupVariation(campaignId, variationIndex);
  if (!variation) {
    return new NextResponse(
      htmlPage({
        baseOrigin,
        campaignId,
        variationIndex,
        ok: false,
        body: `<p>Variation v${variationIndex} not found in Convex.</p>`,
      }),
      { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }

  const result = await fireReject(variation.id);

  return new NextResponse(
    htmlPage({
      baseOrigin,
      campaignId,
      variationIndex,
      ok: result.ok,
      body: result.ok
        ? `<p>Variation marked as rejected. The right-rail card will update on its next subscription tick.</p>`
        : `<p>${escapeHtml(result.error ?? 'unknown error')}</p>`,
    }),
    {
      status: result.ok ? 200 : 500,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    }
  );
}

function htmlPage(input: {
  baseOrigin: string;
  campaignId: string;
  variationIndex: number;
  ok: boolean;
  body: string;
}): string {
  const heading = input.ok
    ? `✖️ Rejected variation v${input.variationIndex}`
    : `⚠️ Reject failed for v${input.variationIndex}`;
  return `<!doctype html><meta charset="utf-8"><title>Aether — reject v${input.variationIndex}</title>
  <body style="font-family:system-ui,-apple-system,sans-serif;padding:48px;background:#0a0a0a;color:#fafafa;line-height:1.5;">
    <h2 style="margin-top:0">${escapeHtml(heading)}</h2>
    ${input.body}
    <p style="margin-top:24px"><a href="${escapeHtml(input.baseOrigin)}/inspect/${encodeURIComponent(input.campaignId)}" style="color:#7eb6ff">Review the full lap in Aether ↗</a></p>
    <p style="opacity:0.5;font-size:13px;margin-top:32px;font-family:Menlo,Consolas,monospace;">campaign=${escapeHtml(input.campaignId)} · v${input.variationIndex}</p>
  </body>`;
}

function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
