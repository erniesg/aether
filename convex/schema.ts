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

  // Cluster kanban (issue #26). A `clusterCard` row is the UI-facing shape —
  // the kanban columns read and write these directly. `wsId` is optional for
  // the same reason it is on `capabilityRun` / `signalSubscription`: pre-
  // Phase-5 there is no workspace plumbing in the UI and a single demo
  // workspace is implicit.
  clusterCard: defineTable({
    wsId: v.optional(v.id('workspace')),
    /** Matches a `referenceItem._id` when Convex is provisioned; otherwise the
     * client-generated `ReferenceRecord.id`. */
    referenceId: v.string(),
    /** Cluster id as a string — `-1` is the noise bucket (HDBSCAN). */
    clusterId: v.string(),
    clusterLabel: v.string(),
    thumbnailUrl: v.string(),
    attribution: v.object({
      source: v.string(),
      author: v.optional(v.string()),
      url: v.string(),
    }),
    score: v.optional(v.number()),
    column: v.union(
      v.literal('Found'),
      v.literal('Shortlisted'),
      v.literal('Generating'),
      v.literal('Hero')
    ),
    /** 512-d CLIP embedding for future re-ranking / similarity queries. */
    embedding: v.optional(v.array(v.float64())),
    movedAt: v.number(),
  })
    .index('by_ws', ['wsId'])
    .index('by_reference', ['referenceId'])
    .index('by_cluster', ['clusterId']),

  // Typed provenance ring-buffer for drag-between-columns events (hard rule #8).
  clusterStateChange: defineTable({
    wsId: v.optional(v.id('workspace')),
    cardId: v.string(),
    fromColumn: v.union(
      v.literal('Found'),
      v.literal('Shortlisted'),
      v.literal('Generating'),
      v.literal('Hero')
    ),
    toColumn: v.union(
      v.literal('Found'),
      v.literal('Shortlisted'),
      v.literal('Generating'),
      v.literal('Hero')
    ),
    at: v.number(),
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

  // Creator-context profiles keyed by the route workspace id. The app does
  // not yet map `/workspace/:wsId` to a Convex workspace document, so these
  // tables scope by stable workspace string while the older graph tables keep
  // their `v.id('workspace')` contracts.
  brandProfile: defineTable({
    workspaceId: v.string(),
    // id is the BrandContext.id — a stable client-side identifier that travels
    // through coerceBrandContext and the BRAND validator. It must be stored so
    // the round-trip from getBrand → useBrandContext produces the same id that
    // was saved, not the Convex document _id.
    id: v.string(),
    name: v.string(),
    palette: v.array(v.string()),
    type: v.array(v.string()),
    voice: v.string(),
    knowledgeSources: v.array(
      v.object({
        id: v.string(),
        kind: v.union(
          v.literal('url'),
          v.literal('repo'),
          v.literal('upload'),
          v.literal('asset')
        ),
        label: v.string(),
        note: v.string(),
      })
    ),
    updatedAt: v.number(),
  }).index('by_workspace', ['workspaceId']),

  offerProfile: defineTable({
    workspaceId: v.string(),
    name: v.string(),
    summary: v.string(),
    claims: v.array(v.string()),
    heroAsset: v.string(),
    heroAssetReferenceId: v.optional(v.string()),
    updatedAt: v.number(),
  }).index('by_workspace', ['workspaceId']),

  campaignProfile: defineTable({
    workspaceId: v.string(),
    name: v.string(),
    goal: v.string(),
    audience: v.string(),
    channels: v.array(v.string()),
    cta: v.string(),
    updatedAt: v.number(),
  }).index('by_workspace', ['workspaceId']),

  workspaceContext: defineTable({
    workspaceId: v.string(),
    activeReferenceIds: v.array(v.string()),
    activeSignalIds: v.array(v.string()),
    constraints: v.array(v.string()),
    updatedAt: v.number(),
  }).index('by_workspace', ['workspaceId']),

  creatorReference: defineTable({
    workspaceId: v.string(),
    kind: v.union(
      v.literal('image'),
      v.literal('video'),
      v.literal('embed'),
      v.literal('template'),
      v.literal('element')
    ),
    previewUrl: v.string(),
    fullUrl: v.optional(v.string()),
    attribution: v.object({
      source: v.string(),
      author: v.optional(v.string()),
      url: v.string(),
    }),
    capturedAt: v.string(),
    title: v.optional(v.string()),
    usageIntent: v.optional(v.string()),
    tags: v.array(v.string()),
    notes: v.optional(v.string()),
    clusterId: v.optional(v.string()),
    updatedAt: v.number(),
  }).index('by_workspace', ['workspaceId']),

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

  // Creator-controlled signal subscriptions: keywords, hashtags, and accounts
  // the creator wants the system to listen to. `wsId` is optional for the same
  // reason it is on `capabilityRun` — pre-Phase-5 the UI has no workspace
  // plumbing and a single demo workspace is implicit.
  signalSubscription: defineTable({
    wsId: v.optional(v.id('workspace')),
    workspaceId: v.optional(v.string()),
    kind: v.union(v.literal('keyword'), v.literal('hashtag'), v.literal('account')),
    value: v.string(),
    addedAt: v.number(),
    lastCheckedAt: v.optional(v.number()),
    mutedUntil: v.optional(v.number()),
  })
    .index('by_ws', ['wsId'])
    .index('by_workspace', ['workspaceId']),

  // ─── canvas ────────────────────────────────────────────────────────────
  // wsId is optional for the same reason it is on capabilityRun / clusterCard /
  // signalSubscription: pre-Phase-5 the canvas writes snapshots without a
  // Convex workspace document, using a plain string key (wsKey). Making wsId
  // optional here allows existing documents to pass schema validation while the
  // workspace plumbing is wired up in Phase 5.
  canvasSnapshot: defineTable({
    wsId: v.optional(v.id('workspace')),
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
    artifactKind: v.optional(
      v.union(v.literal('image'), v.literal('spatial'), v.literal('video'))
    ),
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
    outputRefs: v.optional(v.array(v.string())),
    scope: v.optional(v.string()),
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

  // ─── workspace provider preferences ──────────────────────────────────────
  // Per-workspace overrides for the default AI providers. All fields are
  // optional — when absent the API routes fall back to env vars and then code
  // defaults. keyed by stable workspaceId string (same scope as brandProfile).
  workspaceProviderPrefs: defineTable({
    workspaceId: v.string(),
    imageProviderId: v.optional(v.string()),
    voiceProviderId: v.optional(v.string()),
    voiceModel: v.optional(v.string()),
    segmentationProviderId: v.optional(v.string()),
    updatedAt: v.number(),
  }).index('by_workspace', ['workspaceId']),

  // Publisher seam (issue #9 — Slice 1). One row per platform post; multi-
  // platform fan-out is N rows. `wsId` optional for the same reason it is on
  // `signalSubscription` — pre-Phase-5 the UI has no workspace plumbing.
  scheduledPost: defineTable({
    wsId: v.optional(v.id('workspace')),
    platform: v.union(
      v.literal('instagram'),
      v.literal('tiktok'),
      v.literal('x'),
      v.literal('linkedin'),
      v.literal('youtube-shorts'),
      v.literal('xhs'),
      v.literal('douyin'),
      v.literal('pinterest')
    ),
    mediaUrls: v.array(v.string()),
    caption: v.string(),
    hashtags: v.array(v.string()),
    scheduledAt: v.string(), // ISO8601
    accountId: v.optional(v.string()),
    createdAt: v.number(),
    status: v.union(
      v.literal('draft'),
      v.literal('scheduled'),
      v.literal('published'),
      v.literal('cancelled')
    ),
    provider: v.optional(v.string()),
    externalId: v.optional(v.string()),
  }).index('by_ws', ['wsId']),
});
