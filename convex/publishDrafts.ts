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
  profileId?: string;
  lapId?: string;
  receiptKind?: 'evidence-fact' | 'signal-post';
  receiptRef?: string;
  status: 'draft' | 'posted';
  createdAt: number;
  updatedAt: number;
  postedAt?: number;
}

interface GeneratedDraftInput {
  kind: 'post' | 'reply';
  text: string;
  pillar: string;
  targetUrl?: string;
  status: 'draft';
  receiptKind: 'evidence-fact' | 'signal-post';
  receiptRef: string;
}

type PublishDraftDb = {
  query(table: 'publishDraft'): {
    withIndex(name: string, fn: (q: { eq(field: string, value: unknown): unknown }) => unknown): {
      collect(): Promise<Array<Record<string, any>>>;
    };
  };
  insert(table: 'publishDraft', doc: Record<string, unknown>): Promise<unknown>;
};

function toRecord(doc: PublishDraftDoc) {
  return {
    id: String(doc._id),
    workspaceId: doc.workspaceId,
    kind: doc.kind,
    text: doc.text,
    pillar: doc.pillar,
    targetUrl: doc.targetUrl,
    receiptUrl: doc.receiptUrl,
    profileId: doc.profileId,
    lapId: doc.lapId,
    receiptKind: doc.receiptKind,
    receiptRef: doc.receiptRef,
    status: doc.status,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    postedAt: doc.postedAt,
  };
}

export async function addGeneratedDraftBatchForWorkspace(
  db: PublishDraftDb,
  input: {
    workspaceId: string;
    profileId: string;
    lapId: string;
    drafts: GeneratedDraftInput[];
  }
): Promise<{ created: number; skipped: number }> {
  const existing = await db
    .query('publishDraft')
    .withIndex('by_workspace', (q) => q.eq('workspaceId', input.workspaceId))
    .collect();
  const existingKeys = new Set(
    existing
      .filter((row) => row.profileId === input.profileId && row.lapId === input.lapId)
      .map((row) => generatedDraftKey(row))
  );
  let created = 0;
  let skipped = 0;
  const now = Date.now();
  for (const draft of input.drafts) {
    const key = generatedDraftKey(draft);
    if (existingKeys.has(key)) {
      skipped += 1;
      continue;
    }
    existingKeys.add(key);
    await db.insert('publishDraft', {
      workspaceId: input.workspaceId,
      profileId: input.profileId,
      lapId: input.lapId,
      kind: draft.kind,
      text: draft.text,
      pillar: draft.pillar,
      targetUrl: draft.targetUrl,
      receiptKind: draft.receiptKind,
      receiptRef: draft.receiptRef,
      status: 'draft',
      createdAt: now + created,
      updatedAt: now + created,
    });
    created += 1;
  }
  return { created, skipped };
}

function generatedDraftKey(row: { kind?: unknown; text?: unknown; pillar?: unknown; targetUrl?: unknown }) {
  return [row.kind, row.text, row.pillar, row.targetUrl ?? ''].join('\u0000');
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

export const addGeneratedBatch = mutationGeneric({
  args: {
    workspaceId: v.string(),
    profileId: v.string(),
    lapId: v.string(),
    drafts: v.array(
      v.object({
        kind: KIND,
        text: v.string(),
        pillar: v.string(),
        targetUrl: v.optional(v.string()),
        status: v.literal('draft'),
        receiptKind: v.union(v.literal('evidence-fact'), v.literal('signal-post')),
        receiptRef: v.string(),
      })
    ),
  },
  handler: async (ctx, args) =>
    await addGeneratedDraftBatchForWorkspace(
      ctx.db as unknown as PublishDraftDb,
      args
    ),
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
