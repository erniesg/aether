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
    exampleRunId: v.optional(v.id('capabilityRun')),
    createdBy: v.union(v.literal('human'), v.literal('agent')),
    version: v.number(),
  }).index('by_ws', ['wsId']),

  capabilityRun: defineTable({
    wsId: v.id('workspace'),
    definitionId: v.optional(v.id('capabilityDefinition')),
    tool: v.string(),
    provider: v.string(),
    inputs: v.any(),
    outputs: v.any(),
    beforeSnapshotRef: v.optional(v.string()),
    afterSnapshotRef: v.optional(v.string()),
    startedAt: v.number(),
    finishedAt: v.optional(v.number()),
    status: v.union(v.literal('running'), v.literal('ok'), v.literal('error')),
  }).index('by_ws', ['wsId']),

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
