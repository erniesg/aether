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

  type Signal = { title: string; platform?: string; lift?: string };

  const inputs: ProposeCampaignInputs = {
    brandSnapshot: isObject(b.brandSnapshot)
      ? (b.brandSnapshot as unknown as BrandSnapshot)
      : undefined,
    offerSnapshot: isObject(b.offerSnapshot)
      ? (b.offerSnapshot as ProposeCampaignInputs['offerSnapshot'])
      : undefined,
    signals: Array.isArray(b.signals)
      ? (b.signals as unknown[])
          .map((entry): Signal | null => {
            if (!isObject(entry)) return null;
            const title = typeof entry.title === 'string' ? entry.title : '';
            if (!title) return null;
            const signal: Signal = { title };
            if (typeof entry.platform === 'string') signal.platform = entry.platform;
            if (typeof entry.lift === 'string') signal.lift = entry.lift;
            return signal;
          })
          .filter((x): x is Signal => x !== null)
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
