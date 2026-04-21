# ARCHITECTURE.md

## System diagram

```
┌──────────────────────────────────────────────────────────────┐
│  Browser                                                      │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ Next.js App Router (React 18 + TS)                     │  │
│  │  • /workspace/[wsId] — single synthesis shell          │  │
│  │  • left rail · floating canvas toolbar · right rail    │  │
│  │  • prompt composer (bottom)                            │  │
│  │  • tldraw 3.x canvas, local store                      │  │
│  └────────────────────────────────────────────────────────┘  │
│         │ reactive subscriptions       │ agent calls         │
│         ▼                               ▼                     │
└─────────┼───────────────────────────────┼─────────────────────┘
          │                               │
     ┌────▼────┐                     ┌────▼────────────────┐
     │ Convex  │                     │ CF Worker (Next.js) │
     │ (state) │                     │  route handlers     │
     │         │                     │  R2 asset bindings  │
     │ queries │                     └────┬────────────────┘
     │ mutate  │                          │
     │ actions │◄──── tool calls ─────────┤
     └────┬────┘                          │
          │                               │
          │    ┌──────────────────────────▼────────────────┐
          │    │ Claude Opus 4.7 (Anthropic API)           │
          │    │   tool use + prompt caching               │
          │    └─┬─────────────────────────────────────────┘
          │      │
          │      │ invokes named tools
          │      ▼
          │    ┌──────────────────────────────────────────┐
          │    │  ImageGenProvider interface              │
          │    │   adapters:                              │
          │    │     • openai                             │
          │    │     • gemini                             │
          │    │     • replicate (flux, ideogram, etc.)   │
          │    │     • volcengine-ark (seedream 5)        │
          │    └──────────────────────────────────────────┘
          │    ┌──────────────────────────────────────────┐
          │    │  VideoGenProvider interface              │
          │    │   adapters:                              │
          │    │     • remotion (programmatic)            │
          │    │     • volcengine-ark (seedance 2)        │
          │    │     • replicate (runway, luma, kling)    │
          │    │     • heygen (hyperframes)               │
          │    └──────────────────────────────────────────┘
          │
          ▼
     ┌─────────────────────────┐
     │ R2 (Cloudflare)         │
     │   workspace/{wsId}/...  │
     │   generated assets      │
     │   export packs          │
     └─────────────────────────┘
```

## Stack rationale

- **Next.js 15 + App Router** — aligned with prehack experience; `@opennextjs/cloudflare` adapter ships Next.js cleanly to CF Workers.
- **CF Workers (not Pages)** — `workers.dev` unified setup. Modeled on `tong-berlayar-web` — confirmed working deployment pattern at `berlayar.ai` subdomains.
- **Convex** — reactive subscriptions remove the need for hand-rolled WebSocket plumbing. The rail ↔ canvas ↔ right-rail coherence is free.
- **tldraw in local-mode** — canvas store lives in the browser; we debounce snapshots to Convex so reload resumes. Upgrading to `tldraw-sync-cloudflare` (Durable Objects) is a later slice if multi-user editing becomes important.
- **Claude Opus 4.7** — the hackathon premise. Opus plans, calls provider tools, summarizes actions into capability definitions, proposes re-runs.
- **Provider-agnostic AI** — no default model in code. Env vars and/or per-request headers pick the provider. Demos can switch on the fly.

## Data model (Convex schema — v0.1)

```ts
// convex/schema.ts — sketch
export default defineSchema({
  workspace: defineTable({
    name: v.string(),
    createdAt: v.number(),
    ownerId: v.string(),
  }),

  // left rail — inputs
  sourceItem: defineTable({
    wsId: v.id('workspace'),
    kind: v.union(v.literal('url'), v.literal('upload'), v.literal('pinterest'), v.literal('ig')),
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

  brandToken: defineTable({ wsId: v.id('workspace'), palette: v.array(v.string()), type: v.array(v.string()), voice: v.optional(v.string()) }).index('by_ws', ['wsId']),
  productFact: defineTable({ wsId: v.id('workspace'), name: v.string(), claims: v.array(v.string()), heroAsset: v.optional(v.string()) }).index('by_ws', ['wsId']),
  brief: defineTable({ wsId: v.id('workspace'), audience: v.string(), cta: v.string(), locale: v.string(), funnelStage: v.string() }).index('by_ws', ['wsId']),

  outputTarget: defineTable({ wsId: v.id('workspace'), platform: v.string(), format: v.string(), dimensions: v.object({ w: v.number(), h: v.number() }), safeZones: v.array(v.any()) }).index('by_ws', ['wsId']),

  // canvas state
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

  // capability system — the hackathon hero
  capabilityDefinition: defineTable({
    wsId: v.id('workspace'),
    name: v.string(),
    trigger: v.string(),            // natural-language re-trigger Claude learned
    paramSchema: v.any(),           // JSON schema-ish
    exampleRunId: v.optional(v.id('capabilityRun')),
    createdBy: v.union(v.literal('human'), v.literal('agent')),
    version: v.number(),
  }).index('by_ws', ['wsId']),

  capabilityRun: defineTable({
    wsId: v.id('workspace'),
    definitionId: v.optional(v.id('capabilityDefinition')),
    tool: v.string(),               // e.g. 'image-gen', 'bg-fill', 'cutout'
    provider: v.string(),           // e.g. 'volcengine:seedream-5'
    inputs: v.any(),
    outputs: v.any(),
    beforeSnapshotRef: v.optional(v.string()),
    afterSnapshotRef: v.optional(v.string()),
    startedAt: v.number(),
    finishedAt: v.optional(v.number()),
    status: v.union(v.literal('running'), v.literal('ok'), v.literal('error')),
  }).index('by_ws', ['wsId']),

  // observations (agent notes, right rail)
  observation: defineTable({
    wsId: v.id('workspace'),
    severity: v.union(v.literal('info'), v.literal('warn'), v.literal('error')),
    text: v.string(),
    affectedNodes: v.array(v.string()),
    createdAt: v.number(),
  }).index('by_ws', ['wsId']),

  exportPack: defineTable({
    wsId: v.id('workspace'),
    keyVisualId: v.id('keyVisual'),
    manifestUrl: v.string(),
    downloadUrl: v.string(),
    createdAt: v.number(),
  }).index('by_ws', ['wsId']),
});
```

## Provider contracts

```ts
// lib/providers/image/types.ts
export interface ImageGenRequest {
  prompt: string;
  refs?: { url: string; weight?: number }[];
  aspectRatio?: '1:1' | '9:16' | '16:9' | '4:5' | '3:4';
  size?: { w: number; h: number };
  seed?: number;
  style?: Record<string, unknown>;
  n?: number;
}

export interface ImageGenResult {
  provider: string;
  model: string;
  images: { url: string; mimeType: string; width: number; height: number }[];
  latencyMs: number;
  raw?: unknown; // provider-specific payload for debugging
}

export interface ImageGenProvider {
  id: string;                          // 'openai' | 'gemini' | 'replicate' | 'volcengine'
  listModels(): Promise<string[]>;
  generate(req: ImageGenRequest, opts: { model: string }): Promise<ImageGenResult>;
  edit?(req: ImageGenRequest & { sourceUrl: string; maskUrl?: string }, opts: { model: string }): Promise<ImageGenResult>;
}
```

```ts
// lib/providers/video/types.ts
export interface VideoGenRequest {
  prompt?: string;
  sourceImageUrl?: string;            // image-to-video
  sceneSpec?: unknown;                // programmatic (Remotion) payload
  durationSec: number;
  aspectRatio: '1:1' | '9:16' | '16:9' | '4:5';
  fps?: number;
}

export interface VideoGenResult {
  provider: string;
  model: string;
  videoUrl: string;
  posterUrl?: string;
  durationSec: number;
  latencyMs: number;
  raw?: unknown;
}

export interface VideoGenProvider {
  id: string;                          // 'remotion' | 'volcengine' | 'replicate' | 'heygen'
  listModels(): Promise<string[]>;
  generate(req: VideoGenRequest, opts: { model: string }): Promise<VideoGenResult>;
}
```

The provider chosen for a run is decided by the agent loop based on env config or an explicit override in the request. Provider selection never leaks into UI components.

## Agent loop

```
user prompt
   │
   ▼
CanvasContext (current selection, active input set, brand, brief, targets, recent provenance)
   │
   ▼
Claude Opus 4.7 — with tools:
   • generate_image(req)         → ImageGenProvider (router picks adapter)
   • generate_video(req)         → VideoGenProvider
   • edit_layer(layerId, spec)   → mask/cutout/bg-fill/relight/outpaint
   • propose_capability(spec)    → returns a CapabilityDefinition draft
   • record_observation(text)    → writes to right rail
   │
   ▼
Each tool call records a CapabilityRun with inputs + outputs + before/after refs
   │
   ▼
Result lands on tldraw canvas as a native shape (image layer / motion layer / overlay)
```

Prompt caching: the system prompt (hard rules + current workspace truth) is cached. Per-turn deltas carry only the new user prompt + recent observations.

## Deploy topology

```
Cloudflare Workers
  ├─ aether-stg  (env: staging, route: aether-stg.berlayar.ai)
  └─ aether      (env: production, route: aether.berlayar.ai)

Convex
  ├─ aether-stg  (staging deployment)
  └─ aether      (production deployment)

R2 buckets
  ├─ aether-stg-assets
  └─ aether-assets
```

Wrangler with `[env.staging]` and `[env.production]` blocks. Secrets via `wrangler secret put --env <stg|prod>`. Local dev via `.dev.vars`.

## Parallel-work contract

Each module exports a narrow public API and owns its tests:

- `components/rail/<Section>.tsx` + `components/rail/<Section>.test.tsx`
- `components/canvas/<Shape>.tsx` + `components/canvas/<Shape>.test.tsx`
- `lib/providers/image/<adapter>.ts` + `lib/providers/image/<adapter>.contract.test.ts`
- `lib/agent/<capability>.ts` + `lib/agent/<capability>.test.ts`
- `convex/<domain>.ts` + `convex/<domain>.test.ts`

A fresh agent can pick up any one of these modules in a worktree, run its tests, and ship a slice without coordinating with other modules beyond the public contract in this doc. Integration tests live in `tests/e2e/` and are the only place where all modules meet.

## Related

- [`PRD.md`](./PRD.md) — scope + success criteria
- [`DEMO.md`](./DEMO.md) — 3-min demo arc
- [`TESTING.md`](./TESTING.md) — red/green gates
- [`../AGENTS.md`](../AGENTS.md) — product identity
- [`../CLAUDE.md`](../CLAUDE.md) — agent guardrails
