import { mutationGeneric, queryGeneric } from 'convex/server';
import { v } from 'convex/values';

/**
 * AI-suggested offer + campaign proposals (Track A).
 *
 * The brand-propose workers fan-out a snapshot into 1–3 offer drafts and 1–3
 * campaign drafts; those land here keyed by workspaceId. The rails subscribe
 * via the listProposed* queries and render accept/reject cards.
 *
 * Acceptance is intentionally NOT a write here — the OfferSection /
 * CampaignSection promote the proposal into their own profile rows via the
 * existing saveOffer / saveCampaign mutations and then delete the proposal.
 * Splitting proposals from profiles keeps the canonical offer/campaign rows
 * free of proposal-only fields.
 */

const PROPOSED_OFFER = v.object({
  proposalId: v.string(),
  name: v.string(),
  summary: v.string(),
  claims: v.array(v.string()),
  heroAsset: v.string(),
});

const PROPOSED_CAMPAIGN = v.object({
  proposalId: v.string(),
  name: v.string(),
  goal: v.string(),
  audience: v.string(),
  channels: v.array(v.string()),
  cta: v.string(),
});

function toOfferRow(doc: any) {
  return {
    id: String(doc._id),
    proposalId: doc.proposalId,
    name: doc.name,
    summary: doc.summary,
    claims: doc.claims,
    heroAsset: doc.heroAsset,
    proposedAt: doc.proposedAt,
  };
}

function toCampaignRow(doc: any) {
  return {
    id: String(doc._id),
    proposalId: doc.proposalId,
    name: doc.name,
    goal: doc.goal,
    audience: doc.audience,
    channels: doc.channels,
    cta: doc.cta,
    proposedAt: doc.proposedAt,
  };
}

export const listProposedOffers = queryGeneric({
  args: { workspaceId: v.string() },
  handler: async (ctx, args) => {
    const docs = await ctx.db
      .query('proposedOffer')
      .withIndex('by_workspace', (q: any) => q.eq('workspaceId', args.workspaceId))
      .order('asc')
      .collect();
    return docs.map(toOfferRow);
  },
});

export const listProposedCampaigns = queryGeneric({
  args: { workspaceId: v.string() },
  handler: async (ctx, args) => {
    const docs = await ctx.db
      .query('proposedCampaign')
      .withIndex('by_workspace', (q: any) => q.eq('workspaceId', args.workspaceId))
      .order('asc')
      .collect();
    return docs.map(toCampaignRow);
  },
});

export const replaceProposedOffers = mutationGeneric({
  args: {
    workspaceId: v.string(),
    offers: v.array(PROPOSED_OFFER),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('proposedOffer')
      .withIndex('by_workspace', (q: any) => q.eq('workspaceId', args.workspaceId))
      .collect();
    for (const doc of existing) await ctx.db.delete(doc._id);
    const now = Date.now();
    const ids: string[] = [];
    for (const offer of args.offers) {
      const id = await ctx.db.insert('proposedOffer', {
        workspaceId: args.workspaceId,
        ...offer,
        proposedAt: now,
      });
      ids.push(String(id));
    }
    return ids;
  },
});

export const replaceProposedCampaigns = mutationGeneric({
  args: {
    workspaceId: v.string(),
    campaigns: v.array(PROPOSED_CAMPAIGN),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('proposedCampaign')
      .withIndex('by_workspace', (q: any) => q.eq('workspaceId', args.workspaceId))
      .collect();
    for (const doc of existing) await ctx.db.delete(doc._id);
    const now = Date.now();
    const ids: string[] = [];
    for (const campaign of args.campaigns) {
      const id = await ctx.db.insert('proposedCampaign', {
        workspaceId: args.workspaceId,
        ...campaign,
        proposedAt: now,
      });
      ids.push(String(id));
    }
    return ids;
  },
});

export const removeProposedOffer = mutationGeneric({
  args: { id: v.id('proposedOffer') },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});

export const removeProposedCampaign = mutationGeneric({
  args: { id: v.id('proposedCampaign') },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});
