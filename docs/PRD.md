# PRD — aether (hackathon slice)

**Version:** 0.1 · hackathon MVP
**Window:** overnight build, demo by morning of 2026-04-22 SGT
**Context:** _Built with Opus 4.7_ hackathon. Repo: https://github.com/erniesg/aether. All code authored after kickoff 2026-04-21 12:30 PM EDT.

## Problem

Creators stitching campaign assets across 8+ social formats waste hours on drudge work that has nothing to do with creative intent. Existing tools (Canva, Figma plugins, Photoshop generative fill) treat AI as a side button and force creators into a linear _generate → export → paste_ loop. Every format is re-keyed manually. Every variant is a mini project.

## Bet

The defensible direction is **not** "Canva with AI buttons." It is a **canvas-native creative system** where:

1. The canvas is the substrate — references, generations, and variants all live on the same surface.
2. AI actions happen _on_ the canvas, not in a side tool.
3. Creators can pin any AI-driven action as a reusable capability — so the tool learns their aesthetic instead of forcing them to re-prompt.
4. One hero scene fans out to linked multiformat variants; global edits propagate; overrides stay scoped.

The moat is layers 3+4. The hackathon proves the direction without shipping the full moat.

## MVP — "must have" (Phases 0–6)

| # | Capability | Why |
|---|---|---|
| M1 | Canvas-native synthesis shell (single route, lens-switched) | Frames the product as one loop, not five pages |
| M2 | Left rail with input-category sections (sources, refs, clusters, input set, brand, product, brief, targets) in collapsed-by-default icon mode | Enforces strict taxonomy and progressive disclosure |
| M3 | Prompt composer at the bottom with scope chip + active-input-set chip | Unifies the "what to generate" surface |
| M4 | Provider-agnostic image generation (≥ 2 adapters wired: Gemini + Volcengine Seedream) | Prove abstraction holds; demo can pick any provider at runtime |
| M5 | Result lands on the canvas as a typed layer with full provenance | Canvas-is-substrate principle made literal |
| M6 | Pin-as-capability: Claude summarizes an action into a `CapabilityDefinition`, user pins it, it becomes a reusable chip on the floating toolbar | **The hackathon hero beat** — foregrounds Opus 4.7 as a capability author, not just a chatbot |
| M7 | Linked multiformat fan-out: 3 artboards (IG post 1080², IG story 1080×1920, reel cover) with global-propagate + per-variant override flag | Creator loop closes; "one edit → many assets" demo |
| M8 | Export pack (zip of PNGs, one per variant) with provenance manifest | Demo-complete output |
| M9 | Right rail: active artifact, version strip, action log, provenance summary | Observability without operator-ness |
| M10 | Deploy pipeline: `aether-stg.berlayar.ai` + `aether.berlayar.ai` auto-deploy via CF Workers | Live URLs for demo |

## Wow-factor — "should have" (Phase 7)

| # | Capability | Why |
|---|---|---|
| W1 | Demo seed data + polish pass | 3-min story flows without hitches |
| W2 | Recorded demo video | Shippable artifact |

## Stretch — "could have" (Phase 8)

| # | Capability | Why |
|---|---|---|
| S1 | Video-on-canvas: `MotionAsset` as a canvas-native shape | Per handoff, the strongest demo enhancer |
| S2 | Remotion adapter (programmatic motion from hero scene — deterministic, guaranteed-to-work) | Safer bet than a pure AI clip provider |
| S3 | Volcengine Seedance 2 adapter (AI video) | Hot Chinese model available via existing Ark key |

## Later-moat — explicitly deferred

- Team library / marketplace for shared capabilities
- Agentic capability _invention_ (user asks for something genuinely novel → Claude writes a new tool spec + code)
- Real signal ingestion from Pinterest / IG / TikTok / XHS / web
- Scheduling + automated posting to platforms
- Multi-user collaboration with tldraw-sync-cloudflare
- Voice UX
- Multi-language translation fan-out (zh-SG ↔ en-US)
- Full observability and admin dashboards
- Payments, attribution, public distribution

## User types we're designing for

1. **Creative director** — gathers references, explores concepts, iterates tighter with AI instead of briefing a junior designer.
2. **Marketer / agency operator** — campaign assets across channels and locales without tool-sprawl.
3. **Developer / indie maker** — turns a product, repo, or screenshots into shippable social materials solo.

The common promise: _aether is the AI-native co-creator that moves upstream material to finished creative outputs in one place._

## Success criteria

The demo is a success if, end-to-end on `aether.berlayar.ai`:

1. A first-time user can ingest 2–3 references, compose an input set, and generate an image on the canvas in under 60 seconds.
2. A Claude-driven action can be pinned as a capability and re-applied to a different layer.
3. One hero scene fans out to three linked artboards; a local override on one artboard is visibly scoped.
4. The export pack downloads with a provenance manifest.
5. All of the above works with at least two different image-gen providers selected via env — proving the abstraction is real.

## Non-negotiables

See `../CLAUDE.md` § Hard rules and `../AGENTS.md` § Product identity. If a proposed change breaks any of those, reject or redesign.

## Timeline + gates

See `docs/TESTING.md` for the red/green acceptance checklist and `docs/DEMO.md` for the 3-min arc. Human validation gates at Phases 2b, 3b, 4b, 5b, 7 per the tracked task board.
