import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';

const tempDirs: string[] = [];

async function makeLocalRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'aether-api-motion-start-'));
  tempDirs.push(dir);
  await mkdir(join(dir, 'src'), { recursive: true });
  await writeFile(
    join(dir, 'package.json'),
    JSON.stringify({
      name: 'tong',
      description: 'City-specific language learning app.',
      dependencies: {
        next: '^15.0.0',
        react: '^19.0.0',
      },
      devDependencies: {
        typescript: '^5.0.0',
      },
      scripts: {
        dev: 'next dev',
      },
    })
  );
  await writeFile(
    join(dir, 'README.md'),
    'Tong is a Next.js and React city-language app with TypeScript practice flows.'
  );
  await writeFile(join(dir, 'src', 'page.tsx'), 'export default function Page() {}');
  return dir;
}

describe('POST /api/motion/start', () => {
  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it('starts an editable motion project from a local repo path', async () => {
    const repoPath = await makeLocalRepo();
    const { POST } = await import('@/app/api/motion/start/route');

    const res = await POST(
      new Request('http://localhost/api/motion/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 'motion-tong-launch',
          workspaceId: 'demo-ws',
          repoPath,
          intent: 'launch',
          mode: 'review',
          audience: 'language learners',
          tone: 'textural',
          platformTargets: [{ platform: 'x', aspectRatio: '9:16', seconds: 30 }],
          requestedEngines: ['remotion', 'hyperframes', 'provider'],
          createdAt: 700,
        }),
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({
      ok: true,
      status: 'ready',
      workflow: {
        workflowId: 'repo-launch-video',
        reason: 'repo source selected a launch workflow',
        plan: {
          skillDraft: {
            label: 'Repo launch video',
            manifestPathRelative: 'lib/agent/skills/repo-launch-video/SKILL.md',
            startShorthands: ['repoPath', 'repoUrl', 'siteUrl', 'sourceRefs'],
            manifest: {
              name: 'repo-launch-video',
              tools: expect.arrayContaining(['motion_start', 'motion_capture', 'motion_render']),
            },
          },
          runPlan: {
            status: 'ready',
            primaryAction: 'request-review',
            nextStepId: 'step-plan',
            steps: expect.arrayContaining([
              expect.objectContaining({
                id: 'step-plan',
                apiRoutes: ['/api/motion/start'],
                reviewRequired: true,
              }),
            ]),
          },
        },
      },
      project: {
        id: 'motion-tong-launch',
        title: 'tong launch video',
        brief: {
          appProfile: {
            name: 'tong',
            repoUrl: repoPath,
            summary: 'City-specific language learning app.',
          },
        },
      },
      reviewPlan: {
        projectId: 'motion-tong-launch',
        primaryAction: 'request-review',
      },
      examples: [
        expect.objectContaining({
          id: 'repo-app-launch-video',
          label: 'Repo app launch',
          editSurfaces: expect.arrayContaining(['capture', 'image-to-video', 'export']),
        }),
      ],
      previewPlan: {
        projectId: 'motion-tong-launch',
        title: 'tong launch video',
        primaryAction: 'request-review',
        sourceProfile: {
          label: 'tong source material',
          sourceKind: 'local-repo',
          readyCaptureCount: 3,
          captureCandidateLabels: expect.arrayContaining([
            'Capture local app route /',
            'Record local product flow /',
          ]),
        },
        enginePreviews: [
          { engine: 'remotion', status: 'ready' },
          { engine: 'hyperframes', status: 'ready' },
          { engine: 'provider', status: 'provider-required' },
        ],
      },
    });
    expect(json.capturePlan).toMatchObject({
      projectId: 'motion-tong-launch',
      status: 'ready',
      target: { kind: 'local-app', ref: 'http://localhost:3000/' },
      providerRequirements: ['browser-capture', 'app-launch', 'screen-recording'],
      requests: expect.arrayContaining([
        expect.objectContaining({
          id: 'capture-local-app-still',
          request: expect.objectContaining({
            mode: 'screenshot',
            target: { kind: 'local-app', ref: 'http://localhost:3000/' },
          }),
        }),
        expect.objectContaining({
          id: 'record-local-flow',
          request: expect.objectContaining({ mode: 'screen-recording' }),
        }),
      ]),
    });
    expect(json.previewPlan.timelineRows.map((row: { trackKind: string }) => row.trackKind)).toEqual([
      'text',
      'caption',
      'voice',
      'transition',
    ]);
  });

  it('accepts sourceRefs directly and returns a reviewable PR evidence request', async () => {
    const { POST } = await import('@/app/api/motion/start/route');

    const res = await POST(
      new Request('http://localhost/api/motion/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 'motion-pr-123',
          workspaceId: 'demo-ws',
          sourceRefs: [{ kind: 'pr', ref: 'erniesg/aether#123' }],
          intent: 'pr',
          mode: 'review',
          audience: 'builders',
          tone: 'precise',
          platformTargets: [{ platform: 'x', aspectRatio: '9:16', seconds: 30 }],
          createdAt: 701,
        }),
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({
      ok: true,
      status: 'needs-evidence',
      project: null,
      reviewPlan: null,
      previewPlan: null,
      examples: [
        expect.objectContaining({
          id: 'daily-skill-launch-pr-to-video',
          label: 'Daily skill launch: PR-to-video',
          storyRoles: ['hook', 'change', 'diff', 'proof', 'cta'],
          reusableComponentIds: ['hook-card', 'agent-trace', 'proof-card', 'cta-card'],
        }),
      ],
      requestedInputs: [
        {
          kind: 'code-change',
          label: 'Collect PR evidence',
          toolId: 'motion-brief',
        },
      ],
    });
    expect(json.examples[0].sampleCopyLines).toContain('npx skills add heygen-com/hyperframes');
  });

  it('keeps site and reference sidecars attached to a repo source set', async () => {
    const repoPath = await makeLocalRepo();
    const { POST } = await import('@/app/api/motion/start/route');

    const res = await POST(
      new Request('http://localhost/api/motion/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 'motion-tong-source-set',
          workspaceId: 'demo-ws',
          sourceRefs: [
            { kind: 'repo', ref: repoPath, label: 'Tong repo' },
            { kind: 'site', ref: 'http://localhost:3000/tokyo', label: 'Tokyo route' },
            {
              kind: 'reference',
              ref: 'https://x.com/heygen/status/123',
              label: 'PR-to-video launch post',
            },
          ],
          intent: 'launch',
          mode: 'review',
          audience: 'language learners',
          tone: 'textural',
          platformTargets: [{ platform: 'x', aspectRatio: '9:16', seconds: 30 }],
          requestedEngines: ['remotion', 'hyperframes', 'provider'],
          createdAt: 701,
        }),
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({
      ok: true,
      status: 'ready',
      workflow: {
        workflowId: 'repo-launch-video',
        plan: {
          acceptedSources: [
            { kind: 'repo', ref: repoPath, label: 'Tong repo' },
            { kind: 'site', ref: 'http://localhost:3000/tokyo', label: 'Tokyo route' },
            {
              kind: 'reference',
              ref: 'https://x.com/heygen/status/123',
              label: 'PR-to-video launch post',
            },
          ],
        },
      },
      project: {
        sourceRefs: expect.arrayContaining([
          { kind: 'repo', ref: repoPath, label: 'Tong repo' },
          { kind: 'site', ref: 'http://localhost:3000/tokyo', label: 'Tokyo route' },
          {
            kind: 'reference',
            ref: 'https://x.com/heygen/status/123',
            label: 'PR-to-video launch post',
          },
        ]),
      },
      capturePlan: {
        status: 'ready',
        target: { kind: 'url', ref: 'http://localhost:3000/tokyo' },
      },
      previewPlan: {
        sourceProfile: {
          captureCandidateLabels: expect.arrayContaining([
            'Capture selected site Tokyo route',
            'Record selected site Tokyo route',
          ]),
          storyboardHintLabels: expect.arrayContaining([
            'hook: Reference: PR-to-video launch post',
          ]),
        },
      },
    });
  });

  it('starts an editable PR-to-video project from agent-collected code evidence', async () => {
    const { POST } = await import('@/app/api/motion/start/route');

    const res = await POST(
      new Request('http://localhost/api/motion/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 'motion-pr-456',
          workspaceId: 'demo-ws',
          prRef: 'erniesg/aether#456',
          intent: 'pr',
          mode: 'full-auto',
          audience: 'builders',
          tone: 'precise',
          platformTargets: [{ platform: 'linkedin', aspectRatio: '16:9', seconds: 45 }],
          appProfile: {
            name: 'aether',
            repoUrl: 'https://github.com/erniesg/aether',
            summary: 'Creator-first canvas tool.',
            stack: ['TypeScript', 'Convex', 'tldraw'],
          },
          codeChangeSource: { kind: 'github-pr', ref: 'erniesg/aether#456' },
          codeChange: {
            providerId: 'agent-collected-pr',
            title: 'Add motion video sync planning',
            author: { name: 'Ernie' },
            files: [
              {
                path: 'components/workspace/TimelineLens.tsx',
                status: 'modified',
                additions: 97,
                deletions: 1,
                language: 'TypeScript',
              },
            ],
            hunks: [
              {
                id: 'hunk-timeline-sync-strip',
                filePath: 'components/workspace/TimelineLens.tsx',
                newStart: 729,
                lines: ['+function MotionSyncPlanStrip({ status, beats, soundCues }) {'],
                provenance: [
                  { kind: 'code-change', ref: 'diff:TimelineLens.tsx#729' },
                ],
              },
            ],
            commits: [{ sha: 'fd07d45', message: 'Surface motion sync planning' }],
            reviews: [{ reviewer: 'designer', state: 'approved' }],
            ci: [{ name: 'typecheck', status: 'passed' }],
            provenance: [
              { kind: 'code-change', ref: 'github:erniesg/aether#456' },
              { kind: 'visual-source', ref: 'visual-source:diff-card' },
            ],
          },
          createdAt: 702,
        }),
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({
      ok: true,
      status: 'ready',
      requestedInputs: [],
      workflow: {
        workflowId: 'pr-to-video',
        reason: 'pull request source selected a code-change workflow',
        plan: {
          mode: 'full-auto',
          primaryAction: 'run-full-auto',
          engines: ['remotion', 'hyperframes'],
          skillDraft: {
            label: 'PR to video',
            manifestPathRelative: 'lib/agent/skills/pr-to-video/SKILL.md',
            startShorthands: ['repoPath', 'repoUrl', 'prRef', 'sourceRefs'],
            manifest: {
              name: 'pr-to-video',
              tools: [
                'motion_start',
                'motion_regenerate',
                'motion_visuals',
                'motion_voice',
                'motion_sync',
                'motion_revise',
                'motion_render',
                'motion_export_pack',
              ],
            },
          },
          runPlan: {
            status: 'ready',
            primaryAction: 'run-full-auto',
            stepCount: 7,
            steps: expect.arrayContaining([
              expect.objectContaining({
                id: 'step-plan',
                autoAdvance: true,
                reviewRequired: false,
              }),
            ]),
          },
        },
      },
      project: {
        id: 'motion-pr-456',
        title: 'aether PR video',
        workflowMode: 'full-auto',
        brief: {
          projectKind: 'pr',
          appProfile: {
            name: 'aether',
            repoUrl: 'https://github.com/erniesg/aether',
          },
        },
      },
      reviewPlan: {
        projectId: 'motion-pr-456',
        primaryAction: 'queue-render',
      },
      previewPlan: {
        projectId: 'motion-pr-456',
        title: 'aether PR video',
        primaryAction: 'queue-render',
        syncSummary: {
          status: 'needs-voice',
        },
      },
      capturePlan: null,
    });
    expect(json.project.story.map((beat: { role: string }) => beat.role)).toEqual([
      'hook',
      'change',
      'diff',
      'mechanism',
      'evidence',
      'cta',
    ]);
    expect(json.project.tracks.map((track: { kind: string }) => track.kind)).toEqual([
      'text',
      'caption',
      'voice',
      'transition',
    ]);
    expect(json.previewPlan.draftOptions.map((draft: { label: string }) => draft.label)).toEqual([
      'Primary PR explainer',
      'Mechanism-first cut',
      'Reviewer cut',
    ]);
    const componentIds = json.previewPlan.editableComponents.map(
      (component: { componentId: string }) => component.componentId
    );
    expect(componentIds).toContain('code-diff-card');
  });

  it('rejects malformed agent-collected code evidence', async () => {
    const { POST } = await import('@/app/api/motion/start/route');

    const res = await POST(
      new Request('http://localhost/api/motion/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: 'demo-ws',
          prRef: 'erniesg/aether#456',
          intent: 'pr',
          appProfile: {
            name: 'aether',
            summary: 'Creator-first canvas tool.',
            stack: ['TypeScript'],
          },
          codeChange: {
            providerId: 'agent-collected-pr',
            title: 'Missing arrays',
          },
        }),
      })
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json).toMatchObject({
      ok: false,
      error: 'codeChange must include title, files, hunks, commits, reviews, ci, and provenance',
    });
  });

  it('rejects requests without a source', async () => {
    const { POST } = await import('@/app/api/motion/start/route');

    const res = await POST(
      new Request('http://localhost/api/motion/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: 'demo-ws',
          audience: 'builders',
          tone: 'precise',
          platformTargets: [{ platform: 'x', aspectRatio: '9:16', seconds: 30 }],
        }),
      })
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json).toMatchObject({
      ok: false,
      error: 'Add a repoPath, repoUrl, siteUrl, prRef, or sourceRefs entry',
    });
  });

  it('rejects malformed JSON', async () => {
    const { POST } = await import('@/app/api/motion/start/route');

    const res = await POST(
      new Request('http://localhost/api/motion/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not-json',
      })
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.ok).toBe(false);
  });
});
