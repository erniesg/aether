import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { MotionAgentExecutionHandoff } from './agentHandoff';
import type { MotionProject } from './project';
import {
  assertGoldenPathMotionProject,
  buildRepoVideoGoldenPathFixture,
} from './goldenPathFixtures';

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  while (cleanups.length > 0) {
    await cleanups.pop()?.();
  }
});

describe('repo video golden path fixtures', () => {
  it('builds a local repo source that can exercise review and full-auto gates', async () => {
    const fixture = await buildRepoVideoGoldenPathFixture({
      appName: 'tong',
      description: 'City-specific language learning app.',
      routeFiles: {
        'app/page.tsx': 'export default function Page() { return <main>Tong</main>; }',
      },
    });
    cleanups.push(fixture.cleanup);

    expect(fixture.repoPath).toMatch(/aether-motion-golden-path-/);
    await expect(access(join(fixture.repoPath, 'package.json'))).resolves.toBeUndefined();
    await expect(access(join(fixture.repoPath, 'README.md'))).resolves.toBeUndefined();
    await expect(access(join(fixture.repoPath, 'app', 'page.tsx'))).resolves.toBeUndefined();
    expect(fixture.startRequest).toMatchObject({
      id: 'motion-tong-golden-path',
      workspaceId: 'motion-golden-path',
      intent: 'launch',
      mode: 'full-auto',
      repoPath: fixture.repoPath,
      audience: 'builders and creators',
      tone: 'clear, visual, product-led',
      requestedEngines: ['remotion', 'hyperframes', 'provider'],
      platformTargets: [
        { platform: 'x', aspectRatio: '9:16', seconds: 30 },
        { platform: 'linkedin', aspectRatio: '4:5', seconds: 45 },
      ],
    });
    expect(fixture.expectedApps).toEqual(['tong']);
    expect(fixture.expectedEvidenceLabels).toEqual(
      expect.arrayContaining([
        'video plan',
        'draft variations',
        'timeline rows',
        'agent handoff',
        'render/export slots',
      ])
    );
  });

  it('throws clear errors when required golden-path surfaces are missing', () => {
    expect(() =>
      assertGoldenPathMotionProject({
        project: motionProject({ story: [] }),
      })
    ).toThrow(/story beats/);

    expect(() =>
      assertGoldenPathMotionProject({
        project: motionProject({
          tracks: [],
          drafts: [
            {
              id: 'draft-primary',
              label: 'Primary launch cut',
              angle: 'show the product first, then source-backed proof',
              status: 'planned',
              story: [
                {
                  id: 'beat-hook',
                  role: 'hook',
                  narration: 'Launch Tong from a real repo.',
                  targetSeconds: 3,
                  selectedAssetIds: [],
                  templateId: 'hook-card',
                  provenance: [{ kind: 'repo', ref: 'README.md' }],
                },
              ],
              tracks: [],
              provenance: [{ kind: 'story-beat', ref: 'beat-hook' }],
            },
          ],
        }),
      })
    ).toThrow(/timeline rows/);

    expect(() =>
      assertGoldenPathMotionProject({
        project: motionProject({ exports: [] }),
      })
    ).toThrow(/render\/export slots/);
  });

  it('accepts a project with editable video surfaces and a full-auto handoff', () => {
    expect(() =>
      assertGoldenPathMotionProject({
        project: motionProject(),
        agentHandoff: fullAutoHandoff(),
      })
    ).not.toThrow();
  });

  it('requires a completed full-auto receipt chain after execution', () => {
    expect(() =>
      assertGoldenPathMotionProject({
        project: motionProject({
          executionHistory: [],
        }),
        agentHandoff: fullAutoHandoff(),
        requireFullAutoReceipts: true,
      })
    ).toThrow(/full-auto receipts/);
  });
});

function motionProject(overrides: Partial<MotionProject> = {}): MotionProject {
  const project: MotionProject = {
    id: 'motion-tong-golden-path',
    workspaceId: 'motion-golden-path',
    title: 'tong launch video',
    sourceRefs: [{ kind: 'repo', ref: '/tmp/tong' }],
    brief: {
      projectKind: 'launch',
      appProfile: {
        name: 'tong',
        summary: 'City-specific language learning app.',
        stack: ['Next.js', 'React', 'TypeScript'],
      },
      audience: 'builders and creators',
      platformTargets: [
        { platform: 'x', aspectRatio: '9:16', seconds: 30 },
        { platform: 'linkedin', aspectRatio: '4:5', seconds: 45 },
      ],
      claims: [
        {
          text: 'City-specific language learning app.',
          source: { kind: 'repo', ref: 'README.md' },
        },
      ],
      tone: 'clear, visual, product-led',
      brandMotion: {
        palette: ['#101014', '#f7f0df', '#3da4a6'],
        fontFamilies: ['Inter', 'IBM Plex Mono'],
        motionStyle: 'product-led editorial',
      },
    },
    story: [
      {
        id: 'beat-hook',
        role: 'hook',
        narration: 'Launch Tong from a real repo.',
        targetSeconds: 3,
        selectedAssetIds: [],
        templateId: 'hook-card',
        provenance: [{ kind: 'repo', ref: 'README.md' }],
      },
    ],
    workflowMode: 'full-auto',
    currentDraftId: 'draft-primary',
    drafts: [
      {
        id: 'draft-primary',
        label: 'Primary launch cut',
        angle: 'show the product first, then source-backed proof',
        status: 'planned',
        story: [
          {
            id: 'beat-hook',
            role: 'hook',
            narration: 'Launch Tong from a real repo.',
            targetSeconds: 3,
            selectedAssetIds: [],
            templateId: 'hook-card',
            provenance: [{ kind: 'repo', ref: 'README.md' }],
          },
        ],
        tracks: [
          {
            id: 'track-text',
            kind: 'text',
            clips: [
              {
                id: 'clip-hook',
                componentId: 'hook-card',
                startFrame: 0,
                durationFrames: 90,
                props: { headline: 'Tong launch' },
                provenance: [{ kind: 'story-beat', ref: 'beat-hook' }],
              },
            ],
          },
        ],
        provenance: [{ kind: 'story-beat', ref: 'beat-hook' }],
      },
    ],
    tracks: [
      {
        id: 'track-text',
        kind: 'text',
        clips: [
          {
            id: 'clip-hook',
            componentId: 'hook-card',
            startFrame: 0,
            durationFrames: 90,
            props: { headline: 'Tong launch' },
            provenance: [{ kind: 'story-beat', ref: 'beat-hook' }],
          },
        ],
      },
    ],
    graphNodes: [
      {
        id: 'node-render',
        kind: 'render',
        inputRefs: ['draft-primary'],
        outputRefs: ['export-x'],
        status: 'planned',
        provenance: [{ kind: 'timeline', ref: 'draft-primary' }],
      },
    ],
    exports: [
      {
        id: 'export-x',
        platform: 'x',
        aspectRatio: '9:16',
        status: 'planned',
        provenance: [{ kind: 'timeline', ref: 'track-text' }],
      },
    ],
    createdAt: 1,
    updatedAt: 1,
  };

  return { ...project, ...overrides };
}

function fullAutoHandoff(): MotionAgentExecutionHandoff {
  return {
    id: 'handoff-motion-tong-golden-path',
    projectId: 'motion-tong-golden-path',
    workflowId: 'repo-launch-video',
    mode: 'full-auto',
    nextTemplateId: 'full-auto-run',
    sourceLabels: ['Local repo'],
    templates: [
      {
        id: 'full-auto-run',
        label: 'Run saved gates',
        method: 'POST',
        route: '/api/motion/full-auto',
        toolId: 'motion-render',
        body: { project: '$motionProject' },
        inputPlaceholders: ['$motionProject'],
        expectedReceipts: ['captures', 'generated clips', 'voice clips', 'export pack'],
      },
    ],
  };
}
