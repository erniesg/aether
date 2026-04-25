# Handoff — continue Aether demo work (2026-04-25 night)

**Stg:** `https://aether-stg.berlayar.ai/workspace/demo-ws` — live as of `Current Version ID: 77491879-3df3-409a-be01-630bbceb3dbb`. Reflects every commit on `fix/convex-imageurl-sanitize` through `bc49d53`.

**You are picking up cold.** Read this entire doc + `AGENTS.md` + `CLAUDE.md` + `docs/handoffs/HANDOFF-2026-04-25-CONTINUE.md` (the original baton) before touching anything. The user is **Ernie** (she/her). She is mid-test, frustrated, and has minimal patience for "API-responds, UX unverified" claims. **Always show evidence before claiming done — screenshots, curl output, test runs. Never declare a fix landed without re-loading stg in a real browser.**

---

## The demo thesis (locked, do not re-derive)

> **"Creative is responsive by default."** The new primitive is an intent-aware creative component that renders itself across formats. The web got responsive layout when the unit became the component; aether makes creative ideas responsive by default.

The core demo loop:
1. Rough sketch on canvas (eyes-closed-friendly).
2. + references + brand facts + output targets in the left rail.
3. **Opus 4.7 turns sketch into a `SemanticCreativeComponent`** (hero, product, offer, mood, CTA, copyRoles, safeZones, cropPriorities).
4. Generate ONE key visual at the largest size, with safe zones encoded in the prompt (image is text-free).
5. **Crop** to IG / TikTok / banner / story — no extra generation, safe zones survive.
6. Add editable text-vector overlays per format **per locale** (BCP47 map; multilingual = Claude translation, not image regen).
7. Global edit ("make the product feel premium but keep the offer aggressive") propagates with local overrides preserved.

**Render mode is dual:** Mode A (multi-render fan-out, current stg) and Mode B (hero + crop) are not mutually exclusive — both ship. Mode auto-picks: if `max-aspect / min-aspect ≤ 2` → crop, else fan-out. Manual override via composer chip. Heuristic + tests not yet written.

**Q-prioritization (post-pivot):**
- Core: Q1 ✅, Q3 🟡, Q4 🟡, Q6 ✅
- Gravy / `post-demo`: Q2 (#98), Q5 (#56/#57/#84), Q7 (worktree)

---

## What I shipped today (chronological, top → bottom)

| PR | What | Status on `main`? | Stg deployed? | Key commits |
|---|---|---|---|---|
| **#102** `fix/convex-imageurl-sanitize` | (1) Convex sanitize: drop oversized data URLs before persisting `runs:finish`. (2) Discord merge-button on APPROVE embed. (3) Q1→D1 test rename. (4) Phase 0 evidence specs + screenshots. (5) `runs:abortStuck` mutation + composer "abort" UI. (6) Two-phase persistence hydration for Brand/Offer/Campaign. (7) Step-aware abort threshold. | **NO** — awaiting Ernie's ack | **YES** — deployed direct from branch via `npm run deploy:stg` (Version `77491879`) | through `bc49d53` |
| **#104** `docs/2026-04-25-phase0-results` | Phase 0 results doc + cherry-picked test fix | NO, ready-for-ernie | NO | `b1c9eab` |
| **#109** `feat/105-layout-aware-prompt` | `buildLayoutAwarePrompt({ creatorPrompt, component, brandMoodKeywords })` + `SemanticCreativeComponent` type. 16 unit tests. | NO | NO | `bc55613` |
| **#110** `feat/106-crop-from-hero` | `cropHeroToFormats({ heroAsset, formats, safeZones })`. 12 unit tests. Stacked on #109. | NO | NO | `cd81f24` |
| **#111** `feat/107-sketch-to-component` | `sketchToComponent({ sketchImageUrl, brand, references, formats, creatorIntent })` Opus 4.7 forced tool-use. 15 unit tests. Stacked on #109. | NO | NO | `28652df` |
| **#112** `feat/108-edit-propagation` | `applyComponentEdit({ component, instruction })` Opus 4.7 forced tool-use. 14 unit tests. Stacked on #111. | NO | NO | (push tip) |
| **#74** `claude/issue-67-...` | Rebased onto main (was DIRTY → clean). Text-overlay schema foundation. | NO | NO | `8fb691d` |

**Issue triage (`gh issue list`):**
- `core-demo`: **#100** (Managed Agents), **#88** (toolbar grouping), **#90** (rescoped — text-apply, no SAM3), **#105** **#106** **#107** **#108** (the four pivot issues)
- `post-demo`: **#56**, **#57**, **#84**, **#89**, **#98**, **#99**
- New tracking: **#103** (Discord per-PR threads, deferred)

Memory file: `/Users/erniesg/.claude/projects/-Users-erniesg-code-erniesg-aether/memory/project_demo_thesis.md` captures the pivot.

---

## What's live on stg right now (Version `77491879`)

Everything in PR #102's branch is deployed (it's not technically "merged" but the deploy shipped from the branch). That includes:

✅ Convex sanitize — new generations won't get stuck from oversized data URLs.
✅ `runs:abortStuck` mutation — Convex side ready.
✅ Composer abort button (only shown when stalled: `step='placing' && elapsed≥30s`, OR `elapsed≥180s`).
✅ Two-phase Brand/Offer/Campaign persistence — initial Convex hydration works, then user input wins.

❓ Drag-drop into composer references — Ernie reports this as still broken on stg post-deploy. Handlers in `PromptComposer.tsx:262-268` (`handleDrop`) are NOT gated by `pending`/`disabled`, so the form should accept drops. **Open mystery — needs investigation.** Possibilities: (a) she's dropping on canvas, not composer; (b) some overlay catches the event; (c) the run-row stuck overlay is intercepting.

❌ Brand-ingest 530 error — Ernie typed `tong.berlayari.ai` (typo of `berlayar.ai`). The 530 may just be the typo'd domain not resolving. **Verify**: has she tested with a known-good URL like `https://stripe.com`?

❌ Generate end-to-end completing — Ernie hit `error · aborted: run exceeded inactivity threshold`. That message comes from `runs:abortStuck`, meaning either (a) she clicked the abort button or (b) the run took >180s and her own click while it was actually working killed it. **Verify**: re-test with the new step-aware threshold (only `placing>30s` shows abort during legitimate work).

---

## Open bugs the next agent must investigate

### 1. Drag-drop reference images broken (priority: HIGH)

Symptom screenshot: composer footer with `describe the generation...` placeholder + the `error` status bar from a previous aborted run. Ernie says she can't drag images in.

Investigation path:
- `components/composer/PromptComposer.tsx:262-268` — `handleDrop` looks correct, `event.preventDefault()` + `ingestFiles(files)`.
- `components/composer/PromptComposer.tsx:243-260` — `handleDragEnter` / `handleDragOver` / `handleDragLeave` check `dataTransfer.types.includes('Files')`. Should work.
- Check `pointer-events: none` anywhere on parents of `<form data-taxonomy="tool">` (line 281). The composer status bar above it might have CSS that absorbs drops.
- Check `WorkspaceShell.tsx` for any drop / dragover preventDefault that might be eating events at a higher level.
- Test in stg DevTools: can you `console.log` from `handleDrop`? If yes, the bug is in `ingestFiles`. If no, the event isn't reaching the form.

### 2. Generate fan-out actually completing on stg (priority: HIGH)

Need a clean test post the new abort threshold:
1. Reload stg.
2. Wait for any stuck rows to be aborted (or leave alone — they'll still show but won't block new runs).
3. Type a prompt → enter.
4. Watch the status bar through 60s, 90s, 120s, 180s. Does it reach `placed N/M formats`? Or hit a real failure?

If it stalls at `placing` for >30s: abort button appears → click → row clears → next attempt.
If it stalls at `awaiting` for >180s: provider call is the bottleneck (OpenAI slow / down / quota).
If it never reaches `placing`: SSE stream broken, server-side issue.

Actual API was verified working in Phase 0 (`docs/handoffs/phase0-evidence/`) — single-frame curl returned a real image in 31 seconds. Fan-out is 4× that, so 120s+ is plausible.

### 3. Brand ingest 530 error (priority: MEDIUM)

Re-test with `https://stripe.com` (verified working in phase 0). If that works, the 530 was just a domain-resolution issue and not a regression.

### 4. The "venture name does not update" claim (priority: MEDIUM)

Re-read the screenshot. The rendering is:
```
venture                  ← modeLabel
solstice collective      ← workspaceLabel (fixed display, NOT editable)
[input: brand name]      ← editable
creator-owned venture    ← describeWorkspaceMode
```

It's possible Ernie thought "solstice collective" was the editable input and her edits didn't appear. The actual editable field is the `<input aria-label="brand name">` below. **Verify with her:** which exact line is she trying to edit?

### 5. Same persistence verification on Offer + Campaign (priority: MEDIUM)

The two-phase hydration fix is in place. Re-test:
1. Open offer rail, type into `offer name`. Type a few characters at a time with pauses (so auto-save fires between strokes). Verify the input doesn't reset.
2. Same for campaign rail.
3. Reload — verify saved values persist.

---

## What to ship next (in priority order)

### P0: Make stg actually demoable

1. **Verify the deploy worked** — run the phase 0 evidence harness:
   ```bash
   AETHER_BASE_URL=https://aether-stg.berlayar.ai \
     npx playwright test tests/e2e/phase0-stg-evidence.spec.ts \
     --project=chromium --workers=1
   ```
   Expect 6/6 green. Compare new screenshots against `docs/handoffs/phase0-evidence/`. Update the doc with diff.

2. **Investigate + fix drag-drop.** See #1 above.

3. **Land the stack onto main:**
   - PR #102 (live on stg already; Ernie's ack merges to main).
   - PR #74 → unblocks Q3 schema-side.
   - PR #109 → #110 → #111 → #112 (stacked).
   - PR #104 (docs).
   - PR #72, #33, #101 (independent).

   Auto-merge harness only fires reviewer agent on `claude/issue-*` head branches (intentional gate, see `.github/workflows/claude-review.yml:41-43`). My PRs (`fix/...`, `feat/...`, `docs/...`) bypass review by design and need Ernie to merge. **Do not push your own PRs to merge unless explicitly told.**

### P1: Build the canvas integration

Once #74 + #109 + #110 + #111 + #112 are in main, write the integration PR that wires it all into `WorkspaceShell.tsx`:

```
sketch (tldraw export) → sketchToComponent (#111)
                       → SemanticCreativeComponent
                       → buildLayoutAwarePrompt (#109)
                       → /api/generate (existing)
                       → hero render
                       → cropHeroToFormats (#110) → format crops
                       → text overlays (#90 rescoped, depends on #74)
                       → applyComponentEdit (#112) on edit → re-runs the loop
```

This is the demo. Without it, the agent code is unused. Estimated: half a day of focused work.

### P2: Build #90 rescoped (text-apply with multilingual)

This is the LAST core-demo agent piece. Stacks on #74 + #109. I started but didn't finish (got pulled to fix Ernie's stg regressions). Worktree is at `/Users/erniesg/code/erniesg/aether-90-text-apply` with `lib/types/semantic-component.ts` already imported.

Spec: `docs/handoffs/Q3-fan-out-editable-text-multilingual.md` (the original; the rescoped version is in issue #90's comment from earlier today).

Acceptance:
- `applyTextOverlay({ component, sourceLocale, targetLocales, brand, wsId, artboardId, capabilityRunId })` returns one `TextOverlayLayer` per text-bearing safeZone (each layer with multilingual `content` map).
- Forced tool-use to `propose_multilingual_copy` with input schema covering `overlays: Array<{ purpose, content: BCP47Map<string>, textAlign }>`.
- Tests with mocked Anthropic SDK matching the pattern in `lib/agent/sketch-to-component.test.ts` (PR #111).

### P3: Render-mode selector (Mode A / Mode B / auto)

Pure heuristic + tests. Inspect `SemanticCreativeComponent.formats`, compute aspect ratios, pick mode. Add to `lib/canvas/cropToFormat.ts` (or new `lib/canvas/renderMode.ts`).

### P4: Demo recording + Q6 polish

`docs/SUBMISSION-BUILD-FOR-WHATS-NEXT.md` needs a rewrite around the responsive-by-default thesis. Pure docs, auto-merges through the safelist.

---

## Codex parallel work prompts (still valid; rate-limited as of 23:30 SGT)

If Codex rate limits restore:

1. **Investigate `claude-review` SKIPPED on PRs #102/#104/#109/#110/#111/#112.** Already explained: the workflow gate at `.github/workflows/claude-review.yml:41-43` filters head branches to `claude/issue-*`. If we want my PRs to also be reviewed, broaden the gate. Single-file change.
2. **Per-PR Discord threads — issue #103.** Bot API + `discord-thread:<id>` PR-label persistence. Self-contained.
3. **#89 raster text lift** — Q3 stretch goal, post-demo.

---

## Repo invariants (do not break)

- `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>` on every commit.
- Conventional-commit prefixes (`fix:`, `feat:`, `test:`, `chore:`, `docs:`).
- Don't force-push `main`.
- Worktrees for parallel work — list them with `git worktree list`. Active ones tonight:
  - `/Users/erniesg/code/erniesg/aether` (`fix/convex-imageurl-sanitize`)
  - `/Users/erniesg/code/erniesg/aether-105-layout-prompt`
  - `/Users/erniesg/code/erniesg/aether-106-crop-hero`
  - `/Users/erniesg/code/erniesg/aether-107-sketch-component`
  - `/Users/erniesg/code/erniesg/aether-108-propagation`
  - `/Users/erniesg/code/erniesg/aether-90-text-apply` (in progress)
  - `/Users/erniesg/code/erniesg/aether-text-overlay-foundation` (rebased PR #74)
- Hard rules from `CLAUDE.md`: single synthesis-shell workspace, canvas-as-substrate, strict UI taxonomy, restraint over labels, provider-agnostic AI, typed provenance, graph-first persistence, red/green TDD.

---

## Validation script (run before claiming any fix)

```bash
cd /Users/erniesg/code/erniesg/aether
git fetch origin --prune --quiet
git log --oneline -10 main
npm run typecheck
npm test
# Smoke endpoints
/usr/bin/curl -sS "https://aether-stg.berlayar.ai/api/health"
/usr/bin/curl -sS "https://aether-stg.berlayar.ai/api/voice/session"
/usr/bin/curl -sS -o /dev/null -w "workspace status: %{http_code}\n" \
  "https://aether-stg.berlayar.ai/workspace/demo-ws"

# Browser evidence
AETHER_BASE_URL=https://aether-stg.berlayar.ai \
  npx playwright test tests/e2e/phase0-stg-evidence.spec.ts \
  --project=chromium --workers=1
```

If any step fails, fix it before doing anything else.

---

## How to talk to Ernie

- Direct, no padding. Show evidence before claiming. If you ship something, attach a screenshot or curl output. Otherwise say "API works, UX unverified."
- She's hackathon-mode. Ship fast, but **never** lie about what's tested.
- Don't oversell. If the fan-out actually takes 90s normal, say so.
- When she reports a bug, **re-load the deploy in a real browser** before assuming it's pilot error. Three of the four "regressions" she reported tonight were real.

Good luck.
