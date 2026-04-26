# Overnight Push Handoff — 2026-04-27

**Demo:** Built with Opus 4.7 hackathon. Brand for the script: **Eight Sleep** (Pod 4 Ultra). All visuals/products must read as the actual Pod mattress + Hub, not the air-purifier-shaped tower the model has been hallucinating in the 1×1 row.

**Snapshot:** `git tag pre-overnight-snapshot-2026-04-27` — revert with `git reset --hard pre-overnight-snapshot-2026-04-27` if anything overnight goes sideways.

**Demo script Ernie is rehearsing to:** Opus 4.7 + Anthropic Managed Agents → Aether collaborator → Auto Mode (drop URL, get 16 SG-locale-ready posts, edit on canvas, ship). UI must reflect what the BE is actually doing, in both full-auto and step-by-step modes.

---

## Lane A — Canvas frame drop + editable text propagation

**Goal:** When auto-mode produces a variation, its per-format heroes drop *inside* the matching format frames on the canvas (1080×1080, 1080×1350, 1080×1920, 1920×1080) — not as floating "auto v1 / auto v2" shapes off to the side. Then text overlays land on top, scoped `global` (propagates to all 16 locale × format cells of the variation) or `local` (only the cell the user edited). User edits propagate live.

**Where:**
- `lib/auto-mode/canvas.ts` — `dropVariationOnCanvas(editor, variation)` currently drops a frame + atlas + per-format heroes + per-locale text overlays as raw shapes. Frames are *new* shapes, not reused matches of the existing canvas frame placeholders. Rework so it:
  - Looks up existing frames by aspect-ratio metadata (`shape.meta.aspect`/`shape.meta.format` or by matching W:H ratio with tolerance).
  - Drops the per-format hero *as a child* of that frame (or positioned inside its bounds), so the frame contains the image.
  - Drops the per-locale text overlay shapes as siblings inside the same frame, with `meta.scope = 'global' | 'local'` and `meta.variationId`.
- `components/workspace/WorkspaceShell.tsx` — confirm `handleVariationLanded` calls `dropVariationOnCanvas` after frames exist; if frames are missing, create them once per workspace and persist in Convex (don't recreate every lap).
- New: hook into tldraw `editor.store.listen('after')` to detect text-shape edits, classify scope from `shape.meta.scope`, and fan out updates:
  - `global` → update all sibling text shapes for that variation across all formats × locales.
  - `local` → no fan-out.
  - Persist via Convex `campaigns.updateVariationOverlay({variationId, locale, format, scope, text})`.

**Acceptance criteria:**
- Drop `https://www.eightsleep.com/` on canvas → lap fires once → 4 format frames each contain the matching aspect hero + headline/sub overlay.
- Edit the en-SG headline in the 1×1 frame, mark `global` → other 15 cells reflect the change within 1s.
- Edit the same field, mark `local` → only that cell changes; the other 15 stay.
- 16/16 cells visible inside frames; 0 floating "auto v1" stragglers.
- A vitest covers `dropVariationOnCanvas` placing into existing frame bounds; a Playwright spec covers the global/local propagation round-trip.

**Files to study first:** `components/workspace/WorkspaceShell.tsx`, `lib/auto-mode/canvas.ts`, `lib/auto-mode/useCampaignLap.ts`, `convex/campaigns.ts`.

---

## Lane B — Pod product accuracy + Anthropic Managed Agents wiring

**Goal:** The 1×1 atlas cell renders the actual Pod 4 Ultra mattress + Hub, not the tower-shaped device the model defaulted to when guessing. Plus: the demo script promises **Anthropic Managed Agents** doing research fan-out, like-visual clustering, and signoff/scheduling. Wire those in for real, with provenance — no theatre.

**Where (product accuracy):**
- `lib/agent/auto-mode.ts` — already calls `buildBrandContextFromIngestion`. Verify `extractHeroPrompt` + per-format render get the brand context injected into both the gpt-image-2 prompt **and** the SAM3 vision-describe step. Right now native per-format works but 1×1 (the default fallback) does not always inherit the same prompt.
- `lib/agent/per-format-render.ts` — make sure `aspectRatios` includes the 1×1 case explicitly and uses the *same* hero prompt the larger formats use, so the 1×1 isn't drawn from a stale or generic prompt.
- `lib/agent/describe-image.ts` — `pickSegmentPrompt` already prefers visual `description` ≥ 12 chars over brand `name`. Add a regression test using an Eight Sleep ingestion fixture (title + description) → expected SAM3 prompt contains "mattress with thermal cover" or similar (not "white box").
- Stronger reference grounding: when `urlIngestion.heroImage` is present, pass that PNG bytes into `gpt-image-2` as a reference image (Images Edits API) so the generated hero anchors on the real product photo. This is the highest-leverage fix.

**Where (Managed Agents):**
- The Anthropic API now exposes `client.beta.agents.*` (or the equivalent — confirm SDK) for **Managed Agents**. Demo script needs three:
  1. **Research agent** — given `{brand, url, ingestion}`, runs Anthropic web_search + Files API to gather competitor visuals, recent campaigns, locale insights. Returns a structured `ResearchBundle`.
  2. **Cluster agent** — given a pile of references, groups by visual similarity using Claude vision. Returns `Cluster[]` with rationale.
  3. **Signoff agent** — given a variation set + brand guardrails, picks which to auto-post vs hold for review and emits per-platform schedule plan.
- Create `lib/agent/managed/{research,cluster,signoff}.ts` with thin wrappers; persist runs to `capabilityRun` with typed provenance.
- Wire the **research agent** into `runAutoModeLap` so the headline/sub copy can cite signals; surface in the UI under right-rail "research" section.

**Acceptance criteria:**
- Re-running the Eight Sleep lap, atlas cell `1×1 · en-SG` shows recognisable mattress + Hub (not air-purifier tower). Smoke evidence saved under `docs/handoffs/auto-mode-evidence/eightsleep-pod-correct-2026-04-28/`.
- `lib/agent/managed/research.ts` exists, has contract tests with the Anthropic SDK mocked, and `runAutoModeLap` invokes it with telemetry.
- Right-rail surfaces a "research" panel showing the bundle the research agent produced for the current lap (sources, snippets, dates).
- README "Use of Opus 4.7 / Managed Agents" section updated to point at the actual code paths.

**Files to study first:** `lib/agent/auto-mode.ts`, `lib/agent/per-format-render.ts`, `lib/agent/describe-image.ts`, the Anthropic SDK installed in `package.json`, existing `lib/agent/tools/*` for the tool-use loop pattern.

**Note:** If Managed Agents API is not yet available in the SDK we have, build the same shape using regular tool-use with `web_search_20250911` (or whatever the current websearch tool is) + Files API, and document the substitution clearly in the agent files. The *capability* is what matters for the demo.

---

## Lane C — Demo polish: clean state, toolbar, sync, opacity audit

**Goal:** Demo opens with a clean workspace — no "5 PINNED" / "CAMPAIGN-TTT" flash, no spurious render-mode toggle, no opacity bleed anywhere. UI elements truthfully reflect what the BE is doing in both full-auto and step-by-step modes.

**Where:**
- `app/workspace/[wsId]/page.tsx` + `lib/creator-context/*` — eliminate the `DEMO_CREATOR_CONTEXT` + localStorage flash. Server-render the workspace shell with empty state; only hydrate Convex data once. If the workspace is brand-new, render `<EmptyState>` cleanly without "5 pinned" placeholders.
- Add a real **Demo Mode** route or query param: `?demo=eightsleep` loads a pre-cached lap (atlas + variations) from `docs/handoffs/auto-mode-evidence/...` so we always have a fallback if live runs hiccup mid-talk. Read-only on canvas; no extra widgets.
- `components/canvas/FloatingToolbar.tsx` (or wherever the toolbar lives) — remove the `openai · gpt-image-2` model text. Resolve the "render: responsive vs variants" confusion: pick one term ("variants") and remove the toggle if it's not load-bearing, OR document what each does in a one-line `title=` and stop there. No paragraph copy.
- Opacity audit: every popover (`AutoModeToggle`, `SettingsPopover`, any `Surface tone="panel"` used as a popover) should use `tone="overlay"` + `elevated` + `z-[1000]`. Grep for `tone="panel"` inside popover/dialog wrappers and switch.
- Sync audit: For full-auto, every step the BE runs (`url-ingest`, `vision-describe`, `sam3-segment`, `gpt-image-2`, `compose-atlas`, `publish`) should produce a visible row in the right-rail "auto-mode" timeline within ~500ms of starting, with status `pending → running → done`. For step-by-step, the same lifecycle must show in the per-step UI. Hook into `useCampaignLap` events; ensure the panel renders both modes coherently.
- Remove duplicate Discord notifications. Audit `scheduleVariationPosts` and lap-start/lap-end pings to ensure each lap sends at most: 1 lap-start ping + N per-publish pings + 1 lap-end summary.

**Acceptance criteria:**
- Open `/workspace` cold (private window, no localStorage) → no "5 PINNED", no "CAMPAIGN-TTT", no flash.
- `/workspace?demo=eightsleep` shows a fully populated 4×4 atlas + frames within 1s.
- Toolbar contains zero model-name strings; "render mode" toggle is either gone or has a one-line tooltip.
- All popovers solid (no canvas bleed), all above tldraw chrome.
- Right-rail timeline shows every BE step within ≤500ms in both full-auto and step-by-step modes; tested under `tests/e2e/right-rail-sync.spec.ts`.
- Discord receives exactly 1 lap-start + N publish + 1 lap-end pings per lap (verify with smoke trigger).

**Files to study first:** `components/workspace/WorkspaceShell.tsx`, `app/workspace/[wsId]/page.tsx`, `components/canvas/AutoModeToggle.tsx`, `components/rail/sections/AutoModePanel.tsx`, `lib/agent/auto-mode.ts` (for Discord ping placement), any `tone="panel"` popover usage.

---

## Working agreement for overnight agents

- **Branch:** `main`. Commit every meaningful slice. Conventional-commit prefixes (`feat:`, `fix:`, `test:`, `docs:`, `chore:`, `refactor:`).
- **Co-author:** every commit ends with `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.
- **TDD:** failing test first (`test:` commit), then green (`feat:`/`fix:` commit).
- **No origin push** — Ernie pushes in the morning after eyeballing.
- **No file deletions** without leaving a TODO comment naming what was removed and why.
- **Evidence:** save smoke proof under `docs/handoffs/auto-mode-evidence/<short-name>-2026-04-28/` for each green acceptance criterion.
- **Hard rules from `CLAUDE.md`** still apply — single-shell workspace, no per-step wizard routes, no hardcoded provider, restraint over labels, typed provenance on every action.
- **Conflict avoidance:** Lane A owns `components/workspace/*`, `components/canvas/*`, `lib/auto-mode/*`, `convex/campaigns.ts`. Lane B owns `lib/agent/**`, `lib/references/store.ts`, `lib/providers/image/*`. Lane C owns `app/workspace/**`, `components/rail/**`, `components/canvas/AutoModeToggle.tsx`, `components/canvas/FloatingToolbar.tsx`, `components/workspace/SettingsPopover.tsx`. If you must cross lanes, leave a `// LANE-X TODO` comment and stop in that file.

---

## What is *not* in scope tonight

- TikTok publishing (HTTPS callback dead-end on localhost; X + IG + LinkedIn + Pinterest is enough).
- Refactoring publisher adapter signatures.
- `xhs` / `douyin` / `bilibili` / `kuaishou` direct adapters (postiz/social-auto-upload fallback stays).
- Any change to `wrangler.toml` or Cloudflare deploy.
- Pushing to `origin`.
