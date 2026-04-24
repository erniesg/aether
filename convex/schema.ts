import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

/**
 * v0.1 hackathon schema. Matches docs/ARCHITECTURE.md § Data model.
 * Keep the sections ordered: inputs → canvas → capability → observations → export.
 */
export default defineSchema({
  // ─── root ──────────────────────────────────────────────────────────────
  workspace: defineTable({
    name: v.string(),
    createdAt: v.number(),
    ownerId: v.string(),
  }),

  // ─── left rail: inputs ─────────────────────────────────────────────────
  sourceItem: defineTable({
    wsId: v.id('workspace'),
    kind: v.union(
      v.literal('url'),
      v.literal('upload'),
      v.literal('pinterest'),
      v.literal('instagram'),
      v.literal('tiktok'),
      v.literal('xhs'),
      v.literal('repo')
    ),
    payload: v.any(),
    tags: v.array(v.string()),
    addedAt: v.number(),
  }).index('by_ws', ['wsId']),

  referenceItem: defineTable({
    wsId: v.id('workspace'),
    sourceId: v.optional(v.id('sourceItem')),
    imageUrl: v.string(),
    pinned: v.boolean(),
  }).index('by_ws', ['wsId']),

  cluster: defineTable({
    wsId: v.id('workspace'),
    label: v.string(),
    memberIds: v.array(v.id('referenceItem')),
  }).index('by_ws', ['wsId']),

  inputSet: defineTable({
    wsId: v.id('workspace'),
    references: v.array(v.id('referenceItem')),
    brandId: v.optional(v.id('brandToken')),
    productId: v.optional(v.id('productFact')),
    briefId: v.optional(v.id('brief')),
    copyFragments: v.array(v.string()),
    active: v.boolean(),
  }).index('by_ws', ['wsId']),

  brandToken: defineTable({
    wsId: v.id('workspace'),
    palette: v.array(v.string()),
    type: v.array(v.string()),
    voice: v.optional(v.string()),
  }).index('by_ws', ['wsId']),

  productFact: defineTable({
    wsId: v.id('workspace'),
    name: v.string(),
    claims: v.array(v.string()),
    heroAsset: v.optional(v.string()),
  }).index('by_ws', ['wsId']),

  // Workspace-scoped visual-composition policy. Brand leads set the default
  // once; creators inherit it and can override per call. Mirrors
  // `lib/providers/image/composition.ts` — the union of valid values is
  // enforced there, not at the Convex layer, so adding a new constraint
  // token doesn't force a schema migration.
  brandPolicy: defineTable({
    wsId: v.id('workspace'),
    defaultComposition: v.object({
      textStrategy: v.optional(
        v.union(v.literal('none'), v.literal('baked'), v.literal('auto'))
      ),
      constraints: v.optional(v.array(v.string())),
    }),
    updatedAt: v.number(),
  }).index('by_wsId', ['wsId']),

  brief: defineTable({
    wsId: v.id('workspace'),
    audience: v.string(),
    cta: v.string(),
    locale: v.string(),
    funnelStage: v.string(),
  }).index('by_ws', ['wsId']),

  outputTarget: defineTable({
    wsId: v.id('workspace'),
    platform: v.string(),
    format: v.string(),
    dimensions: v.object({ w: v.number(), h: v.number() }),
    safeZones: v.array(v.any()),
  }).index('by_ws', ['wsId']),

  // Creator-controlled signal subscriptions: keywords, hashtags, and accounts
  // the creator wants the system to listen to. `wsId` is optional for the same
  // reason it is on `capabilityRun` — pre-Phase-5 the UI has no workspace
  // plumbing and a single demo workspace is implicit.
  signalSubscription: defineTable({
    wsId: v.optional(v.id('workspace')),
    kind: v.union(v.literal('keyword'), v.literal('hashtag'), v.literal('account')),
    value: v.string(),
    addedAt: v.number(),
    lastCheckedAt: v.optional(v.number()),
    mutedUntil: v.optional(v.number()),
  }).index('by_ws', ['wsId']),

  // ─── canvas ────────────────────────────────────────────────────────────
  canvasSnapshot: defineTable({
    wsId: v.id('workspace'),
    tldrawStoreJson: v.string(),
    snapshottedAt: v.number(),
  }).index('by_ws', ['wsId']),

  keyVisual: defineTable({
    wsId: v.id('workspace'),
    name: v.string(),
    thumbnail: v.optional(v.string()),
  }).index('by_ws', ['wsId']),

  variant: defineTable({
    wsId: v.id('workspace'),
    keyVisualId: v.id('keyVisual'),
    platform: v.string(),
    format: v.string(),
    scopeMode: v.union(v.literal('global'), v.literal('local')),
    overrideJson: v.optional(v.string()),
    renderedUrl: v.optional(v.string()),
  }).index('by_kv', ['keyVisualId']),

  // ─── capability system (the hero) ──────────────────────────────────────
  capabilityDefinition: defineTable({
    wsId: v.id('workspace'),
    name: v.string(),
    trigger: v.string(),
    paramSchema: v.any(),
    exampleRunId: v.optional(v.string()),
    createdBy: v.union(v.literal('human'), v.literal('agent')),
    notes: v.optional(v.string()),
    tool: v.string(),
    provider: v.string(),
    entryRef: v.object({
      kind: v.union(v.literal('tool'), v.literal('workflow'), v.literal('skill')),
      id: v.string(),
      version: v.number(),
    }),
    runTemplate: v.any(),
    version: v.number(),
  }).index('by_ws', ['wsId']),

  capabilityRun: defineTable({
    // Workspace is optional because pre-Phase-5 the UI has no wsId plumbing; a
    // single demo workspace is implicit. Slice-A keeps the run log working
    // without blocking on that wiring.
    wsId: v.optional(v.id('workspace')),
    definitionId: v.optional(v.string()),
    definitionVersion: v.optional(v.number()),
    entryRef: v.optional(
      v.object({
        kind: v.union(v.literal('tool'), v.literal('workflow'), v.literal('skill')),
        id: v.string(),
        version: v.number(),
      })
    ),
    artifactKind: v.optional(v.union(v.literal('image'), v.literal('spatial'))),
    outputFormat: v.optional(v.union(v.literal('particle-field'), v.literal('gaussian-splat'))),
    quality: v.optional(v.union(v.literal('draft'), v.literal('standard'), v.literal('high'))),
    sourceMode: v.optional(v.literal('selected-image')),
    sourceImageShapeId: v.optional(v.string()),
    tool: v.string(),
    provider: v.string(),
    model: v.string(),
    prompt: v.string(),
    // Client-generated correlation id. Stable across start/step/finish and
    // lets the server and the browser agree on which record to mutate.
    clientRunId: v.string(),
    step: v.optional(
      v.union(
        v.literal('prepared'),
        v.literal('sending'),
        v.literal('awaiting'),
        v.literal('received'),
        v.literal('parsing'),
        v.literal('placing'),
        v.literal('done')
      )
    ),
    rewrittenPrompt: v.optional(v.string()),
    rationale: v.optional(v.string()),
    aspectRatio: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    latencyMs: v.optional(v.number()),
    error: v.optional(v.string()),
    httpStatus: v.optional(v.number()),
    inputs: v.any(),
    outputs: v.any(),
    beforeSnapshotRef: v.optional(v.string()),
    afterSnapshotRef: v.optional(v.string()),
    startedAt: v.number(),
    finishedAt: v.optional(v.number()),
    status: v.union(v.literal('running'), v.literal('ok'), v.literal('error')),
  })
    .index('by_ws', ['wsId'])
    .index('by_client_run_id', ['clientRunId']),

  // ─── right rail: observations ──────────────────────────────────────────
  observation: defineTable({
    wsId: v.id('workspace'),
    severity: v.union(v.literal('info'), v.literal('warn'), v.literal('error')),
    text: v.string(),
    affectedNodes: v.array(v.string()),
    createdAt: v.number(),
  }).index('by_ws', ['wsId']),

  // ─── output ────────────────────────────────────────────────────────────
  exportPack: defineTable({
    wsId: v.id('workspace'),
    keyVisualId: v.id('keyVisual'),
    manifestUrl: v.string(),
    downloadUrl: v.string(),
    createdAt: v.number(),
  }).index('by_ws', ['wsId']),
});
