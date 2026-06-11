import { NextResponse } from 'next/server';
import { ConvexHttpClient } from 'convex/browser';
import { anyApi } from 'convex/server';
import {
  buildPresenceLedgerRollup,
  type PresencePostMetric,
} from '@/lib/research/presence-metrics';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const presenceLedgerApi = (anyApi as unknown as {
  presenceLedger: { listMetrics: unknown };
}).presenceLedger;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const workspaceId = url.searchParams.get('workspaceId')?.trim() || 'demo-ws';
  const profileId = url.searchParams.get('profileId')?.trim();
  if (!profileId) {
    return NextResponse.json(
      { ok: false, error: 'profileId is required' },
      { status: 400 }
    );
  }

  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) {
    return NextResponse.json({
      ok: true,
      workspaceId,
      profileId,
      ledger: buildPresenceLedgerRollup([]),
    });
  }

  const client = new ConvexHttpClient(convexUrl);
  const deployKey = process.env.CONVEX_DEPLOY_KEY;
  if (deployKey) {
    const adminClient = client as unknown as { setAdminAuth?: (key: string) => void };
    if (typeof adminClient.setAdminAuth === 'function') adminClient.setAdminAuth(deployKey);
  }
  const metrics = (await client.query(presenceLedgerApi.listMetrics as never, {
    workspaceId,
    profileId,
  } as never)) as PresencePostMetric[];

  return NextResponse.json({
    ok: true,
    workspaceId,
    profileId,
    ledger: buildPresenceLedgerRollup(metrics),
  });
}
