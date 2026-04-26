import { mutationGeneric, queryGeneric } from 'convex/server';
import { v } from 'convex/values';
import type { WorkspaceProviderPrefs } from '../lib/providers/prefs';

/**
 * Convex queries and mutations for per-workspace provider preferences.
 *
 * Schema lives in convex/schema.ts under `workspaceProviderPrefs`.
 * All fields are optional — callers receive null when no record exists yet.
 */

export const getProviderPrefs = queryGeneric({
  args: { workspaceId: v.string() },
  handler: async (ctx, args): Promise<WorkspaceProviderPrefs | null> => {
    const doc = await ctx.db
      .query('workspaceProviderPrefs')
      .withIndex('by_workspace', (q: any) => q.eq('workspaceId', args.workspaceId))
      .first();
    if (!doc) return null;
    const prefs: WorkspaceProviderPrefs = {};
    if (doc.imageProviderId) prefs.imageProviderId = doc.imageProviderId;
    if (doc.voiceProviderId) prefs.voiceProviderId = doc.voiceProviderId as import('../lib/voice/types').VoiceProviderId;
    if (doc.voiceModel) prefs.voiceModel = doc.voiceModel;
    if (doc.segmentationProviderId) prefs.segmentationProviderId = doc.segmentationProviderId;
    return prefs;
  },
});

export const saveProviderPrefs = mutationGeneric({
  args: {
    workspaceId: v.string(),
    prefs: v.object({
      imageProviderId: v.optional(v.string()),
      voiceProviderId: v.optional(v.string()),
      voiceModel: v.optional(v.string()),
      segmentationProviderId: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args): Promise<string> => {
    const existing = await ctx.db
      .query('workspaceProviderPrefs')
      .withIndex('by_workspace', (q: any) => q.eq('workspaceId', args.workspaceId))
      .first();

    const patch = {
      workspaceId: args.workspaceId,
      imageProviderId: args.prefs.imageProviderId,
      voiceProviderId: args.prefs.voiceProviderId,
      voiceModel: args.prefs.voiceModel,
      segmentationProviderId: args.prefs.segmentationProviderId,
      updatedAt: Date.now(),
    };

    if (existing) {
      await ctx.db.patch(existing._id, patch);
      return String(existing._id);
    }
    return String(await ctx.db.insert('workspaceProviderPrefs', patch));
  },
});
