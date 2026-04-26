# aether

> A canvas-native creative system for SG creators and SMEs.
> Drop a URL, watch it fan out into 16 ready-to-post variants across 4 aspect ratios × 4 SG locales, all live-traceable, all editable.
> Built for the **Built with Opus 4.7** hackathon (2026-04-21 → 2026-04-27).

---

## What it does in one screen

```
1.  paste eightsleep.com  →  agent loop (Opus 4.7 + tools)
2.  → vision-describe with brand context  ("Pod 4 Ultra Hub", not "air purifier")
3.  → 1 hero render @ 1024² (gpt-image-2)
4.  → 3 NATIVE per-format renders @ 4:5 / 9:16 / 16:9, fired in PARALLEL
5.  → 16 SG-locale text overlays composed onto each format (en-SG · zh-Hans-SG · ms-SG · ta-SG)
6.  → 4×4 atlas uploaded to Convex storage
7.  → Discord embed with the atlas, ready to review
8.  → /inspect/<campaignId> for the full ledger
9.  → auto-post (X / IG / TikTok / Pinterest via direct adapters or Postiz)
```

[`docs/handoffs/auto-mode-evidence/auto-post-smoke-2026-04-26-night/atlas-3-native.png`](./docs/handoffs/auto-mode-evidence/auto-post-smoke-2026-04-26-night/atlas-3-native.png) — real lap output. 16 cells, 4 aspect ratios, 4 SG locales, every locale's typography and copy adapted (not just translated).

---

## Why this exists — built from what we know

Singapore creators and SMEs sit in a particular squeeze:
- They have to ship in **4 SG locales** (en-SG, zh-Hans-SG, ms-SG, ta-SG) — not "translate" but render in each script with locale-correct rhythm.
- They have to ship across **every social aspect ratio** at once — IG feed (4:5), Story / Reel (9:16), banners (16:9), plus the 1:1 default.
- Most have **no design team** — the creator IS the designer, AND the writer, AND the brand strategist, AND the social manager.

What takes a Singapore SME 4–8 hours per campaign launch (gather refs, brief copy, brief design, brief translation, brief social, schedule four times) collapses here into one trigger and ~7 minutes. Domain we know, problem we've felt.

---

## Why this is "for what's next"

The interface itself is the demo. Three things that don't fit the old toolchain:

1. **The brief IS the URL.** No spec doc, no shot list. Drop the brand site, the agent reads page text + JSON-LD products, runs vision-describe **with brand context piped in** so it labels the actual product line ("Pod 4 Ultra Hub") instead of guessing by silhouette ("air purifier"). The bug → fix arc on this is in the trace evidence; the architectural lesson is that vision models are great when you tell them what they're looking at, brittle when you don't.

2. **One hero, N native variants — in parallel.** When `AUTO_MODE_NATIVE_PER_FORMAT=1`, the lap fires `Promise.allSettled` over `gpt-image-2.generate(aspectRatio: '4:5' | '9:16' | '16:9')`. Three image generations finish in roughly the wall time of one. No human sequences renders.

3. **Every action is a typed capability run.** `entryRef → capabilityRun` rows persist in Convex per tool call. `/inspect/<campaignId>` renders the lap as a readable timeline: each step's prompt, provider, model, latency, started/finished. Nothing is opaque. Re-rendering from any step is a single mutation.

---

## Where to trigger and inspect — locally

Everything runs in `npm run dev` (defaults to `http://localhost:3000`; on this dev box port 3002).

| | |
|---|---|
| **Trigger UI** | `/auto-mode` — form with kind, payload, variation count, notifyMode, forcePostNow |
| **Inspect a run** | `/inspect/<campaignId>` — readable timeline of agent steps, prompts, latencies |
| **Workspace canvas** | `/workspace/<wsId>` — synthesis-shell canvas (lens-switched) |
| **Trigger via curl** | `POST /api/auto-mode/run` — body: `{trigger,variationCount,notifyMode,workspaceId,forcePostNow}` |
| **Trace endpoint** | `GET /api/campaigns/<id>/trace` — JSON of campaign + variations + agent steps |

Discord lap-end pings carry the `campaignId` in the embed footer — click into `/inspect/<id>` to see the run.

---

## Demo arc (3 minutes)

1. **Show the gap** (20s) — open `eightsleep.com`. "An SG creator launching this brand needs 4 aspect ratios × 4 SG locales = 16 finished variants. Today that's a week."
2. **Trigger the lap** (10s) — `/auto-mode`, paste URL, hit fire.
3. **While it runs, narrate the architecture** (90s) — pull up `/inspect/<earlier-campaignId>` from a prior run. Walk: `signals-search` → vision-describe with brand context → `generate_image` (1:1) → 3 parallel native renders → text-overlay planner across 4 locales → atlas. "Every step is a `capabilityRun` row. Every output is reproducible from its inputs."
4. **Show the atlas** (40s) — 4×4 grid, point out: native portrait composition for 9:16 (not a crop), Tamil typography that respects the script, Mandarin tonal voice (not literal translation).
5. **Auto-post** (20s) — Discord embed; click into the scheduled-posts row. "One trigger. Twelve scheduled platform-aware posts ready to go."

Live screenshot evidence: [`docs/handoffs/auto-mode-evidence/auto-post-smoke-2026-04-26-night/`](./docs/handoffs/auto-mode-evidence/auto-post-smoke-2026-04-26-night/).

---

## Architecture (skim)

```
URL trigger
  ├─ ingest: fetch+parse → title/description/products[]/images[]/brandPalette/fonts
  │
  ├─ vision-describe (Opus 4.7 vision)         ← brand context piped in here
  │  → products: [{name: "Pod 4 Ultra Hub", description: "..."}]
  │  → brands:   [{name: "Eight Sleep", ...}]
  │
  ├─ agent loop (Opus 4.7 tool use)
  │  ├─ get_current_datetime    (local)
  │  ├─ search_signals          (multi-platform research)
  │  └─ generate_image @ 1:1    (gpt-image-2)
  │
  ├─ post-hero pipeline (parallel)
  │  ├─ SAM3 segmentation A/B   (one-shot + vision-guided)
  │  ├─ text-overlay planner    (4 SG locales, smart-placement aware of forbidden regions)
  │  └─ native-per-format render: Promise.allSettled([4:5, 9:16, 16:9])  (gpt-image-2 × 3)
  │
  ├─ compose: 16 (format × locale) tiles + 4×4 atlas (sharp)
  ├─ persist to Convex File Storage  (heroes, atlas, masks)
  ├─ persist to Convex DB            (campaign, variations, capabilityRun ledger)
  │
  ├─ scheduleVariationPosts (notifyMode=auto-post)
  │  └─ resolvePublisherForPost: x → instagram → postiz → preview (platform-aware)
  │
  └─ Discord lap-end ping with atlas embed + campaignId
```

Provider-agnostic by contract: `lib/providers/image/{openai,gemini,replicate,volcengine}` and `lib/providers/publisher/{x,instagram,postiz,preview,social-auto-upload}`. No model is hardcoded; route via env or per-request hint.

---

## Judging-criteria-aligned answers

**Impact (30%).** Singapore SMEs and creators are the audience we know — they ship multilingual, multi-aspect, on a budget, and currently lose days per campaign to mechanical work. Aether collapses that to minutes. Beyond SG: any small brand with a website and a content calendar is in scope. Multilingual + multi-aspect + provenance is the missing surface, not "another AI image generator."

**Demo (25%).** Concrete: paste `eightsleep.com`, watch a real lap, click `/inspect/<id>` to see every step. Real captures in `docs/handoffs/auto-mode-evidence/`. The atlas in `auto-post-smoke-2026-04-26-night/atlas-3-native.png` is one real lap's output, not a mockup.

**Opus 4.7 use (25%).** Three non-trivial places it's the engine, not a wrapper:
1. **Brand-context piped vision-describe** — `lib/agent/describe-image.ts:buildSystemPrompt(brandContext)`. Without this, vision misidentifies products by silhouette; with it, products are named correctly. This is a small architectural fix that's only obvious once you've seen the failure.
2. **Multilingual copy planner** — `lib/agent/text-apply.ts:applyTextOverlay`. Tool-use call to Opus 4.7 that emits `{ overlays: [{purpose, content: [{locale, text}], textAlign}] }`. Idiomatic per locale, not literal.
3. **Agent loop with the real tool surface** — `lib/agent/multi.ts` runs Claude with `get_current_datetime`, `search_signals`, `generate_image`, `analyze_video`, `cluster_references`. Each tool's input/output is a typed `capabilityRun` row. Provenance ships for free.

**Depth & execution (20%).** Typed provenance on every action (`entryRef → capabilityRun`). Provider-agnostic adapters with contract tests. Fail-soft per stage (vision-describe failure ≠ lap failure; SAM3 failure ≠ text-overlay failure; per-aspect render failure ≠ atlas failure). Vitest 1188 passing across 160 files at the time of this README. `tsc --noEmit` clean. Worktrees for parallel slices.

---

## What's NOT done (intentional gaps)

| | status | next |
|---|---|---|
| Posting to X | blocked at X portal — dev app `32833731` not enrolled in a Project, v2 rejects | upgrade to pay-per-use on developer.x.com OR route via Postiz |
| Posting to IG direct | needs `IG_ACCESS_TOKEN` + `IG_USER_ID` in `.env.local` (long-lived page token via Graph API Explorer) | paste creds, smoke fires |
| Posting to TikTok direct | needs OAuth user token (Client Key + Secret alone insufficient) | OAuth flow build OR route via Postiz |
| **Editable text on canvas** | text overlays exist as data (`textOverlays` field), atlas tiles bake them as PNG | wire `lib/canvas/dropVariantSet.ts` → tldraw text shapes per locale |
| WorkspaceShell AutoModePanel right-rail | trace endpoint live, `/inspect` page works as standalone | wire `components/rail/sections/AutoModePanel.tsx` into `WorkspaceShell.tsx` |
| Brand/product mask consumption | code path complete, SAM3 GPUs freed; current laps return 0 masks | rerun smoke; fallback to vision-derived face/brand bboxes already wired |

These are explicit on the [project board](./docs/handoffs/) and the trade-offs are documented in the corresponding handoff under `docs/handoffs/HANDOFF-2026-04-26-NIGHT-POWER-THROUGH-POSTING-AND-REVIEW.md`.

---

## Tech stack

Next.js 15 · tldraw 3 · Convex (DB + File Storage) · Claude Opus 4.7 (Anthropic SDK + tool use) · OpenNext on Cloudflare Workers · Tailwind · Radix · Vitest + Playwright · sharp · twitter-api-v2.

Image generation: `lib/providers/image/{openai,gemini,replicate,volcengine}.ts` (no hardcoded default).
Publishing: `lib/providers/publisher/{x,instagram,postiz,preview,social-auto-upload}.ts` with platform-aware resolution.
Segmentation: SAM3 over Modal (`SAM3_MODAL_URL`) with vision-guided prompts.

---

## Live

- Staging: `aether-stg.berlayar.ai`
- Production: `aether.berlayar.ai`

## Development

```bash
npm install
cp .env.local.example .env.local        # fill keys (OPENAI/ANTHROPIC/CONVEX/DISCORD/SAM3 minimum)
npm run dev                              # http://localhost:3000

# trigger a lap
open http://localhost:3000/auto-mode

# inspect a run
open http://localhost:3000/inspect/<campaignId>

# tests
npm test                                 # vitest (unit + component)
npm run test:e2e                         # playwright
npm run typecheck && npm run lint
```

Smoke scripts (offline-friendly): `scripts/smoke-compose-atlas.mjs`, `scripts/smoke-auto-post-x.mjs`, `scripts/probe-per-format.mjs`.

## Read these to grok the codebase

- [`AGENTS.md`](./AGENTS.md) — product identity + UI direction
- [`CLAUDE.md`](./CLAUDE.md) — agent guardrails + hard rules
- [`docs/PRD.md`](./docs/PRD.md) — MVP scope, non-goals, success criteria
- [`docs/DEMO.md`](./docs/DEMO.md) — 3-min demo beat sheet
- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — system diagram, schema, provider contracts
- [`docs/handoffs/`](./docs/handoffs/) — every meaningful working session, with smoke evidence
- [Issues](https://github.com/erniesg/aether/issues) — task graph

## License

MIT

---

_Built with Claude Opus 4.7 (1M context). Hackathon kickoff 2026-04-21 12:30 PM EDT — every commit on `main` is post-kickoff._
