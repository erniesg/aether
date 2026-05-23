import { mutationGeneric, queryGeneric } from 'convex/server';
import { v } from 'convex/values';

const MODE = v.union(v.literal('auto'), v.literal('hitl'));
const JUNCTURE_ID = v.union(
  v.literal('A'),
  v.literal('B'),
  v.literal('C'),
  v.literal('D'),
  v.literal('E')
);
const DECISION = v.union(v.literal('approved'), v.literal('rejected'));

/**
 * Convex persistence for the recap-run state machine
 * (lib/research/event-recap/recap-run-state.ts).
 *
 * One row per runId. The state machine itself is pure; these wrappers
 * just store the serialized state blob and apply the pure-function
 * transitions before writing the new state back.
 *
 * Pure state-machine functions are imported in the route handler that
 * calls these mutations — Convex functions only handle persistence so
 * the same state-machine logic works in both Convex and in-process
 * (test) environments.
 */

export const getByRunId = queryGeneric({
  args: { runId: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query('recapRunState')
      .withIndex('by_runId', (q) => q.eq('runId', args.runId))
      .unique();
    if (!row) return null;
    return {
      eventId: row.eventId,
      runId: row.runId,
      mode: row.mode,
      state: row.state,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  },
});

export const listByEventId = queryGeneric({
  args: { eventId: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query('recapRunState')
      .withIndex('by_eventId', (q) => q.eq('eventId', args.eventId))
      .collect();
    return rows
      .map((row) => ({
        runId: row.runId,
        mode: row.mode,
        state: row.state,
        updatedAt: row.updatedAt,
      }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  },
});

/**
 * Persist a fresh state machine. Caller has already called
 * createRecapRunState() and passes the initial RecapRunState blob.
 */
export const initialize = mutationGeneric({
  args: {
    eventId: v.string(),
    runId: v.string(),
    mode: MODE,
    state: v.any(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query('recapRunState')
      .withIndex('by_runId', (q) => q.eq('runId', args.runId))
      .unique();
    if (existing) {
      throw new Error(`runId ${args.runId} already exists`);
    }
    return ctx.db.insert('recapRunState', {
      eventId: args.eventId,
      runId: args.runId,
      mode: args.mode,
      state: args.state,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Replace the persisted state. Callers compute the next state via the
 * pure state-machine functions (requestJunctureApproval / recordJunctureDecision /
 * autoApproveJuncture) and pass the result here.
 */
export const updateState = mutationGeneric({
  args: {
    runId: v.string(),
    state: v.any(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('recapRunState')
      .withIndex('by_runId', (q) => q.eq('runId', args.runId))
      .unique();
    if (!existing) {
      throw new Error(`runId ${args.runId} not found`);
    }
    await ctx.db.patch(existing._id, {
      state: args.state,
      updatedAt: Date.now(),
    });
  },
});

// Re-export the union types so route handlers can validate inputs
// against the same literal sets Convex enforces at storage time.
export const _validators = { MODE, JUNCTURE_ID, DECISION };
