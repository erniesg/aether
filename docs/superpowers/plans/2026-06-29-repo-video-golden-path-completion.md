# Repo Video Golden Path Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove the full repo-to-video loop: point Aether at a repo or app, let an agent plan and execute launch/feature/social video work, review or run full-auto, edit/regenerate components, render/export, and return the video artifacts to the canvas.

**Architecture:** Keep one creator-facing synthesis shell. `MotionProject` remains the shared graph-backed object for source refs, story, timeline, components, captures, generation nodes, voice, sync, render proof, export packs, and provenance. Remotion and HyperFrames are engine adapters over the same editable timeline/source contracts; review mode and full-auto differ only by gate policy and persisted receipts.

**Tech Stack:** Next.js, TypeScript, Vitest, Playwright, Remotion Player/Renderer, HyperFrames source bundles, provider-neutral capture/voice/image-to-video/render registries, tldraw canvas material, existing Aether motion API routes.

---

## Completion Audit

The current implementation is a strong scaffold, but the full user goal is not complete until these requirements are proven by current-state evidence:

| Requirement | Current state | Evidence needed before complete |
| --- | --- | --- |
| Point to any repo/app source | `/api/motion/start` accepts repo paths, repo URLs, PR refs, site URLs, uploads, references, Remotion, and HyperFrames source refs. Motion rail has shortcuts for `aether`, `tong`, `paillette`, and `accrue`. | A golden-path test starts at least two local app repos and one source-set repo fixture, then shows a reviewable `MotionProject`, handoff templates, capture candidates, and editable timeline rows. |
| Create launch, feature, and social videos | Workflow catalog includes repo launch, feature/social, website, PR, caption, motion graphic, port, and computer-use capture workflows. | A scenario for each target produces a video plan, draft variations, source package, render proof, and export pack readiness using the same project shape. |
| Use HyperFrames and Remotion | Preview-source and render-source paths emit Remotion and HyperFrames source bundles; Remotion mounts through `@remotion/player`; HyperFrames mounts in a sandboxed iframe. | Both engines must pass a source package smoke test that writes files, verifies expected source manifests, renders or stubs proof receipts, and exposes editable source controls. |
| Reusable motion design, components, effects | Component registry covers hooks, app frames, code cards, proof cards, captions, voice, transitions, device frames, hotspots, data visuals, contact sheets, and outros. | Component registry coverage tests should map each workflow recipe to required component ids and effect presets, with no missing renderer/edit contract for Remotion and HyperFrames. |
| Editable outputs | Timeline clip edits, capture replacement, source keyframes, source-edit, source-author, and preview-source exist. | A source round-trip test edits `SCRIPT.md`, `STORYBOARD.md`, timeline JSON, and `EDIT.md`; then verifies story, captions, timing, receipts, preview plan, and source manifest update together. |
| Timeline and node primitives | Timeline lens, progressive generation node lens, production queue, canvas material plan, and interactive markers exist. | A component/e2e test should prove selected timeline component -> node lens -> regenerate/action -> updated timeline without route-splitting or raw JSON in the primary surface. |
| Full-auto and review modes | `/api/motion/mode`, `/api/motion/full-auto`, setup dry-run receipts, provider-required blockers, and handoff runner exist. | A full-auto golden path with fixture providers must advance capture, visual source, image-to-video, voice, sync, render, and export readiness, then pause only on explicit approval or missing provider. |
| Generate/find visuals and image-to-video | Visual sourcing plan and image-to-video route/provider contracts exist, plus command-backed adapter. | Golden path needs one completed visual-source receipt and one generated-video take applied back to a timeline clip with provenance and review handles. |
| Voiceover, captions, timing, audio/effects | Voice plan, command voice adapter, voice apply, sync plan, caption clips, effect presets, and render handoffs exist. | Golden path needs voice audio, word timing, transcript, caption timing links, sound/effect cues, and subtitle/transcript render outputs. |
| App capture, screenshots, recording, computer use | Browser/Playwright capture, local-app launcher, capture apply, and guarded computer-use receipt path exist. Live desktop control is still a follow-up. | Browser capture must run against a local app and save screenshot/DOM/trace/recording receipts. Computer-use must have a guarded live-runner or explicit receipt-import milestone with redaction proof. |
| Reviewable video plan, drafts, variations, regenerate component | Review plans, draft cards, taste references, regeneration actions, source-patch drafts, and source-author route exist. | A golden path must show three drafts, apply one component regeneration, and preserve rollback/review receipts. |
| Research taste corpus from X/product videos | Seed `referenceCorpus` and `tasteCorpus` exist; X and many public videos are marked `needs-authenticated-playback` or `needs-public-playback`. | A saved playback-backed corpus import must tag real videos by timestamp, hook, shot order, transition, caption style, crop, CTA, component ids, and proof boundary. |
| Export and canvas return | Render proof, export-pack plan, canvas material plan, and drop-video path exist. | A test must materialize MP4/poster/subtitle/transcript/manifest receipts and place a render-proof or video artifact back onto canvas. |

## Milestone Strategy

Work in proof-bearing milestones. Each milestone must leave a committed artifact or test that narrows the gap above.

1. **Golden path harness:** one deterministic test harness that starts from local repo fixture -> review plan -> full-auto fixture providers -> prepared source -> render/export receipts.
2. **Editable source proof:** one source-bundle round trip that edits script, storyboard, timeline timing, and component props through the same source-edit path.
3. **Live app capture proof:** one opt-in Playwright local app capture that launches a real app, captures screenshots/DOM/trace/recording, and applies receipts into `app-frame` clips.
4. **Playback corpus import:** one real corpus fixture imported from public/authenticated video review with timestamped shot lists.
5. **Engine proof:** one Remotion source package and one HyperFrames source package that both expose the same component ids, edit controls, source manifest, and render-proof plan.
6. **Canvas/export proof:** one render-proof output and one export-pack manifest returned as canvas material.

## Task 1: Golden Path Fixture Contract

**Files:**
- Create: `lib/motion/goldenPathFixtures.ts`
- Test: `lib/motion/goldenPathFixtures.test.ts`
- Modify: `tests/unit/api-motion-agent-handoff.test.ts`

- [x] **Step 1: Write the failing fixture tests**

```ts
// lib/motion/goldenPathFixtures.test.ts
import { describe, expect, it } from 'vitest';
import {
  buildRepoVideoGoldenPathFixture,
  assertGoldenPathMotionProject,
} from './goldenPathFixtures';

describe('repo video golden path fixtures', () => {
  it('builds a local repo source that can exercise review and full-auto gates', async () => {
    const fixture = await buildRepoVideoGoldenPathFixture({
      appName: 'tong',
      description: 'City-specific language learning app.',
      routeFiles: {
        'app/page.tsx': 'export default function Page() { return <main>Tong</main>; }',
      },
    });

    expect(fixture.repoPath).toMatch(/aether-motion-golden-path-/);
    expect(fixture.startRequest).toMatchObject({
      workspaceId: 'motion-golden-path',
      intent: 'launch',
      mode: 'full-auto',
      repoPath: fixture.repoPath,
      requestedEngines: ['remotion', 'hyperframes', 'provider'],
    });
    expect(fixture.expectedApps).toEqual(['tong']);
  });

  it('asserts the project contains the required editable video surfaces', () => {
    expect(() =>
      assertGoldenPathMotionProject({
        project: {
          id: 'empty',
          title: 'empty',
          workspaceId: 'motion-golden-path',
          workflowMode: 'full-auto',
          sourceRefs: [],
          brief: null as never,
          story: [],
          tracks: [],
          graphNodes: [],
          exports: [],
          createdAt: 1,
          updatedAt: 1,
        },
      })
    ).toThrow(/story beats/);
  });
});
```

- [x] **Step 2: Run the failing tests**

Run: `npx vitest run lib/motion/goldenPathFixtures.test.ts --pool=forks`

Expected: FAIL because `lib/motion/goldenPathFixtures.ts` does not exist.

- [x] **Step 3: Implement the fixture helper**

`buildRepoVideoGoldenPathFixture` should create a temp repo with `package.json`, `README.md`, and one or more route files. It should return a concrete `/api/motion/start` request for full-auto launch video mode. `assertGoldenPathMotionProject` should throw named errors when story beats, timeline rows, source refs, draft variations, render/export slots, or agent handoff templates are missing.

- [x] **Step 4: Run focused tests**

Run:

```bash
npx vitest run lib/motion/goldenPathFixtures.test.ts tests/unit/api-motion-agent-handoff.test.ts --pool=forks
```

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add lib/motion/goldenPathFixtures.ts lib/motion/goldenPathFixtures.test.ts tests/unit/api-motion-agent-handoff.test.ts
git commit -m "test: add repo video golden path fixtures"
```

## Task 2: Full-Auto Fixture Provider Run

**Files:**
- Modify: `tests/unit/api-motion-agent-handoff.test.ts`
- Modify: `lib/motion/agentHandoffRunner.test.ts`

- [ ] **Step 1: Add a failing end-to-end unit test**

Add one test that starts a local repo, materializes the handoff templates, registers fixture capture, visual-source, image-to-video, voice, render, and source-author providers, runs `full-auto-run`, and verifies the returned project contains:

- completed capture graph node
- generated-video take on at least one visual clip
- voice audio, word timing, and transcript assets
- sync execution receipt
- render receipts for MP4, poster, subtitles, transcript, and manifest
- export-pack readiness
- saved full-auto review packet

- [ ] **Step 2: Run the failing test**

Run:

```bash
npx vitest run tests/unit/api-motion-agent-handoff.test.ts -t "golden path" --pool=forks
```

Expected: FAIL on the first missing provider or receipt assertion.

- [ ] **Step 3: Implement missing fixture glue only**

Use existing provider registries and API routes. Do not create a second orchestration path. If a route cannot carry a needed receipt, extend that route response and its project-apply helper rather than adding test-only state.

- [ ] **Step 4: Run focused tests**

Run:

```bash
npx vitest run tests/unit/api-motion-agent-handoff.test.ts lib/motion/agentHandoffRunner.test.ts --pool=forks
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/unit/api-motion-agent-handoff.test.ts lib/motion/agentHandoffRunner.test.ts app/api/motion lib/motion lib/providers
git commit -m "test: prove repo video full auto golden path"
```

## Task 3: Source Bundle Round Trip

**Files:**
- Modify: `lib/motion/sourceBundleApply.ts`
- Modify: `lib/motion/sourceBundleApply.test.ts`
- Modify: `tests/unit/api-motion-source-author.test.ts`
- Modify: `tests/component/view-switcher.focus-mode.test.tsx`

- [ ] **Step 1: Add failing tests for editable source round-trip**

The tests should edit all four source-backed files:

- `SCRIPT.md`: replace one narration line.
- `STORYBOARD.md`: move one beat from proof-first to demo-first order.
- `timeline/draft-primary.json`: retime one clip and caption.
- `EDIT.md`: declare the regeneration scope that produced the edit.

Expected assertions:

- story narration changes
- clip timing changes
- caption text changes
- `executionHistory` gains a `Source edit` receipt
- preview plan exposes updated source labels
- prepared preview source still has the same engine source manifest paths

- [ ] **Step 2: Run the failing tests**

Run:

```bash
npx vitest run lib/motion/sourceBundleApply.test.ts tests/unit/api-motion-source-author.test.ts tests/component/view-switcher.focus-mode.test.tsx --pool=forks
```

Expected: FAIL on the first missing source-file application or UI receipt.

- [ ] **Step 3: Implement the minimal parser/application fix**

Use structured JSON for timeline files and bounded markdown sections for script/storyboard files. Reject unknown clip ids, unknown beat ids, unsafe path traversal, and overlapping timeline edits.

- [ ] **Step 4: Run focused tests**

Run:

```bash
npx vitest run lib/motion/sourceBundleApply.test.ts tests/unit/api-motion-source-author.test.ts tests/component/view-switcher.focus-mode.test.tsx --pool=forks
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/motion/sourceBundleApply.ts lib/motion/sourceBundleApply.test.ts tests/unit/api-motion-source-author.test.ts tests/component/view-switcher.focus-mode.test.tsx
git commit -m "feat: round trip editable motion source bundles"
```

## Task 4: Live Local App Capture Proof

**Files:**
- Modify: `tests/unit/api-motion-capture-local-runner.test.ts`
- Modify: `tests/e2e/` or create: `tests/e2e/motion-local-app-capture.spec.ts`
- Modify: `docs/specs/2026-06-23-repo-video-system/evidence/` if screenshots are saved

- [ ] **Step 1: Write failing local capture proof**

Create a test that starts a simple local app fixture, opts into `captureRunner.kind = "playwright-local"`, captures screenshot, DOM snapshot, interaction trace, and optional screen recording, then applies receipts to the motion project.

- [ ] **Step 2: Run the failing test**

Run:

```bash
npx vitest run tests/unit/api-motion-capture-local-runner.test.ts --pool=forks
```

Expected: FAIL if recording, local-app readiness, or receipt application is incomplete.

- [ ] **Step 3: Implement missing capture runner behavior**

Keep runner opt-in. Save files under an Aether-controlled output directory. Persist target URL, viewport, local command, readiness proof, artifact paths, MIME types, and redaction status as typed receipts.

- [ ] **Step 4: Run capture tests**

Run:

```bash
npx vitest run tests/unit/api-motion-capture-local-runner.test.ts tests/unit/api-motion-capture.test.ts lib/providers/capture/playwright.test.ts --pool=forks
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/unit/api-motion-capture-local-runner.test.ts tests/e2e/motion-local-app-capture.spec.ts lib/providers/capture lib/motion/captureApply.ts
git commit -m "feat: prove local app capture receipts"
```

## Task 5: Playback-Backed Taste Corpus Import

**Files:**
- Modify: `lib/motion/tasteCorpus.ts`
- Modify: `lib/motion/tasteCorpus.test.ts`
- Create: `docs/specs/2026-06-23-repo-video-system/evidence/playback-corpus/README.md`

- [ ] **Step 1: Add failing corpus-quality tests**

Require at least one `playback-reviewed` entry for:

- agent product demo
- HyperFrames or skill-launch social cut
- polished product demo

Each entry must include timestamped shot list, crop target, hook type, component ids, effect tags, caption style, transition notes, CTA, proof boundary, and source URL.

- [ ] **Step 2: Run the failing corpus tests**

Run:

```bash
npx vitest run lib/motion/tasteCorpus.test.ts tests/unit/api-motion-workflows.test.ts --pool=forks
```

Expected: FAIL while entries are still marked `needs-public-playback` or `needs-authenticated-playback`.

- [ ] **Step 3: Import reviewed examples**

Use public playback where possible. For X examples, use an authenticated browser pass and save only metadata, timestamps, screenshots/contact sheets, and short compliant summaries. Do not copy entire captions or videos into the repo.

- [ ] **Step 4: Run corpus tests**

Run:

```bash
npx vitest run lib/motion/tasteCorpus.test.ts tests/unit/api-motion-workflows.test.ts --pool=forks
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/motion/tasteCorpus.ts lib/motion/tasteCorpus.test.ts docs/specs/2026-06-23-repo-video-system/evidence/playback-corpus/README.md tests/unit/api-motion-workflows.test.ts
git commit -m "docs: add playback reviewed motion taste corpus"
```

## Task 6: Engine Source and Render Proof Parity

**Files:**
- Modify: `lib/motion/renderSource.ts`
- Modify: `lib/motion/renderSource.test.ts`
- Modify: `tests/unit/api-motion-preview-source.test.ts`
- Modify: `tests/unit/api-motion-render.test.ts`

- [ ] **Step 1: Add failing parity tests**

For the same `MotionProject`, prepare Remotion and HyperFrames source packages. Assert both include:

- same component ids
- same timeline duration
- same source manifest concept
- same editable component controls
- same render-proof expectations
- engine-specific entry files

- [ ] **Step 2: Run failing tests**

Run:

```bash
npx vitest run lib/motion/renderSource.test.ts tests/unit/api-motion-preview-source.test.ts tests/unit/api-motion-render.test.ts --pool=forks
```

Expected: FAIL on any missing engine parity.

- [ ] **Step 3: Implement parity fixes**

Keep engine-specific source code in adapters. Keep component ids, edit contract, manifests, and verification labels provider-neutral.

- [ ] **Step 4: Run focused tests**

Run:

```bash
npx vitest run lib/motion/renderSource.test.ts tests/unit/api-motion-preview-source.test.ts tests/unit/api-motion-render.test.ts --pool=forks
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/motion/renderSource.ts lib/motion/renderSource.test.ts tests/unit/api-motion-preview-source.test.ts tests/unit/api-motion-render.test.ts
git commit -m "feat: align remotion and hyperframes source proof"
```

## Task 7: Computer-Use Runner Boundary

**Files:**
- Modify: `lib/providers/capture/computerUse.ts`
- Modify: `lib/providers/capture/computerUse.test.ts`
- Modify: `app/api/motion/capture/route.ts`
- Modify: `tests/unit/api-motion-capture.test.ts`

- [ ] **Step 1: Add failing live-runner boundary tests**

Tests must cover:

- missing creator approval rejected
- missing redaction manifest rejected
- unknown target window rejected
- approved screenshot receipt accepted
- approved recording receipt accepted
- trace receipt keeps redaction provenance
- full-auto pauses when computer-use is required but not approved

- [ ] **Step 2: Run failing tests**

Run:

```bash
npx vitest run lib/providers/capture/computerUse.test.ts tests/unit/api-motion-capture.test.ts --pool=forks
```

Expected: FAIL until live-runner or receipt-import boundary is complete.

- [ ] **Step 3: Implement the guarded boundary**

Start with receipt-import if direct desktop control is not available in the runtime. The contract must still match the eventual live runner: approved scope, stop conditions, redaction manifest, capture receipts, and project application path.

- [ ] **Step 4: Run capture safety tests**

Run:

```bash
npx vitest run lib/providers/capture/computerUse.test.ts tests/unit/api-motion-capture.test.ts tests/component/view-switcher.focus-mode.test.tsx --pool=forks
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/providers/capture/computerUse.ts lib/providers/capture/computerUse.test.ts app/api/motion/capture/route.ts tests/unit/api-motion-capture.test.ts tests/component/view-switcher.focus-mode.test.tsx
git commit -m "feat: guard computer use capture receipts"
```

## Task 8: Canvas and Export Pack Proof

**Files:**
- Modify: `lib/motion/exportPackPlan.ts`
- Modify: `lib/motion/exportPackPlan.test.ts`
- Modify: `lib/canvas/dropVideo.ts`
- Modify: `tests/component/timeline-lens.test.tsx`
- Modify: `tests/unit/api-motion-export-pack.test.ts`

- [ ] **Step 1: Add failing export/canvas tests**

Assert a rendered project produces:

- MP4 asset
- poster asset
- subtitle file
- transcript file
- source manifest
- export-pack manifest
- canvas drop target
- timeline action to drop render proof or export pack to canvas

- [ ] **Step 2: Run failing tests**

Run:

```bash
npx vitest run lib/motion/exportPackPlan.test.ts tests/unit/api-motion-export-pack.test.ts tests/component/timeline-lens.test.tsx --pool=forks
```

Expected: FAIL on missing export or canvas material linkage.

- [ ] **Step 3: Implement missing export/canvas link**

Use existing canvas material/drop helpers. Keep export pack as artifact-first material, not a separate publish dashboard.

- [ ] **Step 4: Run focused tests**

Run:

```bash
npx vitest run lib/motion/exportPackPlan.test.ts tests/unit/api-motion-export-pack.test.ts tests/component/timeline-lens.test.tsx --pool=forks
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/motion/exportPackPlan.ts lib/motion/exportPackPlan.test.ts lib/canvas/dropVideo.ts tests/unit/api-motion-export-pack.test.ts tests/component/timeline-lens.test.tsx
git commit -m "feat: return motion exports to canvas"
```

## Final Verification Gate

Before marking the full goal complete, run:

```bash
npx vitest run \
  lib/motion/goldenPathFixtures.test.ts \
  lib/motion/tasteCorpus.test.ts \
  lib/motion/renderSource.test.ts \
  tests/unit/api-motion-agent-handoff.test.ts \
  tests/unit/api-motion-start.test.ts \
  tests/unit/api-motion-capture.test.ts \
  tests/unit/api-motion-preview-source.test.ts \
  tests/unit/api-motion-full-auto.test.ts \
  tests/unit/api-motion-export-pack.test.ts \
  tests/component/timeline-lens.test.tsx \
  tests/component/view-switcher.focus-mode.test.tsx \
  --pool=forks
npm run typecheck
npx eslint \
  lib/motion \
  lib/providers/capture \
  app/api/motion \
  components/workspace/TimelineLens.tsx \
  components/workspace/WorkspaceShell.tsx
git diff --check
```

Expected: all commands pass.

Manual proof for completion must include:

- Start one repo launch project from `~/code/erniesg/aether`.
- Start one feature/social project from `~/code/erniesg/tong`, `~/code/erniesg/paillette`, or `~/code/erniesg/accrue`.
- Show the video plan, draft variations, source material, and timeline lens.
- Prepare Remotion preview source.
- Prepare HyperFrames preview source.
- Apply one component regeneration.
- Run full-auto with configured fixture or real providers through render/export.
- Drop the resulting render proof or export pack back to the canvas.
- Save screenshots or console output under `docs/specs/2026-06-23-repo-video-system/evidence/golden-path/`.

Only after that evidence exists should the thread goal be considered complete.
