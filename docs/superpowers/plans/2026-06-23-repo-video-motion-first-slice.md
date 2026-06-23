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

- [ ] **Step 5: Commit**

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

- [ ] **Step 5: Commit**

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

- [ ] **Step 5: Commit**

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

- [ ] **Step 5: Commit**

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

- [ ] **Step 5: Commit**

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

- [ ] **Step 5: Commit**

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

- [ ] **Step 6: Commit**

```bash
git add lib/motion/capturePlan.ts lib/motion/capturePlan.test.ts lib/motion/start.ts lib/motion/start.test.ts docs/superpowers/plans/2026-06-23-repo-video-motion-first-slice.md docs/specs/2026-06-23-repo-video-system/README.md docs/specs/2026-06-23-repo-video-system/implementation-notes.md
git commit -m "feat: plan agent motion captures"
```

## Self-Review Checklist

- Spec coverage: The plan covers the first implementation slice from `README.md`, not the entire future product. Full video generation, real voice providers, real Remotion rendering, image-to-video nodes, and multiformat export packs remain separate later slices.
- Empty-detail scan: The plan avoids vague fill-ins. File names, functions, test names, commands, and expected outcomes are explicit.
- Type consistency: `MotionProject`, `MotionBriefV2`, `StoryBeat`, `TimelineTrack`, `TimelineClip`, `VideoRenderProvider`, `CaptureProvider`, and registry ids are consistently named across tasks.
- aether contract: The timeline lens stays inside the synthesis shell, uses tool taxonomy, avoids raw provenance ids in primary UI, keeps provider selection abstract, and preserves the bottom composer pattern.

## Execution Options

Plan complete and saved to `docs/superpowers/plans/2026-06-23-repo-video-motion-first-slice.md`.

1. Subagent-Driven (recommended): dispatch a fresh subagent per task, review between tasks, fast iteration.
2. Inline Execution: execute tasks in this session using executing-plans, batch execution with checkpoints.
