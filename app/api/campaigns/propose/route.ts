import { NextResponse } from 'next/server';
import { proposeCampaign } from '@/lib/campaigns/propose';
import type { ProposeCampaignInputs } from '@/lib/campaigns/propose';
import type { BrandSnapshot } from '@/lib/brand/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/campaigns/propose
 * body: { brandSnapshot?, offerSnapshot?, signals?, bypassAgent? }
 * Returns { ok: true, proposal: { name, intent, formats, tone, briefBody } }
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: 'invalid JSON body' },
      { status: 400 }
    );
  }
  if (typeof body !== 'object' || body === null) {
    return NextResponse.json(
      { ok: false, error: 'body must be an object' },
      { status: 400 }
    );
  }

  const b = body as Record<string, unknown>;
  const bypassAgent = b.bypassAgent === true;

  const inputs: ProposeCampaignInputs = {
    brandSnapshot:
      isObject(b.brandSnapshot) ? (b.brandSnapshot as BrandSnapshot) : undefined,
    offerSnapshot: isObject(b.offerSnapshot)
      ? (b.offerSnapshot as ProposeCampaignInputs['offerSnapshot'])
      : undefined,
    signals: Array.isArray(b.signals)
      ? (b.signals as unknown[])
          .map((entry) => {
            if (!isObject(entry)) return null;
            const e = entry as Record<string, unknown>;
            const title = typeof e.title === 'string' ? e.title : '';
            if (!title) return null;
            const platform = typeof e.platform === 'string' ? e.platform : undefined;
            const lift = typeof e.lift === 'string' ? e.lift : undefined;
            return { title, platform, lift };
          })
          .filter((x): x is { title: string; platform?: string; lift?: string } => x !== null)
      : undefined,
  };

  try {
    const proposal = await proposeCampaign(inputs, { bypassAgent });
    return NextResponse.json({ ok: true, proposal });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
