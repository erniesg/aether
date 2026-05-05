/**
 * POST /api/campaigns/overlay
 *
 * Persists a text overlay edit from the canvas (Lane A — global/local
 * text propagation). Called by buildGlobalTextPropagator in
 * lib/auto-mode/canvas.ts when the creator edits a global-scoped text shape.
 *
 * Body: VariationOverlayUpdate
 *   { variationId, locale, format, scope, role, text }
 *
 * When Convex is available, calls campaigns.updateVariationOverlay mutation.
 * When Convex is absent (dev without NEXT_PUBLIC_CONVEX_URL), returns 200 OK
 * as a no-op so canvas propagation still works offline.
 *
 * Error semantics:
 *   400 — missing required fields
 *
 * Convex mutation failures are intentionally fail-soft. Canvas propagation has
 * already happened client-side by the time this endpoint is called; returning a
 * hard 500 in local dev makes the creator loop look broken even though only
 * persistence is unavailable.
 */

import { NextResponse } from 'next/server';
import { ConvexHttpClient } from 'convex/browser';
import { anyApi } from 'convex/server';
import { translateCanvasCopy } from '@/lib/agent/translate-copy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const campaignsApi = (anyApi as unknown as {
  campaigns: { updateVariationOverlay: unknown };
}).campaigns;

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as {
    variationId?: string;
    heroDirectionId?: string;
    locale?: string;
    format?: string;
    scope?: string;
    role?: string;
    text?: string;
    translateLinked?: boolean;
    targetLocales?: string[];
    translations?: Record<string, string>;
    overwriteTranslations?: boolean;
  };

  const { variationId, locale, format, scope, role, text } = body;

  if (!variationId || !locale || !format || !scope || !role || text === undefined) {
    return NextResponse.json(
      { ok: false, error: 'missing required fields' },
      { status: 400 }
    );
  }

  if (scope !== 'global' && scope !== 'local') {
    return NextResponse.json(
      { ok: false, error: 'scope must be "global" or "local"' },
      { status: 400 }
    );
  }

  const targetLocales = Array.isArray(body.targetLocales)
    ? body.targetLocales.filter((locale): locale is string => typeof locale === 'string')
    : [];
  const translations =
    body.translateLinked === true && locale === 'en-SG'
      ? {
          ...(await translateCanvasCopy({
            text,
            sourceLocale: locale,
            targetLocales,
            role,
          })),
          ...readStringTranslations(body.translations),
        }
      : {};

  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) {
    // No Convex deployment — canvas propagation already happened client-side.
    // Return success so the caller's fire-and-forget doesn't log an error.
    return NextResponse.json({ ok: true, skipped: 'no-convex', translations });
  }

  try {
    const client = new ConvexHttpClient(convexUrl);
    const deployKey = process.env.CONVEX_DEPLOY_KEY;
    if (deployKey) {
      const c = client as unknown as { setAdminAuth?: (k: string) => void };
      if (typeof c.setAdminAuth === 'function') c.setAdminAuth(deployKey);
    }

    await client.mutation(campaignsApi.updateVariationOverlay as never, {
      variationId,
      heroDirectionId: body.heroDirectionId,
      locale,
      format,
      scope,
      role,
      text,
      translateLinked: body.translateLinked === true,
      targetLocales,
      translations,
      overwriteTranslations: body.overwriteTranslations === true,
    } as never);

    return NextResponse.json({ ok: true, persisted: true, translations });
  } catch (err) {
    console.error('[overlay] Convex mutation failed:', err);
    return NextResponse.json({
      ok: true,
      persisted: false,
      skipped: 'convex-unavailable',
      translations,
      warning: 'canvas edit applied locally; overlay persistence will retry on the next saved edit when Convex is available',
    });
  }
}

function readStringTranslations(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [locale, text] of Object.entries(value)) {
    if (typeof text === 'string' && text.trim()) out[locale] = text;
  }
  return out;
}
