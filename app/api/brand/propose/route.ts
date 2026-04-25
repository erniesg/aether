import { NextResponse } from 'next/server';
import type { BrandSnapshot } from '@/lib/brand/types';
import { proposeBrandFollowups } from '@/lib/brand/propose';

// All aether API routes use the Node.js runtime so opennextjs-cloudflare
// can bundle them into a single Worker without per-route splitting.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

  const { snapshot } = body as Record<string, unknown>;
  if (!snapshot || typeof snapshot !== 'object') {
    return NextResponse.json(
      { ok: false, error: 'snapshot is required and must be a BrandSnapshot object' },
      { status: 400 }
    );
  }

  try {
    const followups = await proposeBrandFollowups({ snapshot: snapshot as BrandSnapshot });
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
