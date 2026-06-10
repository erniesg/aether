import { mutationGeneric, queryGeneric } from 'convex/server';
import { v } from 'convex/values';

const KIND = v.union(v.literal('post'), v.literal('reply'));
const STATUS = v.union(v.literal('draft'), v.literal('posted'));

interface PublishDraftDoc {
  _id: unknown;
  workspaceId: string;
  kind: 'post' | 'reply';
  text: string;
  pillar: string;
  targetUrl?: string;
  receiptUrl?: string;
  status: 'draft' | 'posted';
  createdAt: number;
  updatedAt: number;
  postedAt?: number;
}

function toRecord(doc: PublishDraftDoc) {
  return {
    id: String(doc._id),
    workspaceId: doc.workspaceId,
    kind: doc.kind,
    text: doc.text,
    pillar: doc.pillar,
    targetUrl: doc.targetUrl,
    receiptUrl: doc.receiptUrl,
    status: doc.status,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    postedAt: doc.postedAt,
  };
}

export const list = queryGeneric({
  args: { workspaceId: v.string() },
  handler: async (ctx, args) => {
    const docs = (await ctx.db
      .query('publishDraft')
      .withIndex('by_workspace', (q: any) => q.eq('workspaceId', args.workspaceId))
      .order('desc')
      .take(200)) as PublishDraftDoc[];
    return docs.map(toRecord);
  },
});

export const add = mutationGeneric({
  args: {
    workspaceId: v.string(),
    kind: KIND,
    text: v.string(),
    pillar: v.string(),
    targetUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const id = await ctx.db.insert('publishDraft', {
      workspaceId: args.workspaceId,
      kind: args.kind,
      text: args.text,
      pillar: args.pillar,
      targetUrl: args.targetUrl,
      status: 'draft',
      createdAt: now,
      updatedAt: now,
    });
    return String(id);
  },
});

export const updateText = mutationGeneric({
  args: { id: v.id('publishDraft'), text: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      text: args.text,
      updatedAt: Date.now(),
    });
  },
});

export const markPosted = mutationGeneric({
  args: { id: v.id('publishDraft') },
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.patch(args.id, {
      status: 'posted',
      postedAt: now,
      updatedAt: now,
    });
  },
});

export const setReceiptUrl = mutationGeneric({
  args: { id: v.id('publishDraft'), receiptUrl: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      receiptUrl: args.receiptUrl,
      updatedAt: Date.now(),
    });
  },
});

export const updateStatus = mutationGeneric({
  args: { id: v.id('publishDraft'), status: STATUS },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      status: args.status,
      updatedAt: Date.now(),
    });
  },
});
