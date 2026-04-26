# aether — _Built with Opus 4.7_ submission

**Track:** What's next.
**Live:** [aether-stg.berlayar.ai/workspace/demo-ws](https://aether-stg.berlayar.ai/workspace/demo-ws)
**Repo:** [github.com/erniesg/aether](https://github.com/erniesg/aether)
**Kickoff:** 2026-04-21 12:30 PM EDT — every line of code in this repo was authored after kickoff.

---

## The thesis

**Creative is responsive by default.**

The web got responsive layout when the unit of a page became the _component_, not the pixel. Creative tools never made that leap. Today's "AI-native" tools still treat every format — square post, story, banner, reel cover — as a separate document a creator has to re-key, re-position, re-translate. The "AI" part is a side button. The drudge work is in the gaps between AI calls.

aether makes the creative idea itself responsive: one intent-aware primitive that renders across formats, languages, and edits without re-keying.

This is a tool only possible now. It needs a model that can reason over intent + brand voice + safe zones + crop geometry + multilingual register + provenance — at once, in the same forward pass. Opus 4.7 is the first model that closes that loop reliably.

---

## The new primitive — `SemanticCreativeComponent`

```ts
interface SemanticCreativeComponent {
  hero: { description: string };
  product?: { description: string };
  offer?: { weight: 'aggressive' | 'soft' };
  mood: { keywords: string[] };
  safeZones: SafeZone[];           // normalized, BCP47-locale-agnostic regions
  cropPriorities: { primary, secondary? };
  formats: FormatTarget[];
}
```

A typed creative idea. Coordinates are normalized `[0, 1]` in the source frame so they survive any crop arithmetic. Safe zones reserve negative space for editable text overlays — copy is never baked into the image.

This single value drives every downstream renderer:

- **Layout-aware image prompt** — turns the component into the prompt that actually goes to gpt-image-1 / Seedream / Gemini.
- **Crop-from-hero** — geometric crop math to every format from a single hero render.
- **Multilingual text overlays** — one BCP-47-keyed copy block per text-bearing safe zone.
- **Global-edit propagation** — _"make the product feel more premium but keep the offer aggressive"_ patches the component, every downstream render re-runs.

---

## The demo loop

1. **Sketch** — rough strokes on the canvas (eyes-closed-friendly). Voice nudges allowed.
2. **Inputs** — references, brand facts, offer, campaign, output formats in the left rail.
3. **Sketch → component** — Opus 4.7 reads the sketch + brand + refs and emits a `SemanticCreativeComponent` via forced tool-use.
4. **One hero render** — a single text-free image at the largest format, with safe zones encoded in the prompt so they survive every crop.
5. **Crop, don't re-render** — geometric crops to IG post / story / reel cover / LinkedIn banner. No extra generation. Safe zones intact.
6. **Multilingual overlays** — Opus 4.7 emits per-zone, per-locale copy. zh-SG, en-US, fr-FR all share the same hero. Edit copy, not image.
7. **Global edit, surgical preservation** — _"keep the offer aggressive but soften the mood"_ → component patches, hero re-renders, crops re-flow, copy re-translates. Local overrides survive.

The render strategy is dual: when format aspect-spread is tight (≤ 2×) we crop from one hero; when wide, we fan out to per-format renders. Auto by default, manual override on the composer chip.

---

## What was built

### The agents (Opus 4.7, forced tool-use, prompt-cached system)

| Agent | What | Lives in |
|---|---|---|
| `sketchToComponent` | Rough sketch + brand → `SemanticCreativeComponent`. Vision, forced tool-use. | [`lib/agent/sketch-to-component.ts`](https://github.com/erniesg/aether/pull/111) |
| `applyComponentEdit` | Component + natural-language instruction → patched component. Surgical preservation of un-mentioned fields. | [`lib/agent/edit-component.ts`](https://github.com/erniesg/aether/pull/112) |
| `applyTextOverlay` | Component + brand + locale list → multilingual copy per text-bearing safe zone. BCP-47 map per zone. | [`lib/agent/text-apply.ts`](https://github.com/erniesg/aether/pull/113) |
| (planner) | Brand URL → multi-worker brand profile + offer + campaign drafts. 3 Claude workers in parallel. | live on stg via `/api/brand/propose` |

### The renderers

| Module | What | Lives in |
|---|---|---|
| `buildLayoutAwarePrompt` | Component → image-gen prompt with safe zones + mood + brand voice woven in. | [`lib/prompt/layout-aware.ts`](https://github.com/erniesg/aether/pull/109) |
| `cropHeroToFormats` | Hero asset + format list + safe zones → per-format crops, geometry-correct. | [`lib/canvas/cropToFormat.ts`](https://github.com/erniesg/aether/pull/110) |
| `pickRenderMode` | Format set → `crop` or `fanout` (auto / override). Pure heuristic. | [`lib/canvas/render-mode.ts`](https://github.com/erniesg/aether/pull/114) |

### The substrate

- **Canvas:** tldraw 3 with the operator chrome stripped — aether owns the toolbar, lenses, and floating canvas chrome. The canvas is the substrate, not a sidebar widget.
- **Single synthesis-shell workspace:** every interaction stays in `/workspace/[wsId]`. Lenses (`canvas`, `focus`, `timeline`, `graph`, `mood`, `chat`) are camera modes, not separate routes.
- **Strict UI taxonomy:** `input` (left rail), `output` + `metadata` (right rail), `tool` (canvas + composer chrome), `navigation` (header). Nothing mixes.
- **Provider-agnostic AI:** OpenAI / Gemini / Volcengine / Anthropic adapters behind one interface. Default model is env-config, never hardcoded.
- **Typed provenance:** every mutation records a `CapabilityRun` with inputs, outputs, snapshot refs, run kind. Replayable.
- **Graph-first persistence:** Convex is the source of truth; tldraw local store debounces snapshots up. Reactive subscriptions keep rails / canvas / right rail coherent.
- **Voice (gemini-live):** realtime voice tools wired for hands-on-canvas creators. `add_text` / `edit_text` / capability-pin commands are the next layer.

### Deploy

- **Edge runtime:** Cloudflare Workers via `@opennextjs/cloudflare` for Next 15 App Router.
- **Live:** `aether-stg.berlayar.ai` (this branch) + `aether.berlayar.ai` (production).
- **Convex backend:** `oceanic-dolphin-808.convex.cloud`.
- **Image gen on stg:** OpenAI gpt-image-1; switchable to Seedream / Gemini per workspace `providerPrefs`.

---

## Why Opus 4.7 specifically

The component pivot above only works if a single model can do all of these in one pass:

- Read a sketch _and_ understand creative intent (vision + reasoning).
- Reserve safe zones that survive every aspect ratio (spatial reasoning).
- Hold brand voice across mood, copy, and CTA tonality (long context + voice fidelity).
- Translate idiomatically across BCP-47 locales without losing register (multilingual fluency).
- Edit surgically — touch what was asked, leave the rest exactly as it was (instruction following).
- Emit forced-tool-use JSON every time (structured-output reliability).

The agents above use forced tool-use with ephemeral system-prompt caching for repeat-call discount — the cache hit rate compounds across the demo loop.

---

## What's not in the demo (deliberate)

- **Smart-placement v2** (face / brand-mark avoidance via vision inventory) — issue #89, post-demo.
- **Voice text tools** (`add_text` / `edit_text` / `lift_text` / `relayout_text`) — issue #84, post-demo.
- **Research → moodboard** (Pinterest / IG / TikTok signal ingestion) — issue #98, post-demo.
- **Publish loop** (scheduled posts, retry, channel adapters) — issues #56 / #57, post-demo.
- **Eyes-closed sketch+voice flow** — gravy; the sketch path stands without it.
- **Capability invention** (Claude writing a new tool spec on demand) — the moat after the demo.

These are deferred, not vapor. Each has a tracking issue with acceptance criteria; see [the repo's Issues tab](https://github.com/erniesg/aether/issues).

---

## Run the loop yourself

```bash
git clone git@github.com:erniesg/aether.git
cd aether
npm install
npx convex dev          # one terminal
npm run dev             # another; opens :3000
```

Open `/workspace/demo-ws`. Sketch on the canvas, fill the rail (or paste a brand URL — it autoproposes), drop a prompt in the composer. The loop above runs end-to-end against your own Anthropic + OpenAI + Convex keys.

For the deployed version: `https://aether-stg.berlayar.ai/workspace/demo-ws`.

---

## Hackathon-window receipts

- **2026-04-21 12:30 PM EDT** — kickoff.
- **2026-04-22 morning SGT** — Phase 1 demo, M1–M10 live on stg.
- **2026-04-23 — 2026-04-24** — capability factory, voice realtime, spatial canvas pass.
- **2026-04-25** — pivot to "creative is responsive by default" thesis. Issues #105 / #106 / #107 / #108 / #90 (rescoped) opened.
- **2026-04-25 — 2026-04-26** — agents + renderers + render-mode selector landed as PRs #109 / #110 / #111 / #112 / #113 / #114.

Every commit carries `Co-Authored-By: Claude Opus 4.7 (1M context)` so the audit trail of what the model wrote vs what the human wrote is in `git log`.
