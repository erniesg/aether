# Handoff — Q3: Fan-out + editable text + multilingual

**Demo question 3.** "Fan-out into formats + editable text + multilingual."

You are picking up this slice cold. Read this whole file before opening any code.

## Goal

Once a creator has a hero scene on the canvas, they can fan it out to 4+ platform formats. Every text on every variant must be **editable as a vector layer** (not baked into the image), **placed intelligently around faces / products / safe zones**, and **per-locale (BCP-47)** so a single hero generates English + zh-Hans + ja-JP + … without re-prompting.

## Current state on `main` (commit `2c7d59ee` on stg)

What works:
- Multiformat fan-out scaffold: `lib/canvas/fanOut.ts` (`pickAspectRatio`, `dropImageInFrame`, `dispatchFanOut`).
- Four hero artboards seed automatically: `lib/canvas/seedArtboards.ts` (IG post 1080×1350, Story 1080×1920, Reel cover 1080×1920, LinkedIn 1200×627).
- Visual-only image composition: `lib/providers/image/composition.ts` strips baked text from OpenAI/Gemini/Replicate/Volcengine outputs (PR #72 merged).
- Text-overlay schema **not** on main yet — lives on PR #74 (`claude/issue-67-...`, `aether-text-overlay-foundation` worktree). Includes `BCP47LocaleCode` brand type, `TextOverlayLayer`, `AetherTextPlacement`, stub `executeTextApply`.
- `lib/text-overlay/capability.ts` stub returns canned placement.

What's missing (the work):
1. **Real text-apply executor** (issue #90) — replace the stub with a Claude Opus 4.7 planner that takes `{ content: BCP47Map<string>, style, image, safeZones }` and returns a real `AetherTextPlacement`.
2. **Segment-aware placement** — the planner reads SAM3 segmentation masks (already wired at `app/api/segment/route.ts`) to avoid placing copy over faces, products, or logos.
3. **Multilingual auto-translate** — given canonical copy in one locale, a Claude tool produces variants for the other locales in the BCP47 map.
4. **Per-aspect overrides** — when a creator nudges copy on the Story artboard, it stays scoped to Story; the global edit propagates to other artboards.
5. **Toolbar + grouping** (issue #88) — selection toolbar UI for editing text layers + grouping with images.

## Architecture (per provider mandate)

| Job | Provider |
|---|---|
| Planner / placement reasoning | Claude Opus 4.7 (Anthropic SDK in `lib/agent/`) |
| Image gen (when re-rendering bg) | OpenAI only (`IMAGE_GEN_PROVIDER=openai`) |
| Segmentation | SAM3 Modal (`/api/segment` route, no Claude in loop) |
| Translation | Claude Opus 4.7 (it's strong at zh-Hans/zh-Hant/ja-JP/ko/vi) |

Use prompt caching on the placement planner's system prompt — it doesn't change per call.

## Acceptance criteria (red/green)

Each test failing first.

1. `executeTextApply({ content, style, image })` (replacing the stub in `lib/text-overlay/capability.ts`) returns a placement that respects `safeZones` and avoids `forbiddenRegions` (faces / products / logos surfaced from segmentation).
2. `proposeMultilingualVariants({ canonical, targetLocales })` returns a populated BCP47 map for at least `en`, `zh-Hans`, `ja-JP`. Test against a fixture with mocked Anthropic.
3. Per-aspect override: editing copy on artboard A while `scope: 'local'` does **not** propagate to artboards B–D. Editing with `scope: 'global'` does.
4. `app/api/text-overlay/apply/route.ts` POST endpoint accepts `{ snapshotImageDataUrl, content, style, locale, mode: 'global' | 'local' }` and returns `AetherTextPlacement`.
5. UI: selecting an image on the canvas shows a "+ text" affordance in the existing FloatingToolbar; clicking it inserts an editable text layer at the planner's placement.
6. Selection toolbar (issue #88) groups image + text-overlay siblings so they move together.
7. E2E (Playwright): seed canvas → drop hero ref → composer "tonight only" → fan-out → confirm 4 artboards each with editable text vectors + correct copy in `en` and one CJK locale.

## Files to read

- `AGENTS.md`, `CLAUDE.md` (hard rules — single shell, restraint, provider-agnostic)
- `lib/canvas/fanOut.ts`, `lib/canvas/seedArtboards.ts`
- `lib/providers/image/composition.ts`, `lib/providers/image/composition-resolve.test.ts`
- PR #74's worktree: `/Users/erniesg/code/erniesg/aether-text-overlay-foundation/lib/text-overlay/`
- `app/api/segment/route.ts`, `lib/segment/`
- Issue #90 (real text-apply executor), #88 (toolbar grouping), #89 (raster text lift), #66 (umbrella)

## Validation path

```bash
cd /Users/erniesg/code/erniesg/aether          # or a fresh worktree
npm test                                        # 542+ tests
npm run typecheck
PORT=3107 npx playwright test tests/e2e/text-overlay-fanout.spec.ts
npm run cf-build
# don't deploy until human review
```

## Stretch (defer if tight)

- Raster text lift (issue #89) — OCR baked text in legacy assets and convert to editable layers.
- Per-platform safe-zone presets beyond what `safeZones.ts` already has.
- Streaming progress on placement (creator sees the planner thinking).

## Out of scope

- Voice or air-brush.
- Postiz / scheduling.
- New image-gen provider adapters.

## Commit conventions

`Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>` on every commit. Prefix `feat:`, `fix:`, `test:`, `chore:`. Don't force-push main. Use a worktree like `aether-text-overlay-real-executor` if iterating in parallel.
