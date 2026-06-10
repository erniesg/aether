import { NextResponse } from 'next/server';
import { ConvexHttpClient } from 'convex/browser';
import { anyApi } from 'convex/server';
import {
  buildReferenceAccountDigest,
  type ReferenceAccountPost,
} from '@/lib/research/account-analysis';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const presenceInsightsApi = (anyApi as unknown as {
  presenceInsights: { listReferencePosts: unknown };
}).presenceInsights;

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
      digest: buildReferenceAccountDigest([]),
    });
  }

  const client = new ConvexHttpClient(convexUrl);
  const deployKey = process.env.CONVEX_DEPLOY_KEY;
  if (deployKey) {
    const adminClient = client as unknown as { setAdminAuth?: (key: string) => void };
    if (typeof adminClient.setAdminAuth === 'function') adminClient.setAdminAuth(deployKey);
  }

  const posts = (await client.query(presenceInsightsApi.listReferencePosts as never, {
    workspaceId,
    profileId,
  } as never)) as ReferenceAccountPost[];

  return NextResponse.json({
    ok: true,
    workspaceId,
    profileId,
    digest: buildReferenceAccountDigest(posts),
  });
}
