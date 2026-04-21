# TESTING.md

Red/green strategy + the acceptance checklist the demo must pass.

## Strategy

| Layer | Framework | What it covers |
|---|---|---|
| Unit | Vitest | pure logic: provenance stamping, capability-definition synthesis, rail taxonomy rules, provider-router routing |
| Contract | Vitest | each `ImageGenProvider` / `VideoGenProvider` adapter: same request in → same `ImageGenResult` shape out. Mocked HTTP; one live test gated by env var |
| Component | Vitest + React Testing Library | rail sections, floating toolbar, prompt composer, right-rail action log, canvas shape definitions |
| Convex | Convex test harness | schema invariants, mutations, query projections |
| E2E | Playwright | the demo arc — workspace loads, generate → canvas, pin → reuse, multiformat fan-out, export pack |

## Red/green loop

1. Write the failing test for the next slice of behavior. Commit with `test:` prefix.
2. Write the minimal code to turn it green. Commit with `feat:` / `fix:` prefix.
3. Refactor if needed. Commit with `refactor:` if structural.
4. Repeat.

Keep commits small enough that any one could be reverted without cascading breakage.

## Acceptance checklist (the demo must pass every one of these)

### A1 — Workspace loads

- [ ] `aether.berlayar.ai/workspace/demo-ws` returns 200 under 2s cold, under 500ms warm.
- [ ] Synthesis shell renders with left rail (8 icons in lifecycle order), floating canvas toolbar, prompt composer (with scope + input-set chips), right rail (focus + versions + observations + sync).
- [ ] No `input`/`output`/`tool`/`nav`/`metadata` category is mixed inside a single panel.
- [ ] Rail sections default to icon + summary chip; expand on click.

### A2 — Input composition

- [ ] Pinning a reference in the Refs section marks it visible in the Input-set chip in the composer.
- [ ] Brand swatches in the Brand section drive a live brand preview in the Input-set chip when expanded.

### A3 — Generate → canvas

- [ ] Typing a prompt and pressing Enter routes the request to Claude Opus 4.7.
- [ ] Claude calls the `generate_image` tool; the provider router picks the env-configured adapter.
- [ ] Result lands as a tldraw-native shape within 15s for the primary provider.
- [ ] A `capabilityRun` record is persisted with `tool='image-gen'`, `provider=...`, inputs, outputs, before/after snapshot refs.
- [ ] A provenance card appears in the right rail with the provider, model, latency.
- [ ] Switching provider via `?provider=<id>` URL override re-routes without code change.

### A4 — Pin as capability (hero)

- [ ] The generation card in the right rail has a visible `pin as skill` affordance.
- [ ] Clicking pin opens a dialog with Claude's proposed `CapabilityDefinition` (name, natural-language trigger, param schema).
- [ ] Accepting persists a `capabilityDefinition`; a new chip appears on the floating canvas toolbar.
- [ ] Clicking the pinned-skill chip with a different layer selected re-runs the same tool-chain against that layer.
- [ ] The re-run writes a new `capabilityRun` referencing the same `definitionId`.

### A5 — Multiformat fan-out

- [ ] Switching the lens to `multiformat` re-frames the canvas to show 3 linked artboards (IG post, IG story, reel cover).
- [ ] Editing the hero headline in the composer at global scope propagates to all 3 artboards within 500ms of Convex round-trip.
- [ ] Toggling `local` scope on the story artboard and nudging the CTA keeps that nudge scoped when the global copy is next edited.
- [ ] Safe-zone overlays render correctly per platform spec.

### A6 — Export pack

- [ ] Clicking `export pack` opens the sidecar preview.
- [ ] Preview lists 3 PNGs + `manifest.json`.
- [ ] Downloaded pack contains the 3 rendered PNGs at the correct dimensions + a manifest with inputs, brand tokens, capability runs (with provenance), and pinned-skill names used.

### A7 — Cross-provider proof

- [ ] The demo runs successfully with at least two providers selected at different points (e.g. Gemini for the first generate, Seedream via Volcengine for the second). Proves the abstraction is real.

### A8 — Taxonomy + restraint holding under use

- [ ] Throughout the full demo, no new text paragraph has been introduced into any rail panel. Labels stay short; expansion is the primary disclosure mechanism.
- [ ] No tool verb appears in the left or right rail.
- [ ] No lens button appears in the shell header; it lives on the canvas.

### A9 — Deploy pipeline

- [ ] `npm run deploy:stg` publishes to `aether-stg.berlayar.ai` with zero manual DNS steps.
- [ ] `npm run deploy:prod` publishes to `aether.berlayar.ai`.
- [ ] Observability logs are accessible via `wrangler tail --env <stg|prod>`.

### A10 (stretch) — Video on canvas

- [ ] `animate` prompts route to `VideoGenProvider`; the chosen adapter produces a clip.
- [ ] The clip lands as a canvas-native `MotionAsset` with the same provenance contract as image layers.
- [ ] Plays inline on the canvas; exports into the same pack.

## Human-gate checklist

Gates are called out in the task tracker and in commit messages. At each gate the user opens the stg URL and verifies the relevant A-section. I do not mark the preceding phase as complete until the user confirms.

| Gate | Phase | Confirms |
|---|---|---|
| G-2b | after scaffold | stg URL resolves; Convex connects; Anthropic health-check passes |
| G-3b | after shell + rails | A1, A2, A8 |
| G-4b | after generate loop | A3, A7 |
| G-5b | after pin-as-capability | A4 |
| G-7 | after polish + prod deploy | A1–A9 on prod |
