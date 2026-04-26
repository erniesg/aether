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
 *   500 — Convex mutation failed
 */

import { NextResponse } from 'next/server';
import { ConvexHttpClient } from 'convex/browser';
import { anyApi } from 'convex/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const campaignsApi = (anyApi as unknown as {
  campaigns: { updateVariationOverlay: unknown };
}).campaigns;

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as {
    variationId?: string;
    locale?: string;
    format?: string;
    scope?: string;
    role?: string;
    text?: string;
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

  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) {
    // No Convex deployment — canvas propagation already happened client-side.
    // Return success so the caller's fire-and-forget doesn't log an error.
    return NextResponse.json({ ok: true, skipped: 'no-convex' });
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
      locale,
      format,
      scope,
      role,
      text,
    } as never);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[overlay] Convex mutation failed:', err);
    return NextResponse.json(
      { ok: false, error: 'convex mutation failed' },
      { status: 500 }
    );
  }
}
