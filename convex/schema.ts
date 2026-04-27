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

  /**
   * Uploaded asset registry. Auto-mode uploads gpt-image-2 heroes here
   * (they come back as data URLs that SAM3 can't fetch); URL ingestion
   * uploads detected logos + product cutouts so the hero gen has fetchable
   * brand assets to condition on.
   *
   * `storageId` references Convex File Storage; `publicUrl` is the
   * CDN-fetchable version SAM3/Modal/etc. consume.
   */
  asset: defineTable({
    storageId: v.string(),
    publicUrl: v.string(),
    kind: v.union(
      v.literal('hero'),
      v.literal('logo'),
      v.literal('product'),
      v.literal('reference'),
      v.literal('mask'),
      v.literal('cutout'),
      v.literal('other')
    ),
    mime: v.string(),
    /** Optional workspace scope. */
    wsId: v.optional(v.id('workspace')),
    /** Optional campaign cross-link so the right rail can show
     *  "this campaign's heroes" without a separate join table. */
    campaignId: v.optional(v.id('campaign')),
    /** Free-form lineage hint (e.g. "ingested from eightsleep.com /sg/").
     *  Drives the "traceable back to the reference" UX Ernie called for. */
    sourceUrl: v.optional(v.string()),
    /** Original dimensions when known. */
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    bytes: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index('by_workspace', ['wsId'])
    .index('by_campaign', ['campaignId'])
    .index('by_storage', ['storageId']),

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
    // id is the OfferContext.id — same round-trip rationale as brandProfile.id.
    // Without this, saveOffer's strict-mode validation throws on the unknown
    // `id` field and the fire-and-forget mutation swallows the error.
    id: v.string(),
    name: v.string(),
    summary: v.string(),
    claims: v.array(v.string()),
    heroAsset: v.string(),
    heroAssetReferenceId: v.optional(v.string()),
    updatedAt: v.number(),
  }).index('by_workspace', ['workspaceId']),

  campaignProfile: defineTable({
    workspaceId: v.string(),
    // id is the CampaignContext.id — same rationale as offerProfile.id above.
    id: v.string(),
    name: v.string(),
    goal: v.string(),
    audience: v.string(),
    channels: v.array(v.string()),
    cta: v.string(),
    updatedAt: v.number(),
  }).index('by_workspace', ['workspaceId']),

  // AI-suggested offer drafts produced by the brand-propose workers (Track A).
  // Lives in its own table so the rail can subscribe + render accept/reject
  // cards without leaking proposal state into the canonical offerProfile.
  // Accepting a row promotes it into offerProfile and deletes the proposal;
  // rejecting just deletes it. proposalId is the worker-emitted stable id.
  proposedOffer: defineTable({
    workspaceId: v.string(),
    proposalId: v.string(),
    name: v.string(),
    summary: v.string(),
    claims: v.array(v.string()),
    heroAsset: v.string(),
    proposedAt: v.number(),
  }).index('by_workspace', ['workspaceId']),

  proposedCampaign: defineTable({
    workspaceId: v.string(),
    proposalId: v.string(),
    name: v.string(),
    goal: v.string(),
    audience: v.string(),
    channels: v.array(v.string()),
    cta: v.string(),
    proposedAt: v.number(),
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
    wsKey: v.optional(v.string()),
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

  // Multilingual text-overlay layers pinned to an artboard. Canonical store
  // for the text-apply capability (umbrella #66). `content` is a serialized
  // `Record<BCP47LocaleCode, string>`; `style` and `placement` are the
  // full TextOverlayStyle / AetherTextPlacement records from
  // lib/text-overlay/types.ts. Stored as `v.any()` so T4–T9 can evolve the
  // inner shape without a schema migration.
  textOverlay: defineTable({
    // Loosened from v.id('workspace') to v.string() (2026-04-27): the app
    // does not yet provision a Convex workspace document for every
    // /workspace/:wsId route — wsId arrives as the stable string slug
    // ("demo-debut-editorial"). Same convention as brandProfile.workspaceId.
    wsId: v.string(),
    artboardId: v.string(),
    content: v.any(),
    activeLanguage: v.string(),
    style: v.any(),
    placement: v.any(),
    smartPlacement: v.boolean(),
    protectedElementIds: v.array(v.string()),
    provenance: v.object({ capabilityRunId: v.string() }),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_wsId', ['wsId'])
    .index('by_artboardId', ['artboardId']),

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
    // Workspace is a free-form string here, not v.id('workspace'). The URL
    // route uses string ids like 'demo-ws' that aren't backed by a workspace
    // doc yet; relaxing to v.string() lets the run log persist without
    // requiring a real workspace insert first. Older callers that DO pass
    // a Convex Id<'workspace'> are still fine — the runtime accepts that
    // shape unchanged because the brand is structural at write time.
    wsId: v.optional(v.string()),
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
      v.union(
        v.literal('image'),
        v.literal('spatial'),
        v.literal('text-overlay'),
        v.literal('video'),
        v.literal('audio')
      )
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
    status: v.union(
      v.literal('running'),
      v.literal('ok'),
      v.literal('error'),
      // Recorded by stub executors that only persist the intent of a run —
      // the real executor lands later in the track and promotes to 'ok'.
      v.literal('draft-executor')
    ),
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

  // ─── skills (Anthropic Skills foundation) ─────────────────────────────
  // Mirrors authored Skills as graph artifacts so the capability factory can
  // query them and the right rail can surface them. `manifestPath` is the FS
  // path (relative to repo root) of the SKILL.md; `referenceFilePaths` mirrors
  // the front-matter `referenceFiles[]`. Schema is intentionally simple so
  // authoring-loop follow-ups can evolve it without a migration.
  skill: defineTable({
    name: v.string(),
    version: v.number(),
    description: v.string(),
    manifestPath: v.string(),
    referenceFilePaths: v.array(v.string()),
    createdAt: v.number(),
  })
    .index('by_name', ['name'])
    .index('by_name_version', ['name', 'version']),

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

  // Managed Agents session ledger (issue #100 — Step 1). Mirrors the live
  // Anthropic `client.beta.sessions` surface so a workspace can fan supervisor
  // sessions out into per-source/per-platform sub-sessions and replay them
  // later. `status` is a stable local-view union — the SDK's status union
  // (`rescheduling | running | idle | terminated`) is mapped onto these four
  // values by sessionManager so callers can reason about lifecycle without
  // tracking SDK string churn.
  agentSession: defineTable({
    workspaceId: v.string(),
    sessionId: v.string(),
    parentSessionId: v.optional(v.string()),
    purpose: v.string(),
    status: v.union(
      v.literal('running'),
      v.literal('paused'),
      v.literal('done'),
      v.literal('failed')
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_workspace', ['workspaceId'])
    .index('by_session', ['sessionId']),

  // ─── Auto Mode (handoff §9) ──────────────────────────────────────────
  // One Auto-Mode lap = one `campaign` row plus N `campaignVariation`
  // children. The agent loop's per-tool ledger rows in `capabilityRun`
  // already cross-link via `entryRef`; the campaign stores the lap-level
  // outcome and the schedule suggestions the user decides on.
  campaign: defineTable({
    workspaceId: v.optional(v.string()),
    triggerKind: v.union(v.literal('url'), v.literal('file'), v.literal('text')),
    triggerPayload: v.string(),
    variationCount: v.number(),
    notifyMode: v.union(
      v.literal('notify'),
      v.literal('review'),
      v.literal('auto-post')
    ),
    status: v.union(
      v.literal('running'),
      v.literal('completed'),
      v.literal('failed')
    ),
    startedAt: v.number(),
    finishedAt: v.optional(v.number()),
    error: v.optional(v.string()),
    /** B2 research bundle (competitors, localeInsights, sources, summary).
     *  Stored as v.any to keep the schema flexible — the canonical shape
     *  lives in lib/agent/managed/research.ts ResearchBundle. Persisted so
     *  /inspect and right-rail show research signals on page reload, and
     *  so creators can audit the lap's research context after the fact. */
    researchBundle: v.optional(v.any()),
    /** B2 schedule plan from the signoff Managed Agent (per-variation
     *  decision + rationale, overall recommendation). Persisted so /inspect
     *  surfaces signoff reasoning. Canonical shape: SchedulePlan. */
    schedulePlan: v.optional(v.any()),
    /** Cluster Managed Agent bundle (visual similarity grouping of the
     *  lap's reference images). Canonical shape: ClusterBundle from
     *  lib/agent/managed/cluster.ts. */
    clusterBundle: v.optional(v.any()),
  }).index('by_workspace', ['workspaceId']),

  campaignVariation: defineTable({
    campaignId: v.id('campaign'),
    workspaceId: v.optional(v.string()),
    index: v.number(),
    status: v.union(
      v.literal('pending'),
      v.literal('running'),
      v.literal('ready'),
      v.literal('failed')
    ),
    heroImageUrl: v.optional(v.string()),
    /** Convex `asset` doc id when the hero was uploaded to storage
     *  (data-URL → public CDN URL conversion). */
    heroAssetId: v.optional(v.id('asset')),
    caption: v.optional(v.string()),
    /** SG-locale captions: en-SG, zh-Hans-SG, ms-SG, ta-SG. */
    captionsByLocale: v.optional(v.any()),
    hashtags: v.optional(v.array(v.string())),
    moodNote: v.optional(v.string()),
    schedulePlatform: v.optional(v.string()),
    scheduleWhenLocal: v.optional(v.string()),
    /** Per-format crop rectangles derived from the hero. Each entry =
     *  { aspectRatio, w, h, crop: { topLeft, bottomRight } } in tldraw's
     *  normalized [0,1] coords (lib/canvas/cropToFormat). The hero (1:1)
     *  is included as a no-op crop so consumers don't special-case. */
    formatCrops: v.optional(v.any()),
    /** SAM3 masks from the static one-shot prompt list (lib/agent/segment-
     *  subjects ONE_SHOT_PROMPTS). No LLM cost; broad coverage. */
    masksOneShot: v.optional(v.any()),
    /** SAM3 masks from Claude vision-derived prompts (describe_image →
     *  segment_subjects). Per-image specificity at the cost of one vision
     *  call. Stored alongside one-shot for A/B inspection. */
    masksVisionGuided: v.optional(v.any()),
    /** Per-format public URLs after Convex upload. `'1x1'` is always the
     *  heroImageUrl. 4x5 / 9x16 / 16x9 entries appear when AUTO_MODE_NATIVE
     *  _PER_FORMAT renders succeeded and the bytes uploaded. Missing keys
     *  → fall back to atlas → hero in the UI / canvas drop. */
    nativePerFormatUrls: v.optional(v.any()),
    /** 4-locale × 4-format atlas (Convex storage public URL). Surfaced in
     *  Discord embeds and fallbacks for canvas frames lacking a per-format
     *  native render. Skipped when AUTO_MODE_DISABLE_ATLAS=1 or compose fails. */
    atlasUrl: v.optional(v.string()),
    /** Convex asset id of the atlas — used by /inspect for re-fetch. */
    atlasAssetId: v.optional(v.id('asset')),
    /** ProposedTextOverlay[] from lib/agent/text-apply: one per text-bearing
     *  safe zone × locale. The canvas drops these as editable geo shapes
     *  with global/local scope; persisting them is what survives a refresh. */
    textOverlays: v.optional(v.any()),
    /** Aspect ids that produced bytes via the per-format render (e.g.
     *  ['4x5', '9x16']). Empty / absent when the flag was off. */
    nativePerFormatRendered: v.optional(v.array(v.string())),
    /** Non-fatal warnings from text-overlay planning ('no-safe-zone-found'). */
    textOverlayWarnings: v.optional(v.array(v.string())),
    /** clientRunIds in `capabilityRun` produced by this variation's agent
     *  loop. UI can resolve them back to the per-tool ledger rows. */
    agentRunIds: v.array(v.string()),
    error: v.optional(v.string()),
    startedAt: v.number(),
    finishedAt: v.optional(v.number()),
  })
    .index('by_campaign', ['campaignId'])
    .index('by_workspace', ['workspaceId']),

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
      v.literal('bilibili'),
      v.literal('kuaishou'),
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

  // ─── inbound webhook replies ───────────────────────────────────────────
  // Persisted by the X webhook receiver when a valid tweet_create_events
  // payload arrives. The reply-agent / approval flow reads from this table;
  // the webhook route only writes. `postExternalId` is the id_str of the
  // post that was replied to (in_reply_to_status_id_str).
  inboundReply: defineTable({
    platform: v.literal('x'),
    externalId: v.string(),
    postExternalId: v.string(),
    replyText: v.string(),
    replyAuthor: v.string(),
    receivedAt: v.number(),
  })
    .index('by_platform', ['platform'])
    .index('by_post', ['postExternalId']),

  // ─── lap event log ────────────────────────────────────────────────────
  // Structured events emitted from runAutoMode and its subroutines so
  // creators can debug a lap end-to-end (and so the workspace right rail
  // can show a live tail). Replaces ad-hoc console.logs which only land
  // in serverless stdout. `tag` is hierarchical (e.g. "ingest.url.ok",
  // "research.start", "sam3.one-shot.matched") so the UI can group/filter.
  // `data` carries structured fields per event (counts, ids, latencies).
  lapEvent: defineTable({
    campaignId: v.id('campaign'),
    /** Optional — set when the event scopes to one variation. */
    variationIndex: v.optional(v.number()),
    /** Hierarchical tag — drives UI grouping/filtering. */
    tag: v.string(),
    /** Severity. */
    level: v.union(
      v.literal('debug'),
      v.literal('info'),
      v.literal('warn'),
      v.literal('error')
    ),
    /** Short human-readable line. */
    message: v.string(),
    /** Structured fields (counts, ids, latencies). v.any keeps the
     *  schema flexible while we iterate on the event vocabulary. */
    data: v.optional(v.any()),
    ts: v.number(),
  })
    .index('by_campaign', ['campaignId'])
    .index('by_campaign_ts', ['campaignId', 'ts']),
});
