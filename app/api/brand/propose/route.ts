import { NextResponse } from 'next/server';
import type { BrandSnapshot } from '@/lib/brand/types';
import { proposeBrandFollowups, type ProposeScope } from '@/lib/brand/propose';
import {
  recordProposedCampaigns,
  recordProposedOffers,
} from '@/lib/proposals/server';

// All aether API routes use the Node.js runtime so opennextjs-cloudflare
// can bundle them into a single Worker without per-route splitting.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isValidScope(value: unknown): value is ProposeScope {
  return value === 'all' || value === 'offers' || value === 'campaigns';
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid JSON body' }, { status: 400 });
  }

  if (!body || typeof body !== 'object') {
    return NextResponse.json({ ok: false, error: 'request body must be a JSON object' }, { status: 400 });
  }

  const { snapshot, workspaceId, scope: rawScope } = body as Record<string, unknown>;
  if (!snapshot || typeof snapshot !== 'object') {
    return NextResponse.json(
      { ok: false, error: 'snapshot is required and must be a BrandSnapshot object' },
      { status: 400 }
    );
  }

  const scope: ProposeScope = isValidScope(rawScope) ? rawScope : 'all';

  try {
    const followups = await proposeBrandFollowups({
      snapshot: snapshot as BrandSnapshot,
      scope,
    });

    // Persist the AI-suggested rows so the OfferSection / CampaignSection
    // rails can subscribe via Convex. No-op when Convex isn't provisioned —
    // the response body still carries the followups for memory-mode clients.
    if (typeof workspaceId === 'string' && workspaceId.length > 0) {
      const writes: Array<Promise<void>> = [];
      if (scope === 'all' || scope === 'offers') {
        writes.push(recordProposedOffers(workspaceId, followups.offers));
      }
      if (scope === 'all' || scope === 'campaigns') {
        writes.push(recordProposedCampaigns(workspaceId, followups.campaigns));
      }
      await Promise.all(writes);
    }

    return NextResponse.json({
      ok: true,
      offers: followups.offers,
      campaigns: followups.campaigns,
      coverage: followups.coverage,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ok: false, code: 'propose_failed', error: message },
      { status: 400 }
    );
  }
}
