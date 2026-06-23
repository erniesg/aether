# Repo Video Motion First Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first testable slice of repo-to-launch-video in aether: repo/app facts become an editable motion project with story beats, reusable motion components, a timeline model, provider seams, and a timeline lens scaffold.

**Architecture:** Keep the creator-facing surface inside the existing single synthesis shell. Represent video as a graph-backed `MotionProject` with story beats and timeline clips; expose a timeline lens for editing while keeping provider runs and raw execution details behind provenance/debug surfaces. Use Remotion for editable React preview/render contracts and keep HyperFrames as a supported render/component engine for existing HTML compositions.

**Tech Stack:** TypeScript, Vitest, React, Next.js, tldraw, Convex schema types, Remotion Player/Renderer, HyperFrames CLI, existing aether capability/tool registries.

---

## Requirement Coverage

- Point aether at any repo or app source: Tasks 1-2 normalize repo/app facts into `MotionBriefV2` and `StoryBeat[]`.
- Launch, feature, and social videos: Task 2 models project kinds and platform targets; Task 4 builds timeline clips from beats.
- Reusable motion design, components, and effects: Task 3 adds a component registry with hook, app frame, agent trace, proof card, and CTA components.
- HyperFrames and Remotion: Task 3 marks supported engines per component; Task 5 adds render provider contracts for Remotion and HyperFrames.
- Screenshots, app use, recording, and computer-use fallback: Task 5A adds capture provider contracts for screenshot-driven demos and recorded app flows.
- PR-to-video and code-change explainers: Task 5B adds a separate code-change provider contract so pull requests use GitHub evidence instead of screen capture.
- Editable outputs: Task 4 creates stable tracks/clips; Task 6 exposes the timeline lens without route-splitting.
- Agent-native reusable tools/skills: Task 7 widens tool/workflow registries for motion brief, storyboard, render, voice, and sync tools.
- Script, visuals, voiceover, timing, effects, transitions: Tasks 2, 4, and 5 create typed places for script lines, asset refs, voice/caption tracks, sync markers, effects, and transitions.
- Provider-agnostic AI: Task 5 splits video contracts by job and keeps provider selection in request/config fields.
- Provenance: Every task uses `MotionProvenanceRef[]` on claims, beats, clips, graph nodes, and exports.

## File Structure

- Create `lib/motion/project.ts`: shared motion project, brief, beat, timeline, export, and provenance types.
- Create `lib/motion/project.test.ts`: unit tests for frame math and required provenance fields.
- Create `lib/motion/storyboard.ts`: pure builder from repo/app facts into `MotionProject`.
- Create `lib/motion/storyboard.test.ts`: tests for beat ordering, source refs, and no invented numeric claims.
- Create `lib/motion/repoMotion.ts`: fetch GitHub repo facts from a repo URL and bridge them into an editable `MotionProject`.
- Create `lib/motion/repoMotion.test.ts`: tests URL normalization, repo claim provenance, story generation, and optional timeline materialization.
- Create `lib/motion/reviewPlan.ts`: creator-facing video plan artifact with draft variants, editable component slots, regenerate scopes, and mode actions.
- Create `lib/motion/reviewPlan.test.ts`: tests review/full-auto plans and scoped component regeneration requests.
- Create `lib/motion/workflowPlan.ts`: agent-readable review/full-auto gates from registered workflows and source refs.
- Create `lib/motion/workflowPlan.test.ts`: tests source status, gates, tool ids, engine hints, and full-auto actions.
- Create `lib/motion/workflowRouter.ts`: route intent and source refs to reusable motion workflows.
- Create `lib/motion/workflowRouter.test.ts`: tests repo launch, PR, feature/social, website, overlay, motion graphic, and engine-port routing.
- Create `lib/motion/start.ts`: agent-facing start artifact that combines routing, workflow gates, project creation, review plans, and source/evidence requests.
- Create `lib/motion/start.test.ts`: tests repo starts, PR evidence requests, and missing-source requests.
- Create `lib/motion/siteMotion.ts`: site/app URL evidence builder for capture-first editable motion projects.
- Create `lib/motion/capturePlan.ts`: agent-readable capture request planner for screenshots, DOM snapshots, interaction traces, recordings, and computer-use fallback.
- Create `lib/motion/capturePlan.test.ts`: tests provider-ready capture requests and PR no-capture behavior.
- Create `lib/providers/capture/browser.ts`: provider boundary for executing browser capture requests through an injected runner.
- Create `lib/providers/capture/browser.test.ts`: tests screenshot, DOM snapshot, trace, artifact, cursor target, and provenance mapping.
- Create `lib/providers/capture/playwright.ts`: local Playwright runner/factory for browser capture requests.
- Create `lib/providers/capture/playwright.test.ts`: tests browser steps, screenshot files, DOM/trace receipts, video path receipts, and provider wrapping.
- Create `lib/motion/componentRegistry.ts`: reusable motion component metadata and schema descriptors.
- Create `lib/motion/componentRegistry.test.ts`: tests for ids, supported engines, edit controls, and aspect ratios.
- Create `lib/motion/timeline.ts`: pure compiler from story beats to tracks and clips.
- Create `lib/motion/timeline.test.ts`: tests for non-overlap, frame durations, captions, planned voice clips, and linked variant scopes.
- Create `lib/providers/video/render-types.ts`: deterministic render provider contract.
- Create `lib/providers/video/generation-types.ts`: generative clip provider contract.
- Modify `lib/providers/video/types.ts`: re-export split video provider contracts while preserving current understanding types.
- Create `lib/providers/video/render-registry.ts`: registry resolver for render providers.
- Create `lib/providers/video/render-registry.test.ts`: tests provider unavailable behavior and preferred provider selection.
- Create `lib/providers/capture/types.ts`: screenshot, app-flow, recording, and computer-use capture contract.
- Create `lib/providers/capture/registry.ts`: registry resolver for capture providers.
- Create `lib/providers/capture/registry.test.ts`: tests provider unavailable behavior and no default hardcoding.
- Create `lib/providers/code-change/types.ts`: GitHub PR, diff, commit, review, CI, and contributor evidence contract.
- Create `lib/providers/code-change/registry.ts`: registry resolver for code-change evidence providers.
- Create `lib/providers/code-change/registry.test.ts`: tests provider unavailable behavior and no default hardcoding.
- Create `lib/providers/code-change/github-gh.ts`: GitHub CLI provider that ingests PR metadata, files, full patch hunks, CI, reviews, commits, and author evidence.
- Create `lib/providers/code-change/github-gh.test.ts`: tests injected `gh` commands, source parsing, evidence mapping, and availability.
- Modify `lib/tool/registry.ts`: add draft motion tool ids.
- Modify `lib/capability/types.ts`: include motion tool ids in `CapabilityTool`.
- Modify `lib/workflow/registry.ts`: add draft repo-to-launch-video workflow.
- Create or modify `tests/unit/tool-registry.test.ts`: assert motion tools are known and draft.
- Create `components/workspace/TimelineLens.tsx`: first timeline lens scaffold using typed tracks and clips.
- Modify `components/header/ViewSwitcher.tsx`: enable timeline only after the lens scaffold is wired.
- Modify `tests/component/view-switcher.test.tsx`: timeline becomes enabled, graph/mood/chat remain disabled.
- Modify `components/workspace/WorkspaceShell.tsx`: render `TimelineLens` when `view === 'timeline'`.
- Create `tests/component/timeline-lens.test.tsx`: verifies track grouping, clip selection callback, and no debug ids in primary UI.
- Create `docs/specs/2026-06-23-repo-video-system/implementation-notes.md`: record first-slice proof commands and corpus follow-up.

## Task 1: Motion Project Domain Types

**Files:**
- Create: `lib/motion/project.ts`
- Create: `lib/motion/project.test.ts`

- [x] **Step 1: Write the failing tests**

```ts
// lib/motion/project.test.ts
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MOTION_FPS,
  motionFrames,
  motionSeconds,
  type MotionProject,
} from './project';

describe('motion project primitives', () => {
  it('uses deterministic frame math at the default fps', () => {
    expect(DEFAULT_MOTION_FPS).toBe(30);
    expect(motionFrames(1.5)).toBe(45);
    expect(motionSeconds(45)).toBe(1.5);
  });

  it('requires provenance on claims, beats, clips, and exports', () => {
    const project: MotionProject = {
      id: 'motion-aether-launch',
      workspaceId: 'demo-ws',
      title: 'aether launch',
      sourceRefs: [{ kind: 'repo', ref: 'https://github.com/erniesg/aether' }],
      brief: {
        projectKind: 'launch',
        appProfile: {
          name: 'aether',
          repoUrl: 'https://github.com/erniesg/aether',
          summary: 'Canvas-native creative system.',
          stack: ['Next.js', 'Convex', 'tldraw'],
        },
        audience: 'builders launching creative apps',
        platformTargets: [{ platform: 'x', aspectRatio: '9:16', seconds: 30 }],
        claims: [
          {
            text: 'Canvas-native creative system.',
            source: { kind: 'repo', ref: 'package.json#description' },
          },
        ],
        tone: 'precise, visual, maker-led',
        brandMotion: {
          palette: ['#f4ede0', '#1a1a1a', '#c8413a'],
          fontFamilies: ['IBM Plex Mono'],
          motionStyle: 'technical editorial',
        },
      },
      story: [
        {
          id: 'beat-hook',
          role: 'hook',
          narration: 'Turn a repo into a launch video.',
          targetSeconds: 3,
          selectedAssetIds: [],
          provenance: [{ kind: 'repo', ref: 'package.json#description' }],
        },
      ],
      tracks: [
        {
          id: 'track-text',
          kind: 'text',
          clips: [
            {
              id: 'clip-hook-title',
              componentId: 'hook-card',
              startFrame: 0,
              durationFrames: 90,
              props: { text: 'Repo to launch video' },
              linkedVariantScope: 'global',
              provenance: [{ kind: 'story-beat', ref: 'beat-hook' }],
            },
          ],
        },
      ],
      graphNodes: [],
      exports: [
        {
          id: 'export-x-vertical',
          platform: 'x',
          aspectRatio: '9:16',
          status: 'planned',
          provenance: [{ kind: 'timeline', ref: 'track-text' }],
        },
      ],
      createdAt: 1,
      updatedAt: 1,
    };

    expect(project.brief.claims[0].source.kind).toBe('repo');
    expect(project.story[0].provenance[0].kind).toBe('repo');
    expect(project.tracks[0].clips[0].provenance[0].kind).toBe('story-beat');
    expect(project.exports[0].provenance[0].kind).toBe('timeline');
  });
});
```

- [x] **Step 2: Run the failing tests**

Run: `npx vitest run lib/motion/project.test.ts`

Expected: FAIL because `lib/motion/project.ts` does not exist.

- [ ] **Step 3: Add the domain types**

```ts
// lib/motion/project.ts
export const DEFAULT_MOTION_FPS = 30;

export type MotionProjectKind = 'launch' | 'feature' | 'demo' | 'social' | 'case-study' | 'pr';
export type MotionBeatRole = 'hook' | 'problem' | 'proof' | 'demo' | 'payoff' | 'cta';
export type MotionAspectRatio = '16:9' | '9:16' | '1:1' | '4:5';
export type MotionPlatform =
  | 'x'
  | 'linkedin'
  | 'youtube'
  | 'tiktok'
  | 'instagram'
  | 'website'
  | 'deck';

export type MotionTrackKind =
  | 'screen'
  | 'broll'
  | 'text'
  | 'caption'
  | 'voice'
  | 'music'
  | 'sfx'
  | 'effect'
  | 'transition';

export interface MotionProvenanceRef {
  kind:
    | 'repo'
    | 'site'
    | 'upload'
    | 'reference'
    | 'story-beat'
    | 'timeline'
    | 'provider'
    | 'render'
    | 'manual';
  ref: string;
  label?: string;
}

export interface AppProfile {
  name: string;
  repoUrl?: string;
  siteUrl?: string;
  summary: string;
  stack: string[];
}

export interface MotionPlatformTarget {
  platform: MotionPlatform;
  aspectRatio: MotionAspectRatio;
  seconds: number;
}

export interface MotionClaimReceipt {
  text: string;
  source: MotionProvenanceRef;
}

export interface BrandMotionTokens {
  palette: string[];
  fontFamilies: string[];
  motionStyle: string;
}

export interface MotionBriefV2 {
  projectKind: MotionProjectKind;
  appProfile: AppProfile;
  audience: string;
  platformTargets: MotionPlatformTarget[];
  claims: MotionClaimReceipt[];
  tone: string;
  brandMotion: BrandMotionTokens;
}

export interface StoryBeat {
  id: string;
  role: MotionBeatRole;
  narration: string;
  targetSeconds: number;
  selectedAssetIds: string[];
  templateId?: string;
  provenance: MotionProvenanceRef[];
}

export interface TimelineClip {
  id: string;
  assetId?: string;
  componentId?: string;
  startFrame: number;
  durationFrames: number;
  inFrame?: number;
  outFrame?: number;
  props: Record<string, unknown>;
  linkedVariantScope?: 'global' | 'format-local';
  provenance: MotionProvenanceRef[];
}

export interface TimelineTrack {
  id: string;
  kind: MotionTrackKind;
  clips: TimelineClip[];
}

export interface MotionGraphNode {
  id: string;
  kind:
    | 'repo-ingest'
    | 'script'
    | 'storyboard'
    | 'capture'
    | 'visual-search'
    | 'image-to-video'
    | 'voice'
    | 'sync'
    | 'render';
  inputRefs: string[];
  outputRefs: string[];
  providerId?: string;
  status: 'planned' | 'running' | 'done' | 'failed';
  provenance: MotionProvenanceRef[];
}

export interface MotionExport {
  id: string;
  platform: MotionPlatform;
  aspectRatio: MotionAspectRatio;
  status: 'planned' | 'rendering' | 'ready' | 'failed';
  assetId?: string;
  posterAssetId?: string;
  subtitleAssetId?: string;
  manifestAssetId?: string;
  provenance: MotionProvenanceRef[];
}

export interface MotionProject {
  id: string;
  workspaceId: string;
  title: string;
  sourceRefs: MotionProvenanceRef[];
  brief: MotionBriefV2;
  story: StoryBeat[];
  tracks: TimelineTrack[];
  graphNodes: MotionGraphNode[];
  exports: MotionExport[];
  createdAt: number;
  updatedAt: number;
}

export function motionFrames(seconds: number, fps = DEFAULT_MOTION_FPS): number {
  return Math.round(seconds * fps);
}

export function motionSeconds(frames: number, fps = DEFAULT_MOTION_FPS): number {
  return frames / fps;
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run lib/motion/project.test.ts`

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add lib/motion/project.ts lib/motion/project.test.ts
git commit -m "feat: add motion project primitives"
```

## Task 2: Repo Facts to Story Beats

**Files:**
- Create: `lib/motion/storyboard.ts`
- Create: `lib/motion/storyboard.test.ts`

- [x] **Step 1: Write the failing tests**

```ts
// lib/motion/storyboard.test.ts
import { describe, expect, it } from 'vitest';
import { buildRepoLaunchMotionProject } from './storyboard';

describe('buildRepoLaunchMotionProject', () => {
  it('builds a launch story in hook/problem/proof/demo/payoff/cta order', () => {
    const project = buildRepoLaunchMotionProject({
      id: 'motion-aether-launch',
      workspaceId: 'demo-ws',
      projectKind: 'launch',
      audience: 'builders',
      tone: 'precise',
      appProfile: {
        name: 'aether',
        repoUrl: 'https://github.com/erniesg/aether',
        summary: 'Canvas-native creative system.',
        stack: ['Next.js', 'Convex', 'tldraw'],
      },
      claims: [
        {
          text: 'Uses Next.js, Convex, and tldraw.',
          source: { kind: 'repo', ref: 'package.json#dependencies' },
        },
      ],
      platformTargets: [{ platform: 'x', aspectRatio: '9:16', seconds: 30 }],
      createdAt: 10,
    });

    expect(project.story.map((beat) => beat.role)).toEqual([
      'hook',
      'problem',
      'proof',
      'demo',
      'payoff',
      'cta',
    ]);
    expect(project.story[0].templateId).toBe('hook-card');
    expect(project.story[2].provenance[0].ref).toBe('package.json#dependencies');
    expect(project.graphNodes.map((node) => node.kind)).toEqual(['repo-ingest', 'script', 'storyboard']);
  });

  it('does not invent numeric claims when the source claim has no number', () => {
    const project = buildRepoLaunchMotionProject({
      id: 'motion-tong-feature',
      workspaceId: 'demo-ws',
      projectKind: 'feature',
      audience: 'language learners',
      tone: 'textural',
      appProfile: {
        name: 'tong',
        summary: 'City-specific language learning app.',
        stack: ['React'],
      },
      claims: [
        {
          text: 'Tokyo uses physical ephemera as learning material.',
          source: { kind: 'manual', ref: 'creative-brief:tokyo' },
        },
      ],
      platformTargets: [{ platform: 'instagram', aspectRatio: '9:16', seconds: 30 }],
      createdAt: 10,
    });

    const allNarration = project.story.map((beat) => beat.narration).join(' ');
    expect(allNarration).not.toMatch(/\b\d+%|\b\d+x|\b\d+ users/i);
    expect(allNarration).toContain('physical ephemera');
  });
});
```

- [x] **Step 2: Run the failing tests**

Run: `npx vitest run lib/motion/storyboard.test.ts`

Expected: FAIL because `buildRepoLaunchMotionProject` is not defined.

- [ ] **Step 3: Implement the builder**

```ts
// lib/motion/storyboard.ts
import type {
  AppProfile,
  MotionBriefV2,
  MotionClaimReceipt,
  MotionPlatformTarget,
  MotionProject,
  MotionProjectKind,
  StoryBeat,
} from './project';

export interface BuildRepoLaunchMotionProjectInput {
  id: string;
  workspaceId: string;
  projectKind: MotionProjectKind;
  audience: string;
  tone: string;
  appProfile: AppProfile;
  claims: MotionClaimReceipt[];
  platformTargets: MotionPlatformTarget[];
  createdAt: number;
}

const DEFAULT_BRAND_MOTION = {
  palette: ['#f4ede0', '#1a1a1a', '#c8413a'],
  fontFamilies: ['IBM Plex Mono'],
  motionStyle: 'technical editorial',
};

export function buildRepoLaunchMotionProject(
  input: BuildRepoLaunchMotionProjectInput
): MotionProject {
  const firstClaim = input.claims[0] ?? {
    text: input.appProfile.summary,
    source: { kind: 'manual' as const, ref: `${input.appProfile.name}:summary` },
  };
  const sourceRefs = input.claims.map((claim) => claim.source);
  const brief: MotionBriefV2 = {
    projectKind: input.projectKind,
    appProfile: input.appProfile,
    audience: input.audience,
    platformTargets: input.platformTargets,
    claims: input.claims,
    tone: input.tone,
    brandMotion: DEFAULT_BRAND_MOTION,
  };

  const story: StoryBeat[] = [
    {
      id: 'beat-hook',
      role: 'hook',
      narration: `${input.appProfile.name}: ${input.appProfile.summary}`,
      targetSeconds: 3,
      selectedAssetIds: [],
      templateId: 'hook-card',
      provenance: sourceRefs,
    },
    {
      id: 'beat-problem',
      role: 'problem',
      narration: `Most launch posts show the surface. This one shows what ${input.appProfile.name} actually does.`,
      targetSeconds: 4,
      selectedAssetIds: [],
      templateId: 'proof-card',
      provenance: sourceRefs,
    },
    {
      id: 'beat-proof',
      role: 'proof',
      narration: firstClaim.text,
      targetSeconds: 5,
      selectedAssetIds: [],
      templateId: 'proof-card',
      provenance: [firstClaim.source],
    },
    {
      id: 'beat-demo',
      role: 'demo',
      narration: `Show ${input.appProfile.name} in use, with the product flow framed clearly.`,
      targetSeconds: 8,
      selectedAssetIds: [],
      templateId: 'app-frame',
      provenance: sourceRefs,
    },
    {
      id: 'beat-payoff',
      role: 'payoff',
      narration: `The output is ready to edit, adapt, and export across formats.`,
      targetSeconds: 6,
      selectedAssetIds: [],
      templateId: 'agent-trace',
      provenance: sourceRefs,
    },
    {
      id: 'beat-cta',
      role: 'cta',
      narration: `Launch ${input.appProfile.name} with receipts, not generic B-roll.`,
      targetSeconds: 4,
      selectedAssetIds: [],
      templateId: 'cta-card',
      provenance: sourceRefs,
    },
  ];

  return {
    id: input.id,
    workspaceId: input.workspaceId,
    title: `${input.appProfile.name} ${input.projectKind} video`,
    sourceRefs,
    brief,
    story,
    tracks: [],
    graphNodes: [
      {
        id: 'node-repo-ingest',
        kind: 'repo-ingest',
        inputRefs: input.appProfile.repoUrl ? [input.appProfile.repoUrl] : [],
        outputRefs: sourceRefs.map((source) => source.ref),
        status: 'done',
        provenance: sourceRefs,
      },
      {
        id: 'node-script',
        kind: 'script',
        inputRefs: sourceRefs.map((source) => source.ref),
        outputRefs: story.map((beat) => beat.id),
        status: 'done',
        provenance: sourceRefs,
      },
      {
        id: 'node-storyboard',
        kind: 'storyboard',
        inputRefs: story.map((beat) => beat.id),
        outputRefs: story.map((beat) => beat.templateId ?? beat.id),
        status: 'done',
        provenance: sourceRefs,
      },
    ],
    exports: input.platformTargets.map((target) => ({
      id: `export-${target.platform}-${target.aspectRatio.replace(':', 'x')}`,
      platform: target.platform,
      aspectRatio: target.aspectRatio,
      status: 'planned',
      provenance: sourceRefs,
    })),
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
  };
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run lib/motion/storyboard.test.ts`

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add lib/motion/storyboard.ts lib/motion/storyboard.test.ts
git commit -m "feat: build repo motion storyboards"
```

## Task 2A: Repo URL to Motion Project Bridge

**Files:**
- Create: `lib/motion/repoMotion.ts`
- Create: `lib/motion/repoMotion.test.ts`

- [x] **Step 1: Write the failing tests**

Cover GitHub repo URL normalization, repo facts fetching through an injected
fetcher, app profile construction, claim provenance, graph node input refs,
story beat ordering, and optional timeline materialization.

- [x] **Step 2: Run the failing tests**

Run: `npx vitest run lib/motion/repoMotion.test.ts`

Expected: FAIL because `lib/motion/repoMotion.ts` does not exist.

- [x] **Step 3: Add the bridge**

Implement `buildRepoMotionProjectFromUrl` as a pure adapter over
`fetchRepoFacts`, `buildRepoLaunchMotionProject`, and
`materializeMotionTimeline`. Keep repo URL normalization explicit and preserve
typed provenance from repo facts into motion claims.

- [x] **Step 4: Run tests**

Run: `npx vitest run lib/motion/repoMotion.test.ts`

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add lib/motion/repoMotion.ts lib/motion/repoMotion.test.ts docs/superpowers/plans/2026-06-23-repo-video-motion-first-slice.md
git commit -m "feat: build repo motion projects from url"
```

## Task 2B: Motion Review Plan and Scoped Regeneration

**Files:**
- Create: `lib/motion/reviewPlan.ts`
- Create: `lib/motion/reviewPlan.test.ts`

- [x] **Step 1: Write the failing tests**

Cover reviewable story outline, draft cards, editable component slots, declared
regeneration scopes, review-mode next actions, full-auto next actions, and
single-component regeneration requests.

- [x] **Step 2: Run the failing tests**

Run: `./node_modules/.bin/vitest run lib/motion/reviewPlan.test.ts --reporter verbose`

Expected: FAIL because `lib/motion/reviewPlan.ts` does not exist.

- [x] **Step 3: Add the review plan builder**

Implement `buildMotionReviewPlan` over the existing `MotionProject`,
`TimelineTrack`, and `componentRegistry` contracts. Keep it creator-facing:
drafts, story beats, component labels, edit controls, regenerate scopes, and
mode-specific actions; no raw provider run payloads in the primary artifact.

- [x] **Step 4: Add scoped regeneration requests**

Implement `createMotionComponentRegenerationRequest` so agents can regenerate a
single clip/component by a declared scope such as capture, timing, caption,
proof, code, diagram, CTA, or effect.

- [x] **Step 5: Run tests**

Run: `./node_modules/.bin/vitest run lib/motion/reviewPlan.test.ts`

Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add lib/motion/reviewPlan.ts lib/motion/reviewPlan.test.ts docs/superpowers/plans/2026-06-23-repo-video-motion-first-slice.md
git commit -m "feat: add motion review plan"
```

## Task 3: Motion Component Registry

**Files:**
- Create: `lib/motion/componentRegistry.ts`
- Create: `lib/motion/componentRegistry.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// lib/motion/componentRegistry.test.ts
import { describe, expect, it } from 'vitest';
import {
  getMotionComponent,
  listMotionComponents,
  motionComponentIds,
} from './componentRegistry';

describe('motion component registry', () => {
  it('ships the first five reusable repo-video components', () => {
    expect(motionComponentIds()).toEqual([
      'hook-card',
      'app-frame',
      'agent-trace',
      'proof-card',
      'cta-card',
    ]);
  });

  it('marks engines and aspect ratios per component', () => {
    const hook = getMotionComponent('hook-card');
    expect(hook?.engines).toEqual(['remotion', 'hyperframes']);
    expect(hook?.aspectRatios).toContain('9:16');
    expect(hook?.editControls.map((control) => control.id)).toContain('headline');
  });

  it('keeps every component creator-facing', () => {
    for (const component of listMotionComponents()) {
      expect(component.label).not.toMatch(/pipeline|operator|dashboard|control plane/i);
      expect(component.requiredProps.length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run the failing tests**

Run: `npx vitest run lib/motion/componentRegistry.test.ts`

Expected: FAIL because the registry module does not exist.

- [ ] **Step 3: Implement the registry**

```ts
// lib/motion/componentRegistry.ts
import type { MotionAspectRatio } from './project';

export type MotionRenderEngine = 'remotion' | 'hyperframes';

export interface MotionEditControl {
  id: string;
  label: string;
  kind: 'text' | 'asset' | 'number' | 'select' | 'color';
}

export interface MotionComponentDefinition {
  id: 'hook-card' | 'app-frame' | 'agent-trace' | 'proof-card' | 'cta-card';
  label: string;
  description: string;
  engines: MotionRenderEngine[];
  aspectRatios: MotionAspectRatio[];
  requiredProps: string[];
  editControls: MotionEditControl[];
}

const ALL_ASPECTS: MotionAspectRatio[] = ['16:9', '9:16', '1:1', '4:5'];

const COMPONENTS: MotionComponentDefinition[] = [
  {
    id: 'hook-card',
    label: 'Hook card',
    description: 'Opening beat with product name, promise, and optional progress.',
    engines: ['remotion', 'hyperframes'],
    aspectRatios: ALL_ASPECTS,
    requiredProps: ['headline', 'subhead'],
    editControls: [
      { id: 'headline', label: 'Headline', kind: 'text' },
      { id: 'subhead', label: 'Subhead', kind: 'text' },
      { id: 'accentColor', label: 'Accent color', kind: 'color' },
    ],
  },
  {
    id: 'app-frame',
    label: 'App frame',
    description: 'Captured product flow in a browser, device, desktop, or canvas frame.',
    engines: ['remotion'],
    aspectRatios: ALL_ASPECTS,
    requiredProps: ['assetId', 'caption'],
    editControls: [
      { id: 'assetId', label: 'Capture', kind: 'asset' },
      { id: 'caption', label: 'Caption', kind: 'text' },
      { id: 'zoom', label: 'Zoom', kind: 'number' },
    ],
  },
  {
    id: 'agent-trace',
    label: 'Agent trace',
    description: 'Prompt, action stack, diff, command, and preview proof for AI-native demos.',
    engines: ['remotion'],
    aspectRatios: ['16:9', '9:16'],
    requiredProps: ['prompt', 'steps'],
    editControls: [
      { id: 'prompt', label: 'Prompt', kind: 'text' },
      { id: 'steps', label: 'Steps', kind: 'text' },
      { id: 'proofLabel', label: 'Proof label', kind: 'text' },
    ],
  },
  {
    id: 'proof-card',
    label: 'Proof card',
    description: 'Grounded claim, source receipt, metric, or stack proof.',
    engines: ['remotion', 'hyperframes'],
    aspectRatios: ALL_ASPECTS,
    requiredProps: ['claim', 'sourceLabel'],
    editControls: [
      { id: 'claim', label: 'Claim', kind: 'text' },
      { id: 'sourceLabel', label: 'Source', kind: 'text' },
      { id: 'emphasis', label: 'Emphasis', kind: 'select' },
    ],
  },
  {
    id: 'cta-card',
    label: 'CTA card',
    description: 'Closing beat for launch link, repo link, waitlist, or export pack.',
    engines: ['remotion', 'hyperframes'],
    aspectRatios: ALL_ASPECTS,
    requiredProps: ['headline', 'action'],
    editControls: [
      { id: 'headline', label: 'Headline', kind: 'text' },
      { id: 'action', label: 'Action', kind: 'text' },
      { id: 'url', label: 'URL', kind: 'text' },
    ],
  },
];

export function listMotionComponents(): MotionComponentDefinition[] {
  return COMPONENTS;
}

export function motionComponentIds(): MotionComponentDefinition['id'][] {
  return COMPONENTS.map((component) => component.id);
}

export function getMotionComponent(id: string): MotionComponentDefinition | null {
  return COMPONENTS.find((component) => component.id === id) ?? null;
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run lib/motion/componentRegistry.test.ts`

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add lib/motion/componentRegistry.ts lib/motion/componentRegistry.test.ts
git commit -m "feat: add motion component registry"
```

## Task 4: Story Beats to Editable Timeline

**Files:**
- Create: `lib/motion/timeline.ts`
- Create: `lib/motion/timeline.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// lib/motion/timeline.test.ts
import { describe, expect, it } from 'vitest';
import { buildRepoLaunchMotionProject } from './storyboard';
import { compileStoryToTimeline } from './timeline';

function project() {
  return buildRepoLaunchMotionProject({
    id: 'motion-aether-launch',
    workspaceId: 'demo-ws',
    projectKind: 'launch',
    audience: 'builders',
    tone: 'precise',
    appProfile: {
      name: 'aether',
      summary: 'Canvas-native creative system.',
      stack: ['Next.js', 'Convex', 'tldraw'],
    },
    claims: [
      {
        text: 'Uses Next.js, Convex, and tldraw.',
        source: { kind: 'repo', ref: 'package.json#dependencies' },
      },
    ],
    platformTargets: [{ platform: 'x', aspectRatio: '9:16', seconds: 30 }],
    createdAt: 10,
  });
}

describe('compileStoryToTimeline', () => {
  it('creates ordered non-overlapping text, caption, voice, and transition tracks', () => {
    const timeline = compileStoryToTimeline(project());
    const text = timeline.find((track) => track.kind === 'text');
    const caption = timeline.find((track) => track.kind === 'caption');
    const voice = timeline.find((track) => track.kind === 'voice');
    const transition = timeline.find((track) => track.kind === 'transition');

    expect(text?.clips).toHaveLength(6);
    expect(caption?.clips).toHaveLength(6);
    expect(voice?.clips).toHaveLength(6);
    expect(transition?.clips.length).toBe(5);
    expect(text?.clips[0].startFrame).toBe(0);
    expect(text?.clips[1].startFrame).toBe(text!.clips[0].durationFrames);
  });

  it('keeps timeline clips globally linked by default', () => {
    const timeline = compileStoryToTimeline(project());
    const clips = timeline.flatMap((track) => track.clips);
    expect(clips.every((clip) => clip.linkedVariantScope === 'global')).toBe(true);
    expect(clips.every((clip) => clip.provenance.length > 0)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the failing tests**

Run: `npx vitest run lib/motion/timeline.test.ts`

Expected: FAIL because `compileStoryToTimeline` is not defined.

- [ ] **Step 3: Implement timeline compilation**

```ts
// lib/motion/timeline.ts
import { motionFrames, type MotionProject, type TimelineClip, type TimelineTrack } from './project';

export function compileStoryToTimeline(project: MotionProject): TimelineTrack[] {
  let cursor = 0;
  const textClips: TimelineClip[] = [];
  const captionClips: TimelineClip[] = [];
  const voiceClips: TimelineClip[] = [];
  const transitionClips: TimelineClip[] = [];

  project.story.forEach((beat, index) => {
    const durationFrames = motionFrames(beat.targetSeconds);
    textClips.push({
      id: `clip-${beat.id}-text`,
      componentId: beat.templateId,
      startFrame: cursor,
      durationFrames,
      props: { narration: beat.narration, role: beat.role },
      linkedVariantScope: 'global',
      provenance: [{ kind: 'story-beat', ref: beat.id }, ...beat.provenance],
    });
    captionClips.push({
      id: `clip-${beat.id}-caption`,
      componentId: 'caption-line',
      startFrame: cursor,
      durationFrames,
      props: { text: beat.narration },
      linkedVariantScope: 'global',
      provenance: [{ kind: 'story-beat', ref: beat.id }, ...beat.provenance],
    });
    voiceClips.push({
      id: `clip-${beat.id}-voice`,
      componentId: 'voice-line',
      startFrame: cursor,
      durationFrames,
      props: { text: beat.narration, status: 'planned' },
      linkedVariantScope: 'global',
      provenance: [{ kind: 'story-beat', ref: beat.id }, ...beat.provenance],
    });
    if (index > 0) {
      transitionClips.push({
        id: `clip-transition-${project.story[index - 1].id}-to-${beat.id}`,
        componentId: 'soft-wipe',
        startFrame: Math.max(0, cursor - motionFrames(0.35)),
        durationFrames: motionFrames(0.35),
        props: { fromBeatId: project.story[index - 1].id, toBeatId: beat.id },
        linkedVariantScope: 'global',
        provenance: [{ kind: 'story-beat', ref: beat.id }],
      });
    }
    cursor += durationFrames;
  });

  return [
    { id: 'track-text', kind: 'text', clips: textClips },
    { id: 'track-caption', kind: 'caption', clips: captionClips },
    { id: 'track-voice', kind: 'voice', clips: voiceClips },
    { id: 'track-transition', kind: 'transition', clips: transitionClips },
  ];
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run lib/motion/timeline.test.ts`

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add lib/motion/timeline.ts lib/motion/timeline.test.ts
git commit -m "feat: compile motion story timeline"
```

## Task 5: Video Provider Contract Split

**Files:**
- Create: `lib/providers/video/render-types.ts`
- Create: `lib/providers/video/generation-types.ts`
- Modify: `lib/providers/video/types.ts`
- Create: `lib/providers/video/render-registry.ts`
- Create: `lib/providers/video/render-registry.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// lib/providers/video/render-registry.test.ts
import { describe, expect, it } from 'vitest';
import { VideoRenderProviderUnavailableError, resolveVideoRenderProvider } from './render-registry';

describe('resolveVideoRenderProvider', () => {
  it('throws a typed unavailable error when no render provider is configured', () => {
    expect(() => resolveVideoRenderProvider()).toThrow(VideoRenderProviderUnavailableError);
  });

  it('throws a typed unavailable error for an unknown preferred provider', () => {
    expect(() => resolveVideoRenderProvider('missing-provider')).toThrow(
      /missing-provider/
    );
  });
});
```

- [ ] **Step 2: Run the failing tests**

Run: `npx vitest run lib/providers/video/render-registry.test.ts`

Expected: FAIL because render provider files do not exist.

- [ ] **Step 3: Add render and generation contracts**

```ts
// lib/providers/video/render-types.ts
import type { MotionAspectRatio, MotionPlatform, TimelineTrack } from '@/lib/motion/project';

export interface VideoRenderRequest {
  projectId: string;
  compositionId: string;
  tracks: TimelineTrack[];
  fps: number;
  width: number;
  height: number;
  platform: MotionPlatform;
  aspectRatio: MotionAspectRatio;
  inputProps?: Record<string, unknown>;
}

export interface VideoRenderResult {
  assetUrl: string;
  posterUrl: string;
  manifestUrl: string;
  subtitleUrl?: string;
  durationFrames: number;
  providerId: string;
  provenance: Array<{ kind: 'provider' | 'render'; ref: string }>;
}

export interface VideoRenderProvider {
  id: 'remotion' | 'hyperframes';
  displayName: string;
  available(): boolean;
  render(req: VideoRenderRequest): Promise<VideoRenderResult>;
}
```

```ts
// lib/providers/video/generation-types.ts
import type { MotionProvenanceRef } from '@/lib/motion/project';

export interface VideoGenerationRequest {
  prompt: string;
  sourceAssetId?: string;
  durationSeconds: number;
  aspectRatio: string;
  providerId?: string;
  model?: string;
  seed?: number;
}

export interface VideoGenerationResult {
  assetUrl: string;
  posterUrl?: string;
  durationSeconds: number;
  width: number;
  height: number;
  providerId: string;
  modelId?: string;
  provenance: MotionProvenanceRef[];
}

export interface VideoGenerationProvider {
  id: string;
  displayName: string;
  available(): boolean;
  generate(req: VideoGenerationRequest): Promise<VideoGenerationResult>;
}
```

```ts
// lib/providers/video/render-registry.ts
import type { VideoRenderProvider } from './render-types';

const REGISTRY: Record<string, () => VideoRenderProvider> = {};

export class VideoRenderProviderUnavailableError extends Error {
  constructor(reason: string) {
    super(`Video render provider unavailable: ${reason}`);
    this.name = 'VideoRenderProviderUnavailableError';
  }
}

export function resolveVideoRenderProvider(preferredId?: string): VideoRenderProvider {
  if (preferredId) {
    const factory = REGISTRY[preferredId];
    if (!factory) {
      throw new VideoRenderProviderUnavailableError(`unknown provider ${preferredId}`);
    }
    const provider = factory();
    if (provider.available()) return provider;
    throw new VideoRenderProviderUnavailableError(`${preferredId} is not configured`);
  }

  for (const factory of Object.values(REGISTRY)) {
    const provider = factory();
    if (provider.available()) return provider;
  }

  throw new VideoRenderProviderUnavailableError('no render provider has been configured');
}
```

```ts
// lib/providers/video/types.ts
export type VideoUnderstandingTask =
  | 'summarize'
  | 'transcribe'
  | 'extract-moments'
  | 'describe-shots'
  | 'free-form';

export interface VideoUnderstandingRequest {
  videoUrl: string;
  prompt?: string;
  task?: VideoUnderstandingTask;
}

export interface VideoUnderstandingResult {
  text: string;
  modelId: string;
  usageMs: number;
}

export interface VideoUnderstandingProvider {
  id: string;
  displayName: string;
  available(): boolean;
  understand(req: VideoUnderstandingRequest): Promise<VideoUnderstandingResult>;
}

export class VideoProviderUnavailableError extends Error {
  constructor(reason: string) {
    super(`Video provider unavailable: ${reason}`);
    this.name = 'VideoProviderUnavailableError';
  }
}

export type {
  VideoRenderProvider,
  VideoRenderRequest,
  VideoRenderResult,
} from './render-types';
export type {
  VideoGenerationProvider,
  VideoGenerationRequest,
  VideoGenerationResult,
} from './generation-types';
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run lib/providers/video/render-registry.test.ts`

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add lib/providers/video/render-types.ts lib/providers/video/generation-types.ts lib/providers/video/types.ts lib/providers/video/render-registry.ts lib/providers/video/render-registry.test.ts
git commit -m "feat: split video provider contracts"
```

## Task 5A: Capture Provider Contract

**Files:**
- Create: `lib/providers/capture/types.ts`
- Create: `lib/providers/capture/registry.ts`
- Create: `lib/providers/capture/registry.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// lib/providers/capture/registry.test.ts
import { describe, expect, it } from 'vitest';
import { CaptureProviderUnavailableError, resolveCaptureProvider } from './registry';

describe('resolveCaptureProvider', () => {
  it('throws a typed unavailable error when no capture provider is configured', () => {
    expect(() => resolveCaptureProvider()).toThrow(CaptureProviderUnavailableError);
  });

  it('throws a typed unavailable error for an unknown preferred provider', () => {
    expect(() => resolveCaptureProvider('missing-provider')).toThrow(/missing-provider/);
  });
});
```

- [ ] **Step 2: Run the failing tests**

Run: `npx vitest run lib/providers/capture/registry.test.ts`

Expected: FAIL because capture provider files do not exist.

- [ ] **Step 3: Add capture contracts and registry**

```ts
// lib/providers/capture/types.ts
import type { MotionAspectRatio, MotionProvenanceRef } from '@/lib/motion/project';

export type CaptureTargetKind = 'url' | 'local-app' | 'desktop-app' | 'figma' | 'repo';
export type CaptureMode = 'screenshot' | 'screen-recording' | 'dom-snapshot' | 'interaction-trace';

export interface CaptureStep {
  id: string;
  label: string;
  action: 'goto' | 'click' | 'type' | 'wait' | 'scroll' | 'record' | 'manual';
  selector?: string;
  value?: string;
  targetPoint?: { x: number; y: number };
  expectedArtifactId?: string;
}

export interface CaptureRequest {
  target: { kind: CaptureTargetKind; ref: string };
  mode: CaptureMode;
  aspectRatio: MotionAspectRatio;
  viewport: { width: number; height: number; deviceScaleFactor: number };
  steps: CaptureStep[];
  preferredProviderId?: string;
}

export interface CaptureArtifact {
  id: string;
  kind: 'screenshot' | 'recording' | 'snapshot' | 'trace';
  assetUrl: string;
  width: number;
  height: number;
  durationMs?: number;
  mimeType: string;
  viewport: CaptureRequest['viewport'];
  cursorTargets: Array<{ stepId: string; x: number; y: number }>;
  provenance: MotionProvenanceRef[];
}

export interface CaptureResult {
  providerId: string;
  artifacts: CaptureArtifact[];
  provenance: MotionProvenanceRef[];
}

export interface CaptureProvider {
  id: string;
  displayName: string;
  available(): boolean;
  capture(req: CaptureRequest): Promise<CaptureResult>;
}
```

```ts
// lib/providers/capture/registry.ts
import type { CaptureProvider } from './types';

const REGISTRY: Record<string, () => CaptureProvider> = {};

export class CaptureProviderUnavailableError extends Error {
  constructor(reason: string) {
    super(`Capture provider unavailable: ${reason}`);
    this.name = 'CaptureProviderUnavailableError';
  }
}

export function resolveCaptureProvider(preferredId?: string): CaptureProvider {
  if (preferredId) {
    const factory = REGISTRY[preferredId];
    if (!factory) {
      throw new CaptureProviderUnavailableError(`unknown provider ${preferredId}`);
    }
    const provider = factory();
    if (provider.available()) return provider;
    throw new CaptureProviderUnavailableError(`${preferredId} is not configured`);
  }

  for (const factory of Object.values(REGISTRY)) {
    const provider = factory();
    if (provider.available()) return provider;
  }

  throw new CaptureProviderUnavailableError('no capture provider has been configured');
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run lib/providers/capture/registry.test.ts`

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add lib/providers/capture/types.ts lib/providers/capture/registry.ts lib/providers/capture/registry.test.ts
git commit -m "feat: add capture provider contract"
```

## Task 5B: Code-Change Provider Contract

**Files:**
- Create: `lib/providers/code-change/types.ts`
- Create: `lib/providers/code-change/registry.ts`
- Create: `lib/providers/code-change/registry.test.ts`
- Modify: `lib/motion/project.ts`
- Modify: `lib/motion/project.test.ts`

- [x] **Step 1: Write the failing tests**

```ts
// lib/providers/code-change/registry.test.ts
import { describe, expect, it } from 'vitest';
import { CodeChangeProviderUnavailableError, resolveCodeChangeProvider } from './registry';

describe('resolveCodeChangeProvider', () => {
  it('throws a typed unavailable error when no code-change provider is configured', () => {
    expect(() => resolveCodeChangeProvider()).toThrow(CodeChangeProviderUnavailableError);
  });

  it('throws a typed unavailable error for an unknown preferred provider', () => {
    expect(() => resolveCodeChangeProvider('missing-provider')).toThrow(/missing-provider/);
  });
});
```

- [x] **Step 2: Run the failing tests**

Run: `npx vitest run lib/providers/code-change/registry.test.ts`

Expected: FAIL because code-change provider files do not exist.

- [x] **Step 3: Add code-change contracts and registry**

```ts
// lib/providers/code-change/types.ts
import type { MotionProvenanceRef } from '@/lib/motion/project';

export type CodeChangeSourceKind = 'github-pr' | 'local-diff' | 'commit-range';

export interface CodeChangeRequest {
  source: { kind: CodeChangeSourceKind; ref: string };
  preferredProviderId?: string;
}

export interface CodeChangeFile {
  path: string;
  status: 'added' | 'modified' | 'removed' | 'renamed';
  additions: number;
  deletions: number;
  language?: string;
}

export interface CodeChangeHunk {
  id: string;
  filePath: string;
  oldStart?: number;
  newStart?: number;
  lines: string[];
  provenance: MotionProvenanceRef[];
}

export interface CodeChangeResult {
  providerId: string;
  title: string;
  author?: { name: string; avatarUrl?: string };
  files: CodeChangeFile[];
  hunks: CodeChangeHunk[];
  commits: Array<{ sha: string; message: string; authorName?: string }>;
  reviews: Array<{ reviewer: string; state: 'approved' | 'changes-requested' | 'commented' }>;
  ci: Array<{ name: string; status: 'passed' | 'failed' | 'pending' | 'unknown'; url?: string }>;
  provenance: MotionProvenanceRef[];
}

export interface CodeChangeProvider {
  id: string;
  displayName: string;
  available(): boolean;
  ingest(req: CodeChangeRequest): Promise<CodeChangeResult>;
}
```

Use the same registry shape as capture providers. Do not auto-select GitHub or
`gh` as a default dependency from the domain model; the provider decides whether
the local CLI, connector, or API token is available.

- [x] **Step 4: Run tests**

Run: `npx vitest run lib/providers/code-change/registry.test.ts lib/motion/project.test.ts`

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add lib/providers/code-change/types.ts lib/providers/code-change/registry.ts lib/providers/code-change/registry.test.ts lib/motion/project.ts lib/motion/project.test.ts
git commit -m "feat: add code-change provider contract"
```

## Task 5C: GitHub CLI Code-Change Provider

**Files:**
- Create: `lib/providers/code-change/github-gh.ts`
- Create: `lib/providers/code-change/github-gh.test.ts`

- [x] **Step 1: Write the failing tests**

Cover `owner/repo#123` and GitHub pull request URL refs, injected `gh`
command selection, PR metadata mapping, paginated file parsing, full patch hunk
parsing, CI/review normalization, unsupported source rejection, and availability.

- [x] **Step 2: Run the failing tests**

Run: `npx vitest run lib/providers/code-change/github-gh.test.ts`

Expected: FAIL because `lib/providers/code-change/github-gh.ts` does not exist.

- [x] **Step 3: Add the GitHub CLI provider**

Implement `createGitHubGhCodeChangeProvider` with an injected command runner.
Use `gh pr view --json`, `gh api repos/:owner/:repo/pulls/:number/files
--paginate --slurp`, and `gh pr diff --patch --color never`. Keep registration
explicit so `github-gh` is available as a provider without becoming a hardcoded
default.

- [x] **Step 4: Run tests**

Run: `npx vitest run lib/providers/code-change/registry.test.ts lib/providers/code-change/github-gh.test.ts lib/motion/storyboard.test.ts`

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add lib/providers/code-change/github-gh.ts lib/providers/code-change/github-gh.test.ts docs/superpowers/plans/2026-06-23-repo-video-motion-first-slice.md
git commit -m "feat: add github pr evidence provider"
```

## Task 6: Timeline Lens Scaffold

**Files:**
- Create: `components/workspace/TimelineLens.tsx`
- Create: `tests/component/timeline-lens.test.tsx`
- Modify: `components/header/ViewSwitcher.tsx`
- Modify: `tests/component/view-switcher.test.tsx`
- Modify: `components/workspace/WorkspaceShell.tsx`
- Modify: `tests/component/view-switcher.focus-mode.test.tsx`

- [x] **Step 1: Write the component test**

```tsx
// tests/component/timeline-lens.test.tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TimelineLens } from '@/components/workspace/TimelineLens';
import type { TimelineTrack } from '@/lib/motion/project';

afterEach(cleanup);

const tracks: TimelineTrack[] = [
  {
    id: 'track-text',
    kind: 'text',
    clips: [
      {
        id: 'clip-hook',
        componentId: 'hook-card',
        startFrame: 0,
        durationFrames: 90,
        props: { narration: 'Launch with receipts.' },
        linkedVariantScope: 'global',
        provenance: [{ kind: 'story-beat', ref: 'beat-hook' }],
      },
    ],
  },
];

describe('TimelineLens', () => {
  it('renders creator-facing tracks and clips without raw provenance refs', () => {
    render(<TimelineLens tracks={tracks} selectedClipId={null} onSelectClip={() => {}} />);
    expect(screen.getByRole('region', { name: /timeline/i })).toBeInTheDocument();
    expect(screen.getByText('text')).toBeInTheDocument();
    expect(screen.getByText('Launch with receipts.')).toBeInTheDocument();
    expect(screen.queryByText('beat-hook')).not.toBeInTheDocument();
  });

  it('selects a clip from the timeline', async () => {
    const onSelectClip = vi.fn<(clipId: string) => void>();
    render(<TimelineLens tracks={tracks} selectedClipId={null} onSelectClip={onSelectClip} />);
    await userEvent.click(screen.getByRole('button', { name: /Launch with receipts/i }));
    expect(onSelectClip).toHaveBeenCalledWith('clip-hook');
  });
});
```

- [x] **Step 2: Run failing tests**

Run: `./node_modules/.bin/vitest run tests/component/timeline-lens.test.tsx tests/component/view-switcher.test.tsx tests/component/view-switcher.focus-mode.test.tsx`

Expected: FAIL because `TimelineLens` does not exist and the view switcher still disables timeline.

- [x] **Step 3: Add the scaffold**

```tsx
// components/workspace/TimelineLens.tsx
'use client';

import { cn } from '@/lib/utils/cn';
import type { TimelineTrack } from '@/lib/motion/project';

export interface TimelineLensProps {
  tracks: TimelineTrack[];
  selectedClipId: string | null;
  onSelectClip: (clipId: string) => void;
}

function clipLabel(props: Record<string, unknown>): string {
  const narration = props.narration ?? props.text ?? props.claim ?? props.headline;
  return typeof narration === 'string' && narration.trim() ? narration : 'Untitled clip';
}

export function TimelineLens({ tracks, selectedClipId, onSelectClip }: TimelineLensProps) {
  return (
    <section
      aria-label="timeline"
      data-taxonomy="tool"
      className="flex h-full min-h-0 flex-col gap-3 border-t border-border-soft bg-surface-panel/80 p-3"
    >
      <div className="grid min-h-0 flex-1 gap-2">
        {tracks.map((track) => (
          <div key={track.id} className="grid grid-cols-[84px_1fr] items-center gap-2">
            <div className="font-mono text-2xs uppercase tracking-wide text-ink-dim">
              {track.kind}
            </div>
            <div className="flex min-w-0 gap-1 overflow-x-auto">
              {track.clips.map((clip) => {
                const selected = clip.id === selectedClipId;
                return (
                  <button
                    key={clip.id}
                    type="button"
                    onClick={() => onSelectClip(clip.id)}
                    className={cn(
                      'min-w-32 max-w-56 truncate rounded-md border px-2 py-1 text-left text-xs',
                      selected
                        ? 'border-ink bg-surface-panel text-ink'
                        : 'border-border-soft bg-surface-panel-muted text-ink-muted'
                    )}
                  >
                    {clipLabel(clip.props)}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
```

- [x] **Step 4: Enable the timeline pill**

Modify `components/header/ViewSwitcher.tsx` so the timeline view is live:

```ts
const VIEWS: ReadonlyArray<ViewDef> = [
  { id: 'canvas', label: 'canvas', live: true },
  { id: 'focus', label: 'focus', live: true },
  { id: 'timeline', label: 'timeline', live: true },
  { id: 'graph', label: 'graph', live: false },
  { id: 'mood', label: 'mood', live: false },
  { id: 'chat', label: 'chat', live: false },
];
```

Update `tests/component/view-switcher.test.tsx` so only `graph`, `mood`, and
`chat` remain disabled, and clicking `timeline` calls `onChangeView('timeline')`.

- [x] **Step 5: Wire the lens in `WorkspaceShell`**

Add an import:

```ts
import { TimelineLens } from '@/components/workspace/TimelineLens';
```

Create temporary empty motion timeline state near the existing `view` state:

```ts
const [selectedMotionClipId, setSelectedMotionClipId] = useState<string | null>(null);
const motionTracks = useMemo(() => [], []);
```

Render the scaffold in the existing shell layout wherever the focus/canvas view branch is handled:

```tsx
{view === 'timeline' ? (
  <TimelineLens
    tracks={motionTracks}
    selectedClipId={selectedMotionClipId}
    onSelectClip={setSelectedMotionClipId}
  />
) : null}
```

- [x] **Step 6: Run tests**

Run: `./node_modules/.bin/vitest run tests/component/timeline-lens.test.tsx tests/component/view-switcher.test.tsx tests/component/view-switcher.focus-mode.test.tsx`

Expected: PASS.

- [x] **Step 7: Commit**

```bash
git add components/workspace/TimelineLens.tsx components/header/ViewSwitcher.tsx components/workspace/WorkspaceShell.tsx tests/component/timeline-lens.test.tsx tests/component/view-switcher.test.tsx tests/component/view-switcher.focus-mode.test.tsx docs/superpowers/plans/2026-06-23-repo-video-motion-first-slice.md
git commit -m "feat: scaffold motion timeline lens"
```

## Task 7: Agent Tool and Workflow Registry

**Files:**
- Modify: `lib/tool/registry.ts`
- Modify: `lib/capability/types.ts`
- Modify: `lib/workflow/registry.ts`
- Modify: `tests/unit/capability-registry.test.ts`

- [x] **Step 1: Write or extend registry tests**

Add these assertions to `tests/unit/capability-registry.test.ts`:

```ts
import { getToolRegistryEntry, listPublishedToolRegistryEntries } from '@/lib/tool/registry';
import { getWorkflowRegistryEntry } from '@/lib/workflow/registry';
import type { CapabilityTool } from '@/lib/capability/types';

it('registers draft motion tools for agent-native video workflows', () => {
  const motionToolIds = [
    'motion-brief',
    'motion-storyboard',
    'motion-capture',
    'motion-visuals',
    'motion-voice',
    'motion-sync',
    'motion-render',
    'motion-revise',
    'motion-pin-capability',
  ] satisfies CapabilityTool[];

  for (const id of motionToolIds) {
    expect(getToolRegistryEntry(id)).toMatchObject({
      kind: 'tool',
      id,
      artifactKind: 'video',
      status: 'draft',
    });
  }
  expect(listPublishedToolRegistryEntries().map((entry) => entry.id)).not.toContain(
    'motion-render'
  );
});

it('registers reusable draft video workflows with review gates and engine hints', () => {
  expect(getWorkflowRegistryEntry('repo-launch-video')).toMatchObject({
    id: 'repo-launch-video',
    toolIds: [
      'motion-brief',
      'motion-storyboard',
      'motion-capture',
      'motion-visuals',
      'motion-voice',
      'motion-sync',
      'motion-render',
      'motion-revise',
    ],
    sourceKinds: ['repo', 'site', 'capture', 'reference'],
    engines: ['remotion', 'hyperframes', 'provider'],
    reviewGates: ['plan', 'drafts', 'capture', 'voice', 'timeline', 'render', 'export'],
    status: 'draft',
  });

  expect(getWorkflowRegistryEntry('pr-to-video')).toMatchObject({
    id: 'pr-to-video',
    sourceKinds: ['pr', 'repo'],
    engines: ['remotion', 'hyperframes'],
    reviewGates: ['plan', 'drafts', 'timeline', 'render', 'export'],
    status: 'draft',
  });
});
```

- [x] **Step 2: Run failing tests**

Run: `./node_modules/.bin/vitest run tests/unit/capability-registry.test.ts`

Expected: FAIL because motion tool ids and workflow are not registered.

- [x] **Step 3: Add tool ids**

In `lib/tool/registry.ts`, add these draft entries to `TOOL_REGISTRY`:

```ts
  'motion-brief': {
    kind: 'tool',
    id: 'motion-brief',
    version: 1,
    artifactKind: 'video',
    label: 'Motion brief',
    outputKind: 'video',
    status: 'draft',
  },
  'motion-storyboard': {
    kind: 'tool',
    id: 'motion-storyboard',
    version: 1,
    artifactKind: 'video',
    label: 'Motion storyboard',
    outputKind: 'video',
    status: 'draft',
  },
  'motion-capture': {
    kind: 'tool',
    id: 'motion-capture',
    version: 1,
    artifactKind: 'video',
    label: 'Product capture',
    outputKind: 'video',
    status: 'draft',
  },
  'motion-visuals': {
    kind: 'tool',
    id: 'motion-visuals',
    version: 1,
    artifactKind: 'video',
    label: 'Visual generation',
    outputKind: 'video',
    status: 'draft',
  },
  'motion-voice': {
    kind: 'tool',
    id: 'motion-voice',
    version: 1,
    artifactKind: 'video',
    label: 'Voiceover',
    outputKind: 'audio',
    status: 'draft',
  },
  'motion-sync': {
    kind: 'tool',
    id: 'motion-sync',
    version: 1,
    artifactKind: 'video',
    label: 'Motion sync',
    outputKind: 'video',
    status: 'draft',
  },
  'motion-render': {
    kind: 'tool',
    id: 'motion-render',
    version: 1,
    artifactKind: 'video',
    label: 'Motion render',
    outputKind: 'video',
    status: 'draft',
  },
  'motion-revise': {
    kind: 'tool',
    id: 'motion-revise',
    version: 1,
    artifactKind: 'video',
    label: 'Timeline revise',
    outputKind: 'video',
    status: 'draft',
  },
  'motion-pin-capability': {
    kind: 'tool',
    id: 'motion-pin-capability',
    version: 1,
    artifactKind: 'video',
    label: 'Pin motion capability',
    outputKind: 'video',
    status: 'draft',
  },
```

In `lib/capability/types.ts`, extend `CapabilityTool`:

```ts
export type CapabilityTool =
  | 'image-gen'
  | 'image-edit'
  | 'bg-fill'
  | 'cutout'
  | 'relight'
  | 'spatial-gen'
  | 'text-apply'
  | 'motion-brief'
  | 'motion-storyboard'
  | 'motion-capture'
  | 'motion-visuals'
  | 'motion-voice'
  | 'motion-sync'
  | 'motion-render'
  | 'motion-revise'
  | 'motion-pin-capability';
```

- [x] **Step 4: Add workflow registry entries**

In `lib/workflow/registry.ts`, add optional workflow metadata fields:

```ts
export type WorkflowSourceKind =
  | 'repo'
  | 'pr'
  | 'site'
  | 'capture'
  | 'upload'
  | 'reference'
  | 'remotion'
  | 'hyperframes';
export type WorkflowEngine = 'remotion' | 'hyperframes' | 'provider';
export type WorkflowReviewGate =
  | 'plan'
  | 'drafts'
  | 'capture'
  | 'voice'
  | 'timeline'
  | 'render'
  | 'export';
```

Then add draft video workflow entries:

```ts
  'repo-launch-video': {
    kind: 'workflow',
    id: 'repo-launch-video',
    version: 1,
    artifactKind: 'video',
    label: 'Repo launch video',
    toolIds: [
      'motion-brief',
      'motion-storyboard',
      'motion-capture',
      'motion-visuals',
      'motion-voice',
      'motion-sync',
      'motion-render',
      'motion-revise',
    ],
    sourceKinds: ['repo', 'site', 'capture', 'reference'],
    engines: ['remotion', 'hyperframes', 'provider'],
    reviewGates: ['plan', 'drafts', 'capture', 'voice', 'timeline', 'render', 'export'],
    status: 'draft',
  },
```

- [x] **Step 5: Run tests**

Run:

```bash
./node_modules/.bin/vitest run tests/unit/capability-registry.test.ts
./node_modules/.bin/vitest run lib/motion/componentRegistry.test.ts lib/motion/reviewPlan.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/tool/registry.ts lib/capability/types.ts lib/workflow/registry.ts tests/unit/capability-registry.test.ts docs/superpowers/plans/2026-06-23-repo-video-motion-first-slice.md docs/specs/2026-06-23-repo-video-system/README.md
git commit -m "feat: register motion video workflow tools"
```

## Task 8: Proof Notes and First Slice Gate

**Files:**
- Create: `docs/specs/2026-06-23-repo-video-system/implementation-notes.md`

- [x] **Step 1: Add implementation notes**

~~~md
# Repo Video Motion First Slice Notes

- Plan: `docs/superpowers/plans/2026-06-23-repo-video-motion-first-slice.md`
- Spec: `docs/specs/2026-06-23-repo-video-system/README.md`

## Implemented slice

- Motion project primitives
- Repo facts to story beats
- Motion component registry
- Story to timeline compiler
- Split video render/generation provider contracts
- Capture provider contract
- Timeline lens scaffold
- Draft agent tool and workflow registry entries

## Verification commands

```bash
npx vitest run lib/motion/project.test.ts lib/motion/storyboard.test.ts lib/motion/componentRegistry.test.ts lib/motion/timeline.test.ts
npx vitest run lib/providers/video/render-registry.test.ts lib/providers/capture/registry.test.ts tests/component/timeline-lens.test.tsx tests/component/view-switcher.test.tsx tests/unit/tool-registry.test.ts
npm run typecheck
```

## Human validation gate

Before adding real render providers, review the timeline lens in the app and
confirm it feels like an editing surface inside the canvas shell, not a run
history panel.

## Corpus follow-up

Run the authenticated X and YouTube corpus pass from the planning spec before
locking the visual component library. The direct text-fetch path could not
inspect `x.com` pages during planning.
~~~

- [x] **Step 2: Run all first-slice tests**

Run:

```bash
./node_modules/.bin/vitest run lib/motion/project.test.ts lib/motion/storyboard.test.ts lib/motion/repoMotion.test.ts lib/motion/componentRegistry.test.ts lib/motion/timeline.test.ts lib/motion/reviewPlan.test.ts
./node_modules/.bin/vitest run lib/providers/video/render-registry.test.ts lib/providers/capture/registry.test.ts lib/providers/code-change/registry.test.ts lib/providers/code-change/github-gh.test.ts tests/component/timeline-lens.test.tsx tests/component/view-switcher.test.tsx tests/component/view-switcher.focus-mode.test.tsx tests/unit/capability-registry.test.ts
npm run typecheck
git diff --check
```

Expected: all commands pass.

- [ ] **Step 3: Commit**

```bash
git add docs/specs/2026-06-23-repo-video-system/implementation-notes.md
git commit -m "docs: record repo video first slice proof"
```

## Task 9: Agent Motion Workflow Planner

**Files:**
- Create: `lib/motion/workflowPlan.ts`
- Create: `lib/motion/workflowPlan.test.ts`
- Modify: `docs/specs/2026-06-23-repo-video-system/implementation-notes.md`

- [x] **Step 1: Write the failing planner tests**

```ts
import { describe, expect, it } from 'vitest';
import { buildAgentMotionWorkflowPlan } from './workflowPlan';

it('turns repo launch workflow metadata into a reviewable agent plan', () => {
  const plan = buildAgentMotionWorkflowPlan({
    workflowId: 'repo-launch-video',
    mode: 'review',
    sourceRefs: [{ kind: 'repo', ref: 'https://github.com/erniesg/aether' }],
    createdAt: 100,
  });

  expect(plan.primaryAction).toBe('request-review');
  expect(plan.gates.map((gate) => gate.id)).toEqual([
    'plan',
    'drafts',
    'capture',
    'voice',
    'timeline',
    'render',
    'export',
  ]);
});
```

- [x] **Step 2: Run the failing test**

Run: `./node_modules/.bin/vitest run lib/motion/workflowPlan.test.ts`

Expected: FAIL because `lib/motion/workflowPlan.ts` does not exist.

- [x] **Step 3: Implement the planner**

`lib/motion/workflowPlan.ts` now maps registered workflow metadata to:

- accepted, missing, or unsupported source status;
- supported Remotion/HyperFrames/provider engine hints;
- review or full-auto primary action;
- ordered gates with tool ids and expected artifacts;
- next actions for review mode and saved full-auto mode.

- [x] **Step 4: Run the focused test**

Run: `./node_modules/.bin/vitest run lib/motion/workflowPlan.test.ts`

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add lib/motion/workflowPlan.ts lib/motion/workflowPlan.test.ts docs/superpowers/plans/2026-06-23-repo-video-motion-first-slice.md docs/specs/2026-06-23-repo-video-system/implementation-notes.md
git commit -m "feat: plan agent motion workflow gates"
```

## Task 10: Agent Motion Workflow Router

**Files:**
- Create: `lib/motion/workflowRouter.ts`
- Create: `lib/motion/workflowRouter.test.ts`
- Modify: `docs/specs/2026-06-23-repo-video-system/README.md`
- Modify: `docs/specs/2026-06-23-repo-video-system/implementation-notes.md`

- [x] **Step 1: Write the failing router tests**

The tests cover routing from source refs and intent:

- repo source -> `repo-launch-video`
- PR source -> `pr-to-video` without capture/voice gates
- feature/social intent -> `feature-social-video`
- website demo -> `website-to-video`
- caption overlay -> `caption-overlay-video`
- motion graphic -> `motion-graphic-video`
- Remotion/HyperFrames source -> `remotion-hyperframes-port`
- missing source -> reviewable request-source plan

- [x] **Step 2: Run the failing test**

Run: `./node_modules/.bin/vitest run lib/motion/workflowRouter.test.ts`

Expected: FAIL because `lib/motion/workflowRouter.ts` does not exist.

- [x] **Step 3: Implement the router**

`lib/motion/workflowRouter.ts` now returns a selected workflow id, a routing
reason, and the `AgentMotionWorkflowPlan` produced by the shared planner.

- [x] **Step 4: Run the focused test**

Run: `./node_modules/.bin/vitest run lib/motion/workflowRouter.test.ts`

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add lib/motion/workflowRouter.ts lib/motion/workflowRouter.test.ts docs/superpowers/plans/2026-06-23-repo-video-motion-first-slice.md docs/specs/2026-06-23-repo-video-system/README.md docs/specs/2026-06-23-repo-video-system/implementation-notes.md
git commit -m "feat: route agent motion workflow starts"
```

## Task 11: Agent Motion Workflow Start Artifact

**Files:**
- Create: `lib/motion/start.ts`
- Create: `lib/motion/start.test.ts`
- Modify: `docs/specs/2026-06-23-repo-video-system/README.md`
- Modify: `docs/specs/2026-06-23-repo-video-system/implementation-notes.md`

- [x] **Step 1: Write the failing start-flow tests**

The tests cover:

- repo source -> routed workflow, materialized motion project, editable review
  plan, draft variations, and component slots;
- PR source -> `needs-evidence` request for code-change evidence before project
  creation;
- missing source -> `needs-source` request with accepted source kinds.

- [x] **Step 2: Run the failing test**

Run: `./node_modules/.bin/vitest run lib/motion/start.test.ts`

Expected: FAIL because `lib/motion/start.ts` does not exist.

- [x] **Step 3: Implement the start artifact**

`lib/motion/start.ts` now routes the workflow, returns source/evidence requests
when inputs are incomplete, and creates a materialized repo motion project plus
review plan when a repo source can be fetched. PR workflows stay on code-change
evidence rather than falling back to generic repo facts.

- [x] **Step 4: Run the focused test**

Run: `./node_modules/.bin/vitest run lib/motion/start.test.ts`

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add lib/motion/start.ts lib/motion/start.test.ts docs/superpowers/plans/2026-06-23-repo-video-motion-first-slice.md docs/specs/2026-06-23-repo-video-system/README.md docs/specs/2026-06-23-repo-video-system/implementation-notes.md
git commit -m "feat: start agent motion workflows"
```

## Task 12: Site/App URL Motion Starts

**Files:**
- Create: `lib/motion/siteMotion.ts`
- Modify: `lib/motion/start.ts`
- Modify: `lib/motion/start.test.ts`
- Modify: `docs/specs/2026-06-23-repo-video-system/README.md`
- Modify: `docs/specs/2026-06-23-repo-video-system/implementation-notes.md`

- [x] **Step 1: Write the failing site-start test**

The test covers a `site` source with `demo` intent returning:

- routed `website-to-video` workflow with capture gate;
- materialized motion project with site app profile, claims, stack hints, tracks,
  and capture-first graph node;
- editable review plan and component slots.

- [x] **Step 2: Run the failing test**

Run: `./node_modules/.bin/vitest run lib/motion/start.test.ts`

Expected: FAIL because site sources still return `planned-only`.

- [x] **Step 3: Implement the site motion builder**

`lib/motion/siteMotion.ts` now fetches the app/site URL, extracts site claims,
derives stack hints, builds a launch/demo/social motion project through the
shared storyboard path, replaces the repo ingest node with a capture-planning
node, and materializes the editable timeline.

- [x] **Step 4: Wire site starts into the agent start flow**

`startAgentMotionWorkflow` now creates ready projects for `website-to-video`
site sources, and for feature/social starts when the available source is a site
URL rather than a repo.

- [x] **Step 5: Run the focused test**

Run: `./node_modules/.bin/vitest run lib/motion/start.test.ts`

Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add lib/motion/siteMotion.ts lib/motion/start.ts lib/motion/start.test.ts docs/superpowers/plans/2026-06-23-repo-video-motion-first-slice.md docs/specs/2026-06-23-repo-video-system/README.md docs/specs/2026-06-23-repo-video-system/implementation-notes.md
git commit -m "feat: start site motion workflows"
```

## Task 13: Agent Capture Plan Artifact

**Files:**
- Create: `lib/motion/capturePlan.ts`
- Create: `lib/motion/capturePlan.test.ts`
- Modify: `lib/motion/start.ts`
- Modify: `lib/motion/start.test.ts`
- Modify: `docs/specs/2026-06-23-repo-video-system/README.md`
- Modify: `docs/specs/2026-06-23-repo-video-system/implementation-notes.md`

- [x] **Step 1: Write the failing capture-plan tests**

The tests cover:

- site/app motion project -> screenshot-first browser capture plan with
  screenshot, DOM snapshot, interaction trace, optional screen recording,
  browser-capture provider requirement, viewport, provenance, and
  computer-control fallback;
- PR-only motion project -> no capture requests.

- [x] **Step 2: Run the failing test**

Run: `./node_modules/.bin/vitest run lib/motion/capturePlan.test.ts lib/motion/start.test.ts`

Expected: FAIL because `lib/motion/capturePlan.ts` does not exist and start
results do not expose `capturePlan`.

- [x] **Step 3: Implement the capture planner**

`lib/motion/capturePlan.ts` now converts capture-first motion projects into
provider-ready capture requests with target, mode, viewport, steps, expected
artifacts, provenance, and fallback guidance. It returns `not-needed` for PR
motion projects and `needs-source` when a non-PR project lacks a usable capture
source.

- [x] **Step 4: Wire capture plans into motion starts**

`startAgentMotionWorkflow` now includes `capturePlan` on ready results when the
project needs capture work.

- [x] **Step 5: Run the focused test**

Run: `./node_modules/.bin/vitest run lib/motion/capturePlan.test.ts lib/motion/start.test.ts`

Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add lib/motion/capturePlan.ts lib/motion/capturePlan.test.ts lib/motion/start.ts lib/motion/start.test.ts docs/superpowers/plans/2026-06-23-repo-video-motion-first-slice.md docs/specs/2026-06-23-repo-video-system/README.md docs/specs/2026-06-23-repo-video-system/implementation-notes.md
git commit -m "feat: plan agent motion captures"
```

## Task 14: Browser Capture Provider Boundary

**Files:**
- Create: `lib/providers/capture/browser.ts`
- Create: `lib/providers/capture/browser.test.ts`
- Modify: `docs/specs/2026-06-23-repo-video-system/README.md`
- Modify: `docs/specs/2026-06-23-repo-video-system/implementation-notes.md`

- [x] **Step 1: Write the failing browser-provider tests**

The tests cover:

- provider fails closed when no runner is configured;
- screenshot request execution maps runner output to a typed capture artifact;
- DOM snapshot and interaction trace modes map to snapshot/trace artifacts while
  preserving runner receipts, cursor targets, and provenance.

- [x] **Step 2: Run the failing test**

Run: `./node_modules/.bin/vitest run lib/providers/capture/browser.test.ts`

Expected: FAIL because `lib/providers/capture/browser.ts` does not exist.

- [x] **Step 3: Implement the provider boundary**

`lib/providers/capture/browser.ts` now exposes `createBrowserCaptureProvider`
with an injected `BrowserCaptureRunner`. The provider normalizes runner output
into `CaptureArtifact` records, derives stable ids, maps modes to artifact
kinds, carries viewport/cursor/provenance receipts, and does not auto-register
itself as the default capture provider.

- [x] **Step 4: Run the focused test**

Run: `./node_modules/.bin/vitest run lib/providers/capture/browser.test.ts`

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add lib/providers/capture/browser.ts lib/providers/capture/browser.test.ts docs/superpowers/plans/2026-06-23-repo-video-motion-first-slice.md docs/specs/2026-06-23-repo-video-system/README.md docs/specs/2026-06-23-repo-video-system/implementation-notes.md
git commit -m "feat: add browser motion capture provider"
```

## Task 15: Playwright Capture Runner

**Files:**
- Create: `lib/providers/capture/playwright.ts`
- Create: `lib/providers/capture/playwright.test.ts`
- Modify: `docs/specs/2026-06-23-repo-video-system/README.md`
- Modify: `docs/specs/2026-06-23-repo-video-system/implementation-notes.md`

- [x] **Step 1: Write the failing Playwright runner tests**

The tests cover:

- browser step execution for `goto`, `wait`, and coordinate click;
- screenshot capture file receipt mapping;
- DOM snapshot and interaction trace JSON receipt writing;
- screen recording mode returning an existing Playwright video path;
- wrapping the runner in the `browser-capture` provider factory.

- [x] **Step 2: Run the failing test**

Run: `./node_modules/.bin/vitest run lib/providers/capture/playwright.test.ts`

Expected: FAIL because `lib/providers/capture/playwright.ts` does not exist,
then FAIL for the missing provider wrapper export.

- [x] **Step 3: Implement the runner**

`lib/providers/capture/playwright.ts` now exposes
`createPlaywrightCaptureRunner` and `createPlaywrightBrowserCaptureProvider`.
The runner dynamically imports Playwright only when used, opens a local browser
context, executes capture steps, writes local screenshot/DOM/trace artifacts,
returns Playwright video paths for recording mode, and carries runner
provenance. It does not register itself as the default provider.

- [x] **Step 4: Run the focused test**

Run: `./node_modules/.bin/vitest run lib/providers/capture/playwright.test.ts`

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add lib/providers/capture/playwright.ts lib/providers/capture/playwright.test.ts docs/superpowers/plans/2026-06-23-repo-video-motion-first-slice.md docs/specs/2026-06-23-repo-video-system/README.md docs/specs/2026-06-23-repo-video-system/implementation-notes.md
git commit -m "feat: add playwright motion capture runner"
```

## Task 16: Capture Result Application

**Files:**
- Create: `lib/motion/captureApply.ts`
- Create: `lib/motion/captureApply.test.ts`
- Modify: `lib/motion/project.ts`
- Modify: `docs/specs/2026-06-23-repo-video-system/README.md`
- Modify: `docs/specs/2026-06-23-repo-video-system/implementation-notes.md`

- [x] **Step 1: Write the failing capture-application tests**

The tests cover:

- visual capture receipts becoming selected demo beat assets and editable
  `app-frame` timeline props;
- review-plan component slots surfacing the applied capture asset;
- DOM/trace-only receipts completing the capture graph node without occupying
  visual app-frame slots.

- [x] **Step 2: Run the failing test**

Run: `./node_modules/.bin/vitest run lib/motion/captureApply.test.ts`

Expected: FAIL because `lib/motion/captureApply.ts` does not exist.

- [x] **Step 3: Implement capture result application**

`lib/motion/captureApply.ts` now applies provider-neutral `CaptureResult`
objects to `MotionProject` records. Screenshots and recordings update the demo
beat, current draft, app-frame clips, and review props. All capture artifacts
complete the capture graph node with provider id, output refs, and typed
provenance.

- [x] **Step 4: Run the focused test**

Run: `./node_modules/.bin/vitest run lib/motion/captureApply.test.ts`

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add lib/motion/captureApply.ts lib/motion/captureApply.test.ts lib/motion/project.ts docs/superpowers/plans/2026-06-23-repo-video-motion-first-slice.md docs/specs/2026-06-23-repo-video-system/README.md docs/specs/2026-06-23-repo-video-system/implementation-notes.md
git commit -m "feat: apply motion capture results"
```

## Task 17: Render Handoff Plan and Registry

**Files:**
- Create: `lib/motion/renderPlan.ts`
- Create: `lib/motion/renderPlan.test.ts`
- Create: `lib/providers/video/render-registry.ts`
- Create: `lib/providers/video/render-registry.test.ts`
- Modify: `lib/providers/video/types.ts`
- Modify: `docs/specs/2026-06-23-repo-video-system/README.md`
- Modify: `docs/specs/2026-06-23-repo-video-system/implementation-notes.md`

- [x] **Step 1: Write failing render handoff tests**

The tests cover:

- editable timeline -> render plan with engine, composition id, duration,
  component ids, track refs, dimensions, output paths, and planned render graph
  node;
- missing timeline -> `needs-timeline` blocker instead of invented render
  inputs;
- opt-in render provider registry for Remotion and HyperFrames, with no hidden
  default renderer.

- [x] **Step 2: Run the failing tests**

Run: `./node_modules/.bin/vitest run lib/motion/renderPlan.test.ts lib/providers/video/render-registry.test.ts`

Expected: FAIL because `lib/motion/renderPlan.ts` and
`lib/providers/video/render-registry.ts` do not exist.

- [x] **Step 3: Implement render handoff contracts**

`lib/motion/renderPlan.ts` now converts materialized motion timelines into
provider-neutral render requests for Remotion or HyperFrames. It declares
expected MP4, poster, subtitle, transcript, and manifest outputs for every
export target, with dimensions and provenance. `lib/providers/video/types.ts`
and `render-registry.ts` define the provider contract and opt-in registry.

- [x] **Step 4: Run focused tests and typecheck**

Run:

```bash
./node_modules/.bin/vitest run lib/motion/renderPlan.test.ts lib/providers/video/render-registry.test.ts
npm run typecheck
```

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add lib/motion/renderPlan.ts lib/motion/renderPlan.test.ts lib/providers/video/render-registry.ts lib/providers/video/render-registry.test.ts lib/providers/video/types.ts docs/superpowers/plans/2026-06-23-repo-video-motion-first-slice.md docs/specs/2026-06-23-repo-video-system/README.md docs/specs/2026-06-23-repo-video-system/implementation-notes.md
git commit -m "feat: plan motion render handoffs"
```

## Task 18: Voiceover Sync Handoff Plan

**Files:**
- Create: `lib/motion/voicePlan.ts`
- Create: `lib/motion/voicePlan.test.ts`
- Create: `lib/providers/voice/types.ts`
- Create: `lib/providers/voice/registry.ts`
- Create: `lib/providers/voice/registry.test.ts`
- Modify: `docs/specs/2026-06-23-repo-video-system/README.md`
- Modify: `docs/specs/2026-06-23-repo-video-system/implementation-notes.md`

- [x] **Step 1: Write failing voiceover handoff tests**

The tests cover:

- voice timeline clips -> synthesis requests with text, start/duration frames,
  target seconds, voice id, and expected audio, word-timing, and transcript
  artifacts;
- missing timeline -> `needs-timeline` blocker instead of invented synthesis
  inputs;
- opt-in voice provider registry with no hidden default TTS vendor.

- [x] **Step 2: Run the failing tests**

Run: `./node_modules/.bin/vitest run lib/motion/voicePlan.test.ts lib/providers/voice/registry.test.ts`

Expected: FAIL because `lib/motion/voicePlan.ts` and
`lib/providers/voice/registry.ts` do not exist.

- [x] **Step 3: Implement voice handoff contracts**

`lib/motion/voicePlan.ts` now converts materialized voice-line clips into
provider-neutral voice synthesis requests. Each request declares audio,
word-timing, and transcript artifacts for later caption and render sync.
`lib/providers/voice/types.ts` and `registry.ts` define the provider contract
and opt-in registry.

- [x] **Step 4: Run focused tests and typecheck**

Run:

```bash
./node_modules/.bin/vitest run lib/motion/voicePlan.test.ts lib/providers/voice/registry.test.ts
npm run typecheck
```

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add lib/motion/voicePlan.ts lib/motion/voicePlan.test.ts lib/providers/voice/types.ts lib/providers/voice/registry.ts lib/providers/voice/registry.test.ts docs/superpowers/plans/2026-06-23-repo-video-motion-first-slice.md docs/specs/2026-06-23-repo-video-system/README.md docs/specs/2026-06-23-repo-video-system/implementation-notes.md
git commit -m "feat: plan motion voiceover handoffs"
```

## Task 19: Voice Result Application

**Files:**
- Create: `lib/motion/voiceApply.ts`
- Create: `lib/motion/voiceApply.test.ts`
- Modify: `lib/motion/project.ts`
- Modify: `docs/specs/2026-06-23-repo-video-system/README.md`
- Modify: `docs/specs/2026-06-23-repo-video-system/implementation-notes.md`

- [x] **Step 1: Write failing voice-application test**

The test covers:

- completed voice synthesis receipts -> audio asset on the voice clip;
- word-timing and transcript receipts -> caption clip props for sync;
- provider/provenance receipts -> completed voice graph node;
- untouched voice clips stay planned.

- [x] **Step 2: Run the failing test**

Run: `./node_modules/.bin/vitest run lib/motion/voiceApply.test.ts`

Expected: FAIL because `lib/motion/voiceApply.ts` does not exist.

- [x] **Step 3: Implement voice result application**

`lib/motion/voiceApply.ts` now applies provider-neutral `VoiceSynthesisResult`
objects to `MotionProject` records. Audio receipts update the target voice clip,
word-timing and transcript receipts update the matching caption clip, and the
voice graph node is completed with provider id, output refs, and typed
provenance.

- [x] **Step 4: Run focused test and typecheck**

Run:

```bash
./node_modules/.bin/vitest run lib/motion/voiceApply.test.ts
npm run typecheck
```

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add lib/motion/voiceApply.ts lib/motion/voiceApply.test.ts lib/motion/project.ts docs/superpowers/plans/2026-06-23-repo-video-motion-first-slice.md docs/specs/2026-06-23-repo-video-system/README.md docs/specs/2026-06-23-repo-video-system/implementation-notes.md
git commit -m "feat: apply motion voiceover results"
```

## Task 20: Render Result Application

**Files:**
- Create: `lib/motion/renderApply.ts`
- Create: `lib/motion/renderApply.test.ts`
- Modify: `lib/motion/project.ts`
- Modify: `docs/specs/2026-06-23-repo-video-system/README.md`
- Modify: `docs/specs/2026-06-23-repo-video-system/implementation-notes.md`

- [x] **Step 1: Write failing render-application tests**

The tests cover:

- completed render receipts -> ready export asset refs for video, poster,
  subtitles, transcript, and manifest;
- partial render results leave unrelated export targets planned;
- provider/provenance receipts -> completed render graph node;
- separately completed export targets merge into the same render graph node.

- [x] **Step 2: Run the failing test**

Run: `./node_modules/.bin/vitest run lib/motion/renderApply.test.ts`

Expected: FAIL because `lib/motion/renderApply.ts` does not exist.

- [x] **Step 3: Implement render result application**

`lib/motion/renderApply.ts` now applies provider-neutral `MotionRenderResult`
objects to `MotionProject` records. Rendered MP4, poster, subtitle, transcript,
and manifest receipts update the matching export target, while render graph
output refs and provenance merge across separate export completions.

- [x] **Step 4: Run focused test and typecheck**

Run:

```bash
./node_modules/.bin/vitest run lib/motion/renderApply.test.ts
npm run typecheck
```

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add lib/motion/renderApply.ts lib/motion/renderApply.test.ts lib/motion/project.ts docs/superpowers/plans/2026-06-23-repo-video-motion-first-slice.md docs/specs/2026-06-23-repo-video-system/README.md docs/specs/2026-06-23-repo-video-system/implementation-notes.md
git commit -m "feat: apply motion render results"
```

## Task 21: Runner-Backed Render Providers

**Files:**
- Create: `lib/providers/video/local-render.ts`
- Create: `lib/providers/video/local-render.test.ts`
- Modify: `docs/specs/2026-06-23-repo-video-system/README.md`
- Modify: `docs/specs/2026-06-23-repo-video-system/implementation-notes.md`

- [x] **Step 1: Write failing render-provider tests**

The tests cover:

- Remotion provider factories fail closed when no runner is configured;
- runner receipts are normalized against planned render outputs;
- wrong-engine requests are rejected;
- unplanned runner outputs are rejected;
- HyperFrames provider factories use the same opt-in runner boundary.

- [x] **Step 2: Run the failing test**

Run: `./node_modules/.bin/vitest run lib/providers/video/local-render.test.ts`

Expected: FAIL because `lib/providers/video/local-render.ts` does not exist.

- [x] **Step 3: Implement runner-backed providers**

`lib/providers/video/local-render.ts` now exposes a generic runner-backed
motion render provider plus explicit `remotion-local` and `hyperframes-local`
factory helpers. The provider calls an injected runner, maps returned files
back to the planned render outputs, preserves typed provenance, and does not
register itself as a default renderer.

- [x] **Step 4: Run focused test and typecheck**

Run:

```bash
./node_modules/.bin/vitest run lib/providers/video/local-render.test.ts
npm run typecheck
```

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add lib/providers/video/local-render.ts lib/providers/video/local-render.test.ts docs/superpowers/plans/2026-06-23-repo-video-motion-first-slice.md docs/specs/2026-06-23-repo-video-system/README.md docs/specs/2026-06-23-repo-video-system/implementation-notes.md
git commit -m "feat: add runner backed motion render providers"
```

## Task 22: Render Execution Orchestration

**Files:**
- Create: `lib/motion/renderExecution.ts`
- Create: `lib/motion/renderExecution.test.ts`
- Modify: `docs/specs/2026-06-23-repo-video-system/README.md`
- Modify: `docs/specs/2026-06-23-repo-video-system/implementation-notes.md`

- [x] **Step 1: Write failing render-execution tests**

The tests cover:

- materialized timelines becoming provider-ready `MotionRenderRequest` objects;
- selected providers receiving complete track and output data;
- render receipts being applied back into ready export assets;
- planned render graph nodes surviving into the completed render graph;
- missing timeline inputs returning blockers without calling the provider.

- [x] **Step 2: Run the failing test**

Run: `./node_modules/.bin/vitest run lib/motion/renderExecution.test.ts`

Expected: FAIL because `lib/motion/renderExecution.ts` does not exist.

- [x] **Step 3: Implement render execution orchestration**

`lib/motion/renderExecution.ts` now builds a render plan, returns reviewable
timeline blockers when the project is not ready, converts ready plans into
provider requests, calls the selected render provider, stores the planned render
node, and applies returned render receipts back to the editable motion project.

- [x] **Step 4: Run focused test and typecheck**

Run:

```bash
./node_modules/.bin/vitest run lib/motion/renderExecution.test.ts
npm run typecheck
```

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add lib/motion/renderExecution.ts lib/motion/renderExecution.test.ts docs/superpowers/plans/2026-06-23-repo-video-motion-first-slice.md docs/specs/2026-06-23-repo-video-system/README.md docs/specs/2026-06-23-repo-video-system/implementation-notes.md
git commit -m "feat: orchestrate motion render execution"
```

## Task 23: Remotion and HyperFrames Command Render Runners

**Files:**
- Create: `lib/providers/video/command-render.ts`
- Create: `lib/providers/video/command-render.test.ts`
- Modify: `docs/specs/2026-06-23-repo-video-system/README.md`
- Modify: `docs/specs/2026-06-23-repo-video-system/implementation-notes.md`

- [x] **Step 1: Write failing command-runner tests**

The tests cover:

- Remotion video and poster command formation from a `MotionRenderRequest`;
- HyperFrames video and snapshot command formation from the same request shape;
- VTT, transcript, manifest, and Remotion props sidecar writing;
- file-backed receipt URLs and provider provenance;
- failure when the engine command does not produce a planned artifact.

- [x] **Step 2: Run the failing test**

Run: `./node_modules/.bin/vitest run lib/providers/video/command-render.test.ts`

Expected: FAIL because `lib/providers/video/command-render.ts` does not exist.

- [x] **Step 3: Implement command render runners**

`lib/providers/video/command-render.ts` now exposes Remotion and HyperFrames
command runners under the existing runner-backed provider boundary. The runners
execute injected commands, write planned text sidecars, verify every planned
output file, and return `MotionRenderRunnerResult` receipts with file URLs.

- [x] **Step 4: Run focused test and typecheck**

Run:

```bash
./node_modules/.bin/vitest run lib/providers/video/command-render.test.ts
npm run typecheck
```

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add lib/providers/video/command-render.ts lib/providers/video/command-render.test.ts docs/superpowers/plans/2026-06-23-repo-video-motion-first-slice.md docs/specs/2026-06-23-repo-video-system/README.md docs/specs/2026-06-23-repo-video-system/implementation-notes.md
git commit -m "feat: add motion command render runners"
```

## Task 24: Image-to-Video Clip Planning and Registry

**Files:**
- Create: `lib/motion/imageToVideoPlan.ts`
- Create: `lib/motion/imageToVideoPlan.test.ts`
- Create: `lib/providers/video/generation-registry.ts`
- Create: `lib/providers/video/generation-registry.test.ts`
- Modify: `lib/providers/video/types.ts`
- Modify: `docs/specs/2026-06-23-repo-video-system/README.md`
- Modify: `docs/specs/2026-06-23-repo-video-system/implementation-notes.md`

- [x] **Step 1: Write failing image-to-video plan and registry tests**

The tests cover:

- capture-backed visual clips becoming provider-neutral image-to-video requests;
- request prompts preserving product context and crisp UI constraints;
- missing source visuals returning reviewable blockers instead of invented clips;
- missing timelines returning a timeline blocker;
- opt-in image-to-video provider registry behavior with no default model.

- [x] **Step 2: Run the failing tests**

Run:

```bash
./node_modules/.bin/vitest run lib/motion/imageToVideoPlan.test.ts lib/providers/video/generation-registry.test.ts
```

Expected: FAIL because `imageToVideoPlan.ts` and `generation-registry.ts` do
not exist.

- [x] **Step 3: Implement image-to-video plan and registry**

`lib/motion/imageToVideoPlan.ts` now creates per-clip image-to-video requests
only for visual timeline clips with source assets, produces a planned
`image-to-video` graph node, and exposes reviewable blockers when timeline or
visual sources are missing. `lib/providers/video/types.ts` and
`generation-registry.ts` define the provider contract and opt-in registry.

- [x] **Step 4: Run focused tests and typecheck**

Run:

```bash
./node_modules/.bin/vitest run lib/motion/imageToVideoPlan.test.ts lib/providers/video/generation-registry.test.ts
npm run typecheck
```

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add lib/motion/imageToVideoPlan.ts lib/motion/imageToVideoPlan.test.ts lib/providers/video/generation-registry.ts lib/providers/video/generation-registry.test.ts lib/providers/video/types.ts docs/superpowers/plans/2026-06-23-repo-video-motion-first-slice.md docs/specs/2026-06-23-repo-video-system/README.md docs/specs/2026-06-23-repo-video-system/implementation-notes.md
git commit -m "feat: plan motion image to video clips"
```

## Task 25: Image-to-Video Result Application

**Files:**
- Create: `lib/motion/imageToVideoApply.ts`
- Create: `lib/motion/imageToVideoApply.test.ts`
- Modify: `lib/motion/project.ts`
- Modify: `docs/specs/2026-06-23-repo-video-system/README.md`
- Modify: `docs/specs/2026-06-23-repo-video-system/implementation-notes.md`

- [x] **Step 1: Write failing image-to-video apply tests**

The tests cover:

- completed provider artifacts updating the matching visual timeline clips;
- draft clips receiving the same generated clip props for creator review;
- original source visual refs staying available after generated video replaces
  the editable clip asset;
- unrelated clips remaining untouched;
- image-to-video graph nodes completing with provider and artifact provenance;
- application still creating a completed graph node when a planned node is
  missing.

- [x] **Step 2: Run the failing test**

Run:

```bash
./node_modules/.bin/vitest run lib/motion/imageToVideoApply.test.ts
```

Expected: FAIL because `imageToVideoApply.ts` does not exist.

- [x] **Step 3: Implement image-to-video result application**

`lib/motion/imageToVideoApply.ts` now maps provider result artifacts by
`clipId`, updates matching timeline and draft clips with generated video asset
refs, source visual refs, dimensions, MIME type, duration, provider id, and
ready status, and completes or creates the `image-to-video` graph node with
merged input, output, and provenance refs. `lib/motion/project.ts` now allows
`image-to-video` provenance refs.

- [x] **Step 4: Run focused tests and typecheck**

Run:

```bash
./node_modules/.bin/vitest run lib/motion/imageToVideoApply.test.ts
npm run typecheck
```

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add lib/motion/imageToVideoApply.ts lib/motion/imageToVideoApply.test.ts lib/motion/project.ts docs/superpowers/plans/2026-06-23-repo-video-motion-first-slice.md docs/specs/2026-06-23-repo-video-system/README.md docs/specs/2026-06-23-repo-video-system/implementation-notes.md
git commit -m "feat: apply motion image to video results"
```

## Task 26: Render Source Compilation

**Files:**
- Create: `lib/motion/renderSource.ts`
- Create: `lib/motion/renderSource.test.ts`
- Modify: `lib/providers/video/types.ts`
- Modify: `lib/providers/video/command-render.ts`
- Modify: `lib/providers/video/command-render.test.ts`
- Modify: `lib/motion/renderExecution.ts`
- Modify: `lib/motion/renderExecution.test.ts`
- Modify: `docs/specs/2026-06-23-repo-video-system/README.md`
- Modify: `docs/specs/2026-06-23-repo-video-system/implementation-notes.md`

- [x] **Step 1: Write failing source compilation and runner tests**

The tests cover:

- editable motion timelines compiling into Remotion entry TSX with
  `Composition`, `Sequence`, `Img`, `Video`, `Audio`, source defaults, brand
  tokens, dimensions, duration, and render provenance;
- the same render request compiling into HyperFrames `index.html` with
  `data-composition-id`, timed clips, media refs, GSAP timeline registration,
  and source manifests;
- command render runners writing generated source files before invoking
  Remotion or HyperFrames commands;
- render execution attaching source files to the provider request instead of
  assuming an external engine project already exists.

- [x] **Step 2: Run the failing tests**

Run:

```bash
./node_modules/.bin/vitest run lib/motion/renderSource.test.ts lib/motion/renderExecution.test.ts lib/providers/video/command-render.test.ts
npm run typecheck
```

Expected: FAIL because `renderSource.ts` and `sourceFiles` request support do
not exist.

- [x] **Step 3: Implement render source compilation**

`lib/motion/renderSource.ts` now builds provider-neutral source bundles from a
`MotionRenderRequest`: Remotion entry TSX, HyperFrames `index.html`, source
manifests, entry-point metadata, and render provenance. Render execution
attaches those files to each provider request, and command runners write any
request source files before writing props, sidecars, and engine outputs.

- [x] **Step 4: Run focused tests and typecheck**

Run:

```bash
./node_modules/.bin/vitest run lib/motion/renderSource.test.ts lib/motion/renderExecution.test.ts lib/providers/video/command-render.test.ts
npm run typecheck
```

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add lib/motion/renderSource.ts lib/motion/renderSource.test.ts lib/providers/video/types.ts lib/providers/video/command-render.ts lib/providers/video/command-render.test.ts lib/motion/renderExecution.ts lib/motion/renderExecution.test.ts docs/superpowers/plans/2026-06-23-repo-video-motion-first-slice.md docs/specs/2026-06-23-repo-video-system/README.md docs/specs/2026-06-23-repo-video-system/implementation-notes.md
git commit -m "feat: compile motion render source files"
```

## Task 27: Component-Aware Render Source Adapters

**Files:**
- Modify: `lib/motion/renderSource.ts`
- Modify: `lib/motion/renderSource.test.ts`
- Modify: `docs/specs/2026-06-23-repo-video-system/README.md`
- Modify: `docs/specs/2026-06-23-repo-video-system/implementation-notes.md`

- [x] **Step 1: Write failing component-source tests**

The tests cover:

- Remotion source exporting named reusable renderers for hook cards,
  app frames, agent traces, captions, and soft-wipe transitions;
- Remotion source preserving `data-component-id` on rendered clips;
- source manifests listing component ids and reusable effect tokens;
- HyperFrames source preserving `data-component-id`, component classes,
  app-frame chrome, hook card typography slots, caption text slots, and
  component-specific GSAP entrances.

- [x] **Step 2: Run the failing tests**

Run:

```bash
./node_modules/.bin/vitest run lib/motion/renderSource.test.ts
npm run typecheck
```

Expected: FAIL because the source compiler still emits mostly generic clip
cards without component renderer functions or effect-token metadata.

- [x] **Step 3: Implement component-aware render adapters**

`lib/motion/renderSource.ts` now maps existing motion `componentId` values into
named Remotion render functions, HyperFrames `data-component-id` classes, and
source-manifest effect tokens. The emitted source keeps timeline timing stable
while giving agents a reusable component/effect surface for scoped
regeneration.

- [x] **Step 4: Run focused tests and typecheck**

Run:

```bash
./node_modules/.bin/vitest run lib/motion/renderSource.test.ts
npm run typecheck
```

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add lib/motion/renderSource.ts lib/motion/renderSource.test.ts docs/superpowers/plans/2026-06-23-repo-video-motion-first-slice.md docs/specs/2026-06-23-repo-video-system/README.md docs/specs/2026-06-23-repo-video-system/implementation-notes.md
git commit -m "feat: add component aware motion source adapters"
```

## Task 28: Structured Timeline Revisions

**Files:**
- Create: `lib/motion/revise.ts`
- Create: `lib/motion/revise.test.ts`
- Modify: `lib/motion/project.ts`
- Modify: `docs/specs/2026-06-23-repo-video-system/README.md`
- Modify: `docs/specs/2026-06-23-repo-video-system/implementation-notes.md`

- [x] **Step 1: Write failing timeline revision tests**

The tests cover:

- story narration edits applying to the editable project and current draft;
- clip prop edits and timing changes applying to project and draft timelines;
- component replacement validating against the motion component registry;
- unsafe retiming being rejected before mutation when a clip would overlap;
- revision graph nodes recording input/output refs and manual provenance.

- [x] **Step 2: Run the failing test**

Run:

```bash
./node_modules/.bin/vitest run lib/motion/revise.test.ts
```

Expected: FAIL because `revise.ts` does not exist.

- [x] **Step 3: Implement structured revisions**

`lib/motion/revise.ts` now applies structured revision operations for story
copy, clip props, retiming, and component replacement. The implementation keeps
the project timeline and draft timeline in sync, rejects unknown components or
overlapping retimes, and records a `revision` graph node with manual/revision
provenance. This backs review-mode tweaks and the future `motion-revise` tool so
an agent can regenerate or adjust one component without rewriting the whole
video plan.

- [x] **Step 4: Run focused tests and typecheck**

Run:

```bash
./node_modules/.bin/vitest run lib/motion/revise.test.ts
npm run typecheck
```

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add lib/motion/revise.ts lib/motion/revise.test.ts lib/motion/project.ts docs/superpowers/plans/2026-06-23-repo-video-motion-first-slice.md docs/specs/2026-06-23-repo-video-system/README.md docs/specs/2026-06-23-repo-video-system/implementation-notes.md
git commit -m "feat: add structured motion timeline revisions"
```

## Task 29: PR-to-Video Starts

**Files:**
- Create: `lib/motion/prMotion.ts`
- Create: `lib/motion/prMotion.test.ts`
- Modify: `lib/motion/start.ts`
- Modify: `lib/motion/start.test.ts`
- Modify: `lib/workflow/registry.ts`
- Modify: `lib/motion/workflowPlan.test.ts`
- Modify: `lib/motion/workflowRouter.test.ts`
- Modify: `tests/unit/capability-registry.test.ts`
- Modify: `docs/specs/2026-06-23-repo-video-system/README.md`
- Modify: `docs/specs/2026-06-23-repo-video-system/implementation-notes.md`

- [x] **Step 1: Write failing PR start tests**

The tests cover:

- a GitHub PR URL plus an injected `CodeChangeProvider` producing an editable
  `MotionProject` with PR story beats, timeline tracks, graph provenance, and
  repo-derived app profile facts;
- `owner/repo#number` shorthand working for agent-native PR inputs;
- `startAgentMotionWorkflow` routing PR sources into a ready PR-to-video
  project when code-change evidence can be collected;
- unavailable providers falling back to a reviewable `needs-evidence` request
  without fetching unrelated repo facts.

- [x] **Step 2: Run the failing tests**

Run:

```bash
./node_modules/.bin/vitest run lib/motion/prMotion.test.ts lib/motion/start.test.ts
npm run typecheck
```

Expected: FAIL because `prMotion.ts` does not exist and PR starts still stop at
`needs-evidence`.

- [x] **Step 3: Implement PR motion starts**

`lib/motion/prMotion.ts` now parses GitHub PR URLs and `owner/repo#number`
refs, ingests code-change evidence through a configured provider, derives the
app profile from repo facts when needed, and builds/materializes the PR
explainer `MotionProject`. `startAgentMotionWorkflow` now uses that builder for
PR starts, while preserving the existing `needs-evidence` fallback if no
code-change provider is available.

- [x] **Step 4: Keep PR workflow editable and narrated**

The `pr-to-video` workflow now includes `motion-voice` and `motion-revise`
beside brief, storyboard, sync, and render. Its gates include voice and
timeline review, but still omit capture because PR videos source evidence from
code-change receipts rather than product recordings.

- [x] **Step 5: Run focused tests and typecheck**

Run:

```bash
./node_modules/.bin/vitest run lib/motion/prMotion.test.ts lib/motion/start.test.ts lib/motion/workflowPlan.test.ts lib/motion/workflowRouter.test.ts
./node_modules/.bin/vitest run tests/unit/capability-registry.test.ts --pool=forks
npm run typecheck
```

Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add lib/motion/prMotion.ts lib/motion/prMotion.test.ts lib/motion/start.ts lib/motion/start.test.ts lib/workflow/registry.ts lib/motion/workflowPlan.test.ts lib/motion/workflowRouter.test.ts tests/unit/capability-registry.test.ts docs/superpowers/plans/2026-06-23-repo-video-motion-first-slice.md docs/specs/2026-06-23-repo-video-system/README.md docs/specs/2026-06-23-repo-video-system/implementation-notes.md
git commit -m "feat: start pr motion projects from code change evidence"
```

## Task 30: Local Repo Motion Starts

**Files:**
- Create: `lib/research/local-repo-facts.ts`
- Create: `lib/research/local-repo-facts.test.ts`
- Create: `lib/motion/localRepoMotion.ts`
- Create: `lib/motion/localRepoMotion.test.ts`
- Modify: `lib/motion/start.ts`
- Modify: `lib/motion/start.test.ts`
- Modify: `docs/specs/2026-06-23-repo-video-system/README.md`
- Modify: `docs/specs/2026-06-23-repo-video-system/implementation-notes.md`

- [x] **Step 1: Write failing local repo tests**

The tests cover:

- extracting app profile facts from a local filesystem repo without network
  access;
- building an editable repo-launch `MotionProject` from a local path;
- routing a `sourceRefs.kind = repo` local path through
  `startAgentMotionWorkflow` without calling the GitHub repo fetcher.

- [x] **Step 2: Implement local repo fact extraction**

`lib/research/local-repo-facts.ts` now normalizes absolute, relative, `~/`, and
`file://` repo refs, reads package and README signals, walks source files while
ignoring generated dependency/build folders, and emits sourced claims,
languages, stack highlights, dependencies, and scripts.

- [x] **Step 3: Implement local repo motion starts**

`lib/motion/localRepoMotion.ts` reuses the existing repo launch motion builder
with local facts, so local apps like aether, Tong, Paillette, or Accrue can
start from the same editable story beats, timeline tracks, graph nodes,
review-plan slots, and full-auto gates as GitHub repo URLs.

- [x] **Step 4: Wire the agent workflow starter**

`startAgentMotionWorkflow` now detects local repo refs before URL fetch,
dynamically loads the local repo builder, and preserves the provider-agnostic
repo URL path for provenance and review output.

- [x] **Step 5: Run focused tests and typecheck**

Run:

```bash
./node_modules/.bin/vitest run lib/research/local-repo-facts.test.ts lib/motion/localRepoMotion.test.ts lib/motion/start.test.ts
npm run typecheck
```

Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add lib/research/local-repo-facts.ts lib/research/local-repo-facts.test.ts lib/motion/localRepoMotion.ts lib/motion/localRepoMotion.test.ts lib/motion/start.ts lib/motion/start.test.ts docs/superpowers/plans/2026-06-23-repo-video-motion-first-slice.md docs/specs/2026-06-23-repo-video-system/README.md docs/specs/2026-06-23-repo-video-system/implementation-notes.md
git commit -m "feat: start motion projects from local repos"
```

## Task 31: Motion Preview Plan Artifact

**Files:**
- Create: `lib/motion/previewPlan.ts`
- Create: `lib/motion/previewPlan.test.ts`
- Modify: `lib/motion/start.ts`
- Modify: `lib/motion/start.test.ts`
- Modify: `docs/specs/2026-06-23-repo-video-system/README.md`
- Modify: `docs/specs/2026-06-23-repo-video-system/implementation-notes.md`

- [x] **Step 1: Write failing preview/start tests**

The tests cover:

- a creator-facing preview plan that shows storyboard beats, draft variations,
  editable timeline rows, and regeneration actions;
- Remotion and HyperFrames source readiness summarized as entry/manifest file
  descriptors without exposing raw source code in the preview artifact;
- provider-backed generation showing an explicit adapter-required blocker;
- ready `startAgentMotionWorkflow` results returning the preview plan beside
  the existing review plan.

- [x] **Step 2: Implement the preview plan builder**

`lib/motion/previewPlan.ts` now builds a `MotionPreviewPlan` from an editable
`MotionProject`: it reuses the review-plan data, summarizes timeline clips with
component labels and edit/regenerate controls, creates per-scope regeneration
action options, and builds render-source descriptors for Remotion and
HyperFrames through the existing render-plan/source-bundle pipeline.

- [x] **Step 3: Wire preview plans into workflow starts**

`startAgentMotionWorkflow` now returns `previewPlan` for ready projects, using
the routed workflow's engine list so review mode and full-auto starts can show
the same storyboard, drafts, timeline, and render-readiness artifact.

- [x] **Step 4: Run focused tests and typecheck**

Run:

```bash
./node_modules/.bin/vitest run lib/motion/previewPlan.test.ts lib/motion/start.test.ts
npm run typecheck
```

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add lib/motion/previewPlan.ts lib/motion/previewPlan.test.ts lib/motion/start.ts lib/motion/start.test.ts docs/superpowers/plans/2026-06-23-repo-video-motion-first-slice.md docs/specs/2026-06-23-repo-video-system/README.md docs/specs/2026-06-23-repo-video-system/implementation-notes.md
git commit -m "feat: add motion preview plans"
```

## Task 32: Timeline Lens Preview Review

**Files:**
- Modify: `components/workspace/TimelineLens.tsx`
- Modify: `tests/component/timeline-lens.test.tsx`
- Modify: `docs/specs/2026-06-23-repo-video-system/README.md`
- Modify: `docs/specs/2026-06-23-repo-video-system/implementation-notes.md`

- [x] **Step 1: Write failing timeline preview tests**

The tests cover:

- rendering a `MotionPreviewPlan` in the timeline lens with title, platform,
  draft choices, storyboard copy, editable component controls, regeneration
  actions, timeline rows, and engine readiness;
- preserving the original track-only timeline behavior;
- avoiding raw beat ids, clip ids, source refs, and provenance refs in the
  primary creator-facing surface;
- exposing callbacks for draft selection and scoped component regeneration.

- [x] **Step 2: Implement preview-plan rendering in the lens**

`components/workspace/TimelineLens.tsx` now accepts an optional
`previewPlan`. When present, the lens renders the video plan as a reviewable
workspace surface: summary chips, draft buttons, engine status rows, storyboard
beats, editable component controls, timeline clips, and regeneration buttons.
The existing `tracks` path still renders simple timeline tracks when no preview
plan is available.

- [x] **Step 3: Run focused tests and typecheck**

Run:

```bash
./node_modules/.bin/vitest run tests/component/timeline-lens.test.tsx
npm run typecheck
```

Expected: PASS.

- [x] **Step 4: Commit**

```bash
git add components/workspace/TimelineLens.tsx tests/component/timeline-lens.test.tsx docs/superpowers/plans/2026-06-23-repo-video-motion-first-slice.md docs/specs/2026-06-23-repo-video-system/README.md docs/specs/2026-06-23-repo-video-system/implementation-notes.md
git commit -m "feat: show motion preview plans in timeline lens"
```

## Task 33: Motion Start API Boundary

**Files:**
- Create: `app/api/motion/start/route.ts`
- Create: `tests/unit/api-motion-start.test.ts`
- Modify: `docs/specs/2026-06-23-repo-video-system/README.md`
- Modify: `docs/specs/2026-06-23-repo-video-system/implementation-notes.md`

- [x] **Step 1: Write failing API contract tests**

The tests cover:

- starting an editable launch motion project from a local repo path through
  `POST /api/motion/start`;
- returning the routed workflow, project, review plan, preview plan, and capture
  input blocker for repo-only starts;
- accepting explicit `sourceRefs` for PR starts and returning the reviewable
  code-change evidence request when no provider is configured;
- rejecting missing source input and malformed JSON.

- [x] **Step 2: Implement the route**

`app/api/motion/start/route.ts` now normalizes direct `sourceRefs` plus
`repoPath`, `repoUrl`, `siteUrl`, and `prRef` shorthands into the existing
`startAgentMotionWorkflow` entry point. The route keeps provider selection
abstract, defaults to review mode and a vertical X target when omitted, and
passes local repo scanning options without hardcoding a model or render engine.

- [x] **Step 3: Run focused tests and typecheck**

Run:

```bash
./node_modules/.bin/vitest run tests/unit/api-motion-start.test.ts
npm run typecheck
```

Expected: PASS.

- [x] **Step 4: Commit**

```bash
git add app/api/motion/start/route.ts tests/unit/api-motion-start.test.ts docs/superpowers/plans/2026-06-23-repo-video-motion-first-slice.md docs/specs/2026-06-23-repo-video-system/README.md docs/specs/2026-06-23-repo-video-system/implementation-notes.md
git commit -m "feat: expose motion workflow starts via api"
```

## Task 34: Motion Revise API Boundary

**Files:**
- Create: `app/api/motion/revise/route.ts`
- Create: `tests/unit/api-motion-revise.test.ts`
- Modify: `docs/specs/2026-06-23-repo-video-system/README.md`
- Modify: `docs/specs/2026-06-23-repo-video-system/implementation-notes.md`

- [x] **Step 1: Write failing API contract tests**

The tests cover:

- applying story-copy and component-prop edits through `POST /api/motion/revise`;
- returning the updated editable project, review plan, preview plan, capture
  status, and revision provenance;
- rejecting unsafe overlapping timing edits from the shared revision validator;
- rejecting missing projects and malformed JSON.

- [x] **Step 2: Implement the route**

`app/api/motion/revise/route.ts` now parses scoped story, clip-prop, retime,
and component-replacement operations, applies them through
`applyMotionTimelineRevision`, and returns refreshed review/preview/capture
artifacts so an agent can show a revised draft or keep running in full-auto
mode without bypassing the editable project model.

- [x] **Step 3: Run focused tests and typecheck**

Run:

```bash
./node_modules/.bin/vitest run tests/unit/api-motion-revise.test.ts
npm run typecheck
```

Expected: PASS.

- [x] **Step 4: Commit**

```bash
git add app/api/motion/revise/route.ts tests/unit/api-motion-revise.test.ts docs/superpowers/plans/2026-06-23-repo-video-motion-first-slice.md docs/specs/2026-06-23-repo-video-system/README.md docs/specs/2026-06-23-repo-video-system/implementation-notes.md
git commit -m "feat: expose motion revisions via api"
```

## Task 35: Motion Render API Boundary

**Files:**
- Modify: `lib/motion/renderExecution.ts`
- Create: `app/api/motion/render/route.ts`
- Create: `tests/unit/api-motion-render.test.ts`
- Modify: `docs/specs/2026-06-23-repo-video-system/README.md`
- Modify: `docs/specs/2026-06-23-repo-video-system/implementation-notes.md`

- [x] **Step 1: Write failing API contract tests**

The tests cover:

- returning a provider-required Remotion handoff with source files and expected
  MP4/poster/subtitle/transcript/manifest outputs when no renderer is
  configured;
- executing an explicitly registered render provider and applying returned
  receipts to editable export slots;
- returning timeline blockers before provider resolution when a project has no
  materialized timeline;
- rejecting missing projects, unsupported engines, and malformed JSON.

- [x] **Step 2: Expose render requests for API handoff**

`lib/motion/renderExecution.ts` now exports `buildMotionRenderRequest`, keeping
source bundle generation shared between render execution and the API's
provider-required handoff response.

- [x] **Step 3: Implement the route**

`app/api/motion/render/route.ts` now accepts editable motion projects plus
Remotion/HyperFrames render options, returns reviewable blockers when timeline
or provider configuration is missing, lists configured render providers, and
calls `executeMotionRender` only after resolving an opt-in provider.

- [x] **Step 4: Run focused tests and typecheck**

Run:

```bash
./node_modules/.bin/vitest run tests/unit/api-motion-render.test.ts lib/motion/renderExecution.test.ts
npm run typecheck
```

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add app/api/motion/render/route.ts tests/unit/api-motion-render.test.ts lib/motion/renderExecution.ts docs/superpowers/plans/2026-06-23-repo-video-motion-first-slice.md docs/specs/2026-06-23-repo-video-system/README.md docs/specs/2026-06-23-repo-video-system/implementation-notes.md
git commit -m "feat: expose motion render handoffs via api"
```

## Task 36: Motion Capture API Boundary

**Files:**
- Create: `app/api/motion/capture/route.ts`
- Create: `tests/unit/api-motion-capture.test.ts`
- Modify: `docs/specs/2026-06-23-repo-video-system/README.md`
- Modify: `docs/specs/2026-06-23-repo-video-system/implementation-notes.md`

- [x] **Step 1: Write failing API contract tests**

The tests cover:

- returning provider-required capture handoffs with screenshot/DOM requests and
  computer-use fallback guidance when no capture provider is configured;
- executing selected capture requests through an explicitly registered provider;
- applying screenshot receipts to demo beats and `app-frame` timeline clips
  while preserving DOM receipts in the capture graph node;
- returning source blockers before provider resolution for repo-only starts;
- rejecting missing projects, unknown request ids, and malformed JSON.

- [x] **Step 2: Implement the route**

`app/api/motion/capture/route.ts` now accepts editable motion projects plus
selected capture request ids, builds the existing agent capture plan, returns
reviewable blockers/provider requirements when capture cannot execute, and
applies merged capture receipts back into the project when an opt-in provider is
available.

- [x] **Step 3: Run focused tests and typecheck**

Run:

```bash
./node_modules/.bin/vitest run tests/unit/api-motion-capture.test.ts lib/motion/capturePlan.test.ts lib/motion/captureApply.test.ts lib/providers/capture/registry.test.ts
npm run typecheck
```

Expected: PASS.

- [x] **Step 4: Commit**

```bash
git add app/api/motion/capture/route.ts tests/unit/api-motion-capture.test.ts docs/superpowers/plans/2026-06-23-repo-video-motion-first-slice.md docs/specs/2026-06-23-repo-video-system/README.md docs/specs/2026-06-23-repo-video-system/implementation-notes.md
git commit -m "feat: expose motion capture handoffs via api"
```

## Task 37: Motion Voice API Boundary

**Files:**
- Create: `app/api/motion/voice/route.ts`
- Create: `tests/unit/api-motion-voice.test.ts`
- Modify: `docs/specs/2026-06-23-repo-video-system/README.md`
- Modify: `docs/specs/2026-06-23-repo-video-system/implementation-notes.md`

- [x] **Step 1: Write failing API contract tests**

The tests cover:

- returning provider-required voice handoffs with target timing and expected
  audio, word-timing, and transcript artifacts;
- executing selected voice requests through an explicitly registered provider;
- applying audio receipts to voice clips and word-timing/transcript receipts to
  matching caption clips;
- returning voice timeline blockers before provider resolution;
- rejecting missing projects, unknown voice request ids, and malformed JSON.

- [x] **Step 2: Implement the route**

`app/api/motion/voice/route.ts` now accepts editable motion projects plus
selected request ids or clip ids, builds provider-neutral voice plans, returns
reviewable blockers/provider requirements when synthesis cannot execute, and
applies provider receipts back into voice/caption timeline clips when an opt-in
provider is available.

- [x] **Step 3: Run focused tests and typecheck**

Run:

```bash
./node_modules/.bin/vitest run tests/unit/api-motion-voice.test.ts lib/motion/voicePlan.test.ts lib/motion/voiceApply.test.ts lib/providers/voice/registry.test.ts
npm run typecheck
```

Expected: PASS.

- [x] **Step 4: Commit**

```bash
git add app/api/motion/voice/route.ts tests/unit/api-motion-voice.test.ts docs/superpowers/plans/2026-06-23-repo-video-motion-first-slice.md docs/specs/2026-06-23-repo-video-system/README.md docs/specs/2026-06-23-repo-video-system/implementation-notes.md
git commit -m "feat: expose motion voice handoffs via api"
```

## Task 38: Motion Image-To-Video API Boundary

**Files:**
- Create: `app/api/motion/image-to-video/route.ts`
- Create: `tests/unit/api-motion-image-to-video.test.ts`
- Modify: `docs/specs/2026-06-23-repo-video-system/README.md`
- Modify: `docs/specs/2026-06-23-repo-video-system/implementation-notes.md`

- [x] **Step 1: Write failing API contract tests**

The tests cover:

- returning provider-required generation handoffs with source asset ids,
  prompts, expected video outputs, and next review state;
- executing selected generation requests through an explicitly registered
  provider;
- applying generated video receipts back into the source timeline clip while
  preserving the source visual asset id;
- returning timeline or visual-source blockers before provider resolution;
- rejecting missing projects, unknown generation request ids, and malformed
  JSON.

- [x] **Step 2: Implement the route**

`app/api/motion/image-to-video/route.ts` now accepts editable motion projects
plus selected request ids or clip ids, builds provider-neutral image-to-video
plans, returns reviewable blockers/provider requirements when generation cannot
execute, and applies generated video receipts back into timeline clips when an
opt-in provider is available.

- [x] **Step 3: Run focused tests and typecheck**

Run:

```bash
./node_modules/.bin/vitest run tests/unit/api-motion-image-to-video.test.ts lib/motion/imageToVideoPlan.test.ts lib/motion/imageToVideoApply.test.ts lib/providers/video/generation-registry.test.ts
npm run typecheck
```

Expected: PASS.

- [x] **Step 4: Commit**

```bash
git add app/api/motion/image-to-video/route.ts tests/unit/api-motion-image-to-video.test.ts docs/superpowers/plans/2026-06-23-repo-video-motion-first-slice.md docs/specs/2026-06-23-repo-video-system/README.md docs/specs/2026-06-23-repo-video-system/implementation-notes.md
git commit -m "feat: expose image-to-video handoffs via api"
```

## Task 39: Workflow Skill Contracts

**Files:**
- Modify: `lib/workflow/registry.ts`
- Modify: `lib/motion/workflowPlan.ts`
- Modify: `tests/unit/capability-registry.test.ts`
- Modify: `lib/motion/workflowPlan.test.ts`
- Modify: `docs/specs/2026-06-23-repo-video-system/README.md`
- Modify: `docs/specs/2026-06-23-repo-video-system/implementation-notes.md`

- [x] **Step 1: Write failing workflow contract tests**

The tests cover:

- reusable video workflows advertising `review` and `full-auto` modes;
- review artifacts for video plan, draft variations, component plan, capture or
  sync plan, render proof, and export pack;
- scoped regeneration targets for story beats, components, captures, code proof,
  captions, voice lines, timing, effects, and explicit whole-video resets;
- verification artifacts for contact sheet, MP4 probe, poster, subtitles,
  transcript, and provenance manifest;
- the agent workflow plan returning the same contract so UI and agent callers do
  not need to inspect registry internals.

- [x] **Step 2: Implement the registry and planner contract**

`lib/workflow/registry.ts` now defines `WorkflowSkillContract` metadata and
attaches workflow-specific contracts to repo launch, feature/social,
website-to-video, PR-to-video, caption overlay, motion graphic, and
Remotion/HyperFrames port workflows. `lib/motion/workflowPlan.ts` returns that
contract on `AgentMotionWorkflowPlan`.

- [x] **Step 3: Run focused tests**

Run:

```bash
./node_modules/.bin/vitest run tests/unit/capability-registry.test.ts lib/motion/workflowPlan.test.ts
```

Expected: PASS.

- [x] **Step 4: Commit**

```bash
git add lib/workflow/registry.ts lib/motion/workflowPlan.ts tests/unit/capability-registry.test.ts lib/motion/workflowPlan.test.ts docs/superpowers/plans/2026-06-23-repo-video-motion-first-slice.md docs/specs/2026-06-23-repo-video-system/README.md docs/specs/2026-06-23-repo-video-system/implementation-notes.md
git commit -m "feat: describe motion workflow skill contracts"
```

## Task 40: Motion Workflow Discovery API

**Files:**
- Create: `app/api/motion/workflows/route.ts`
- Create: `tests/unit/api-motion-workflows.test.ts`
- Modify: `docs/specs/2026-06-23-repo-video-system/README.md`
- Modify: `docs/specs/2026-06-23-repo-video-system/implementation-notes.md`

- [x] **Step 1: Write failing workflow discovery tests**

The tests cover:

- listing reusable video workflow skills without returning non-video workflows;
- returning tool ids, source kinds, engine hints, review gates, accepted start
  shorthands, and workflow-skill contracts;
- filtering by source kind, render engine, and review/full-auto mode;
- rejecting unsupported discovery filters before returning workflow metadata.

- [x] **Step 2: Implement the discovery route**

`app/api/motion/workflows/route.ts` now exposes an agent-native GET endpoint for
motion workflow discovery. It returns video workflow skills from the registry,
keeps draft workflows visible for agents, supports stable start hints for
`repoPath`, `repoUrl`, `siteUrl`, `prRef`, and `sourceRefs`, and fails closed on
unsupported filters.

- [x] **Step 3: Run focused tests**

Run:

```bash
./node_modules/.bin/vitest run tests/unit/api-motion-workflows.test.ts
```

Expected: PASS.

- [x] **Step 4: Commit**

```bash
git add app/api/motion/workflows/route.ts tests/unit/api-motion-workflows.test.ts docs/superpowers/plans/2026-06-23-repo-video-motion-first-slice.md docs/specs/2026-06-23-repo-video-system/README.md docs/specs/2026-06-23-repo-video-system/implementation-notes.md
git commit -m "feat: expose motion workflow discovery"
```

## Task 41: Motion Component Regeneration API

**Files:**
- Create: `app/api/motion/regenerate/route.ts`
- Create: `tests/unit/api-motion-regenerate.test.ts`
- Modify: `docs/specs/2026-06-23-repo-video-system/README.md`
- Modify: `docs/specs/2026-06-23-repo-video-system/implementation-notes.md`

- [x] **Step 1: Write failing scoped regeneration tests**

The tests cover:

- creating a planned regeneration request from an editable motion project,
  selected clip id, regeneration scope, and prompt;
- returning refreshed review and preview plans so the timeline shell can show
  the same draft, component, and engine-readiness state after the request;
- preserving capture-plan context for capture-backed regeneration scopes;
- rejecting unsupported component scopes, missing project data, missing
  clip/scope/prompt fields, invalid engine filters, and malformed JSON.

- [x] **Step 2: Implement the regeneration route**

`app/api/motion/regenerate/route.ts` now wraps
`createMotionComponentRegenerationRequest` in an agent-native JSON boundary. It
does not claim a provider executed the change; it returns the planned request
and existing editable project state for the next capture, voice, image-to-video,
revision, or render handoff.

- [x] **Step 3: Run focused tests**

Run:

```bash
./node_modules/.bin/vitest run tests/unit/api-motion-regenerate.test.ts
```

Expected: PASS.

- [x] **Step 4: Commit**

```bash
git add app/api/motion/regenerate/route.ts tests/unit/api-motion-regenerate.test.ts docs/superpowers/plans/2026-06-23-repo-video-motion-first-slice.md docs/specs/2026-06-23-repo-video-system/README.md docs/specs/2026-06-23-repo-video-system/implementation-notes.md
git commit -m "feat: expose scoped motion regeneration"
```

## Task 42: Motion Sync Plan API

**Files:**
- Create: `lib/motion/syncPlan.ts`
- Create: `lib/motion/syncPlan.test.ts`
- Create: `app/api/motion/sync/route.ts`
- Create: `tests/unit/api-motion-sync.test.ts`
- Modify: `docs/specs/2026-06-23-repo-video-system/README.md`
- Modify: `docs/specs/2026-06-23-repo-video-system/implementation-notes.md`

- [x] **Step 1: Write failing sync plan tests**

The tests cover:

- timeline beat markers with story beat, text, caption, and voice clip refs;
- caption timing links that use timeline timing before voice receipts and
  word-timing artifacts after voice synthesis;
- transition cues and lightweight sound cues for effect/audio sync review;
- blockers and provider requirements until voice and word-timing receipts exist;
- timeline blockers before clips are materialized.

- [x] **Step 2: Implement the sync planner**

`lib/motion/syncPlan.ts` now turns editable timeline tracks into an
agent-readable sync plan with beat markers, caption/voice timing links,
transition cues, sound cues, provider requirements, blockers, and a planned sync
graph node.

- [x] **Step 3: Implement the sync API route**

`app/api/motion/sync/route.ts` now accepts an editable motion project and returns
the sync plan with refreshed review and preview plans. It validates JSON,
project presence, and requested preview engines.

- [x] **Step 4: Run focused tests and typecheck**

Run:

```bash
./node_modules/.bin/vitest run lib/motion/syncPlan.test.ts tests/unit/api-motion-sync.test.ts
npm run typecheck
```

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add lib/motion/syncPlan.ts lib/motion/syncPlan.test.ts app/api/motion/sync/route.ts tests/unit/api-motion-sync.test.ts docs/superpowers/plans/2026-06-23-repo-video-motion-first-slice.md docs/specs/2026-06-23-repo-video-system/README.md docs/specs/2026-06-23-repo-video-system/implementation-notes.md
git commit -m "feat: expose motion sync planning"
```

## Self-Review Checklist

- Spec coverage: The plan covers the first implementation slice from `README.md`, not the entire future product. Full video generation, real voice providers, engine dependency/project scaffolding, image-to-video provider execution, higher-fidelity visual component libraries, and multiformat export packs remain separate later slices.
- Empty-detail scan: The plan avoids vague fill-ins. File names, functions, test names, commands, and expected outcomes are explicit.
- Type consistency: `MotionProject`, `MotionBriefV2`, `StoryBeat`, `TimelineTrack`, `TimelineClip`, `VideoRenderProvider`, `CaptureProvider`, and registry ids are consistently named across tasks.
- aether contract: The timeline lens stays inside the synthesis shell, uses tool taxonomy, avoids raw provenance ids in primary UI, keeps provider selection abstract, and preserves the bottom composer pattern.

## Execution Options

Plan complete and saved to `docs/superpowers/plans/2026-06-23-repo-video-motion-first-slice.md`.

1. Subagent-Driven (recommended): dispatch a fresh subagent per task, review between tasks, fast iteration.
2. Inline Execution: execute tasks in this session using executing-plans, batch execution with checkpoints.
