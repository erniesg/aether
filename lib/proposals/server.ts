import { ConvexHttpClient } from 'convex/browser';
import { anyApi } from 'convex/server';
import type { CampaignContext, OfferContext } from '@/lib/context/model';

/**
 * Server-side recorder for AI-suggested offer / campaign proposals.
 *
 * Brand-propose runs the workers, then asks the recorder to write the drafts
 * into Convex so the rails can subscribe. No-op when Convex is not provisioned
 * (staging without NEXT_PUBLIC_CONVEX_URL / CONVEX_DEPLOY_KEY) — the route
 * still returns the followups in its response so memory-mode clients work.
 */

let httpClient: ConvexHttpClient | null = null;

function getHttpClient(): ConvexHttpClient | null {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  const key = process.env.CONVEX_DEPLOY_KEY;
  if (!url || !key) return null;
  if (!httpClient) {
    httpClient = new ConvexHttpClient(url);
    const client = httpClient as unknown as { setAdminAuth?: (k: string) => void };
    if (typeof client.setAdminAuth === 'function') client.setAdminAuth(key);
  }
  return httpClient;
}

const proposalsApi = (anyApi as unknown as {
  proposals: { replaceProposedOffers: unknown; replaceProposedCampaigns: unknown };
}).proposals;

export async function recordProposedOffers(
  workspaceId: string,
  offers: OfferContext[]
): Promise<void> {
  const client = getHttpClient();
  if (!client) return;
  try {
    await client.mutation(proposalsApi.replaceProposedOffers as never, {
      workspaceId,
      offers: offers.map((offer) => ({
        proposalId: offer.id,
        name: offer.name,
        summary: offer.summary,
        claims: offer.claims,
        heroAsset: offer.heroAsset,
      })),
    } as never);
  } catch (err) {
    console.error('[proposals/server] recordProposedOffers failed', err);
  }
}

export async function recordProposedCampaigns(
  workspaceId: string,
  campaigns: CampaignContext[]
): Promise<void> {
  const client = getHttpClient();
  if (!client) return;
  try {
    await client.mutation(proposalsApi.replaceProposedCampaigns as never, {
      workspaceId,
      campaigns: campaigns.map((campaign) => ({
        proposalId: campaign.id,
        name: campaign.name,
        goal: campaign.goal,
        audience: campaign.audience,
        channels: campaign.channels,
        cta: campaign.cta,
      })),
    } as never);
  } catch (err) {
    console.error('[proposals/server] recordProposedCampaigns failed', err);
  }
}
