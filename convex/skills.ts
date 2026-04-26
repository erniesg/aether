import { mutationGeneric, queryGeneric } from 'convex/server';
import { v } from 'convex/values';

// AC5 — pinned-skill persistence. Mirrors the `skill` table validator in
// schema.ts. Uses *Generic builders because convex/_generated is not committed
// (regenerated via `npx convex dev` at provisioning time).
//
// `manifestPath` is stored as a path RELATIVE TO THE REPO ROOT so the document
// is portable across environments (server CWD differs between local dev,
// staging, and production builds). The accept-skill API route is responsible
// for re-resolving it against the runtime cwd before passing to callSkill.

interface SkillDoc {
  _id: unknown;
  name: string;
  version: number;
  description: string;
  manifestPath: string;
  referenceFilePaths: string[];
  createdAt: number;
}

export interface SkillRecord {
  id: string;
  name: string;
  version: number;
  description: string;
  manifestPath: string;
  referenceFilePaths: string[];
  createdAt: number;
}

function toRecord(doc: SkillDoc): SkillRecord {
  return {
    id: String(doc._id),
    name: doc.name,
    version: doc.version,
    description: doc.description,
    manifestPath: doc.manifestPath,
    referenceFilePaths: doc.referenceFilePaths,
    createdAt: doc.createdAt,
  };
}

export const list = queryGeneric({
  args: {},
  handler: async (ctx) => {
    const docs = (await ctx.db.query('skill').order('desc').take(50)) as SkillDoc[];
    return docs.map(toRecord);
  },
});

export const getByName = queryGeneric({
  args: { name: v.string(), version: v.optional(v.number()) },
  handler: async (ctx, args) => {
    if (typeof args.version === 'number') {
      const doc = (await ctx.db
        .query('skill')
        .withIndex('by_name_version', (q: any) =>
          q.eq('name', args.name).eq('version', args.version)
        )
        .unique()) as SkillDoc | null;
      return doc ? toRecord(doc) : null;
    }
    const doc = (await ctx.db
      .query('skill')
      .withIndex('by_name', (q: any) => q.eq('name', args.name))
      .order('desc')
      .first()) as SkillDoc | null;
    return doc ? toRecord(doc) : null;
  },
});

export const insert = mutationGeneric({
  args: {
    name: v.string(),
    version: v.number(),
    description: v.string(),
    manifestPath: v.string(),
    referenceFilePaths: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    // Idempotent on (name, version) — re-accepting the same draft updates the
    // existing row rather than creating duplicates.
    const existing = (await ctx.db
      .query('skill')
      .withIndex('by_name_version', (q: any) =>
        q.eq('name', args.name).eq('version', args.version)
      )
      .unique()) as SkillDoc | null;
    if (existing) {
      await ctx.db.patch(existing._id as any, {
        description: args.description,
        manifestPath: args.manifestPath,
        referenceFilePaths: args.referenceFilePaths,
      });
      return String(existing._id);
    }
    const id = await ctx.db.insert('skill', {
      name: args.name,
      version: args.version,
      description: args.description,
      manifestPath: args.manifestPath,
      referenceFilePaths: args.referenceFilePaths,
      createdAt: Date.now(),
    });
    return String(id);
  },
});
