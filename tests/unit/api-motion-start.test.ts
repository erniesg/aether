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

  it('returns agent request templates for local repo full-auto capture and editing gates', async () => {
    const repoPath = await makeLocalRepo();
    const { POST } = await import('@/app/api/motion/start/route');

    const res = await POST(
      new Request('http://localhost/api/motion/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 'motion-tong-full-auto',
          workspaceId: 'demo-ws',
          repoPath,
          intent: 'launch',
          mode: 'full-auto',
          audience: 'language learners',
          tone: 'textural',
          platformTargets: [{ platform: 'x', aspectRatio: '9:16', seconds: 30 }],
          requestedEngines: ['remotion', 'hyperframes'],
          createdAt: 705,
        }),
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({
      ok: true,
      status: 'ready',
      agentHandoff: {
        id: 'handoff-motion-tong-full-auto',
        projectId: 'motion-tong-full-auto',
        workflowId: 'repo-launch-video',
        mode: 'full-auto',
        nextTemplateId: 'full-auto-run',
        templates: expect.arrayContaining([
          expect.objectContaining({
            id: 'full-auto-run',
            label: 'Run saved gates',
            method: 'POST',
            route: '/api/motion/full-auto',
            toolId: 'motion-render',
            body: expect.objectContaining({
              project: '$motionProject',
              requestedEngines: ['remotion', 'hyperframes'],
              captureRequestIds: ['capture-local-app-still', 'capture-local-dom'],
              captureRunner: {
                kind: 'playwright-local',
                outputDir: 'outputs/motion-captures/motion-tong-full-auto',
                launchLocalApp: true,
                headless: true,
              },
              imageToVideoProviderId: '$imageToVideoProviderId?',
              voiceProviderId: '$voiceProviderId?',
              renderProviderId: '$renderProviderId?',
              renderEngine: 'remotion',
            }),
            inputPlaceholders: ['$motionProject'],
            expectedReceipts: expect.arrayContaining([
              'captures',
              'voice clips',
              'contact sheet',
              'export pack',
            ]),
          }),
          expect.objectContaining({
            id: 'full-auto-computer-use-run',
            label: 'Run saved gates with computer-use capture',
            method: 'POST',
            route: '/api/motion/full-auto',
            toolId: 'motion-render',
            body: {
              project: '$motionProject',
              requestedEngines: ['remotion', 'hyperframes'],
              captureRequestIds: ['capture-local-app-still', 'capture-local-dom'],
              captureRunner: '$computerUseCaptureRunner',
              imageToVideoProviderId: '$imageToVideoProviderId?',
              voiceProviderId: '$voiceProviderId?',
              renderProviderId: '$renderProviderId?',
              renderEngine: 'remotion',
            },
            inputPlaceholders: ['$motionProject', '$computerUseCaptureRunner'],
            expectedReceipts: expect.arrayContaining([
              'captures',
              'approval receipt',
              'redaction receipt',
              'voice clips',
              'contact sheet',
              'export pack',
            ]),
          }),
          expect.objectContaining({
            id: 'setup-local-app',
            label: 'Dry-run local app runner',
            method: 'POST',
            route: '/api/motion/full-auto',
            toolId: 'motion-capture',
            body: expect.objectContaining({
              project: '$motionProject',
              requestedEngines: ['remotion', 'hyperframes'],
              setupDryRun: { setupId: 'local-app' },
              captureRunner: {
                kind: 'playwright-local',
                outputDir: 'outputs/motion-captures/motion-tong-full-auto',
                launchLocalApp: true,
                headless: true,
              },
            }),
            expectedReceipts: ['HTTP readiness receipt', 'process cleanup receipt'],
          }),
          expect.objectContaining({
            id: 'setup-computer-use',
            label: 'Approve computer-use capture',
            method: 'POST',
            route: '/api/motion/full-auto',
            toolId: 'motion-capture',
            body: {
              project: '$motionProject',
              requestedEngines: ['remotion', 'hyperframes'],
              setupDryRun: { setupId: 'computer-use' },
              captureRunner: '$computerUseCaptureRunner',
            },
            inputPlaceholders: ['$motionProject', '$computerUseCaptureRunner'],
            expectedReceipts: [
              'approval receipt',
              'redaction receipt',
              'safe-scope receipt',
            ],
          }),
          expect.objectContaining({
            id: 'setup-visual-generation',
            label: 'Dry-run image-to-video provider',
            route: '/api/motion/full-auto',
            toolId: 'motion-visuals',
            body: {
              project: '$motionProject',
              requestedEngines: ['remotion', 'hyperframes'],
              setupDryRun: { setupId: 'visual-generation' },
              imageToVideoProviderId: '$imageToVideoProviderId?',
            },
            inputPlaceholders: ['$motionProject'],
            expectedReceipts: ['generated clip receipt', 'timeline update receipt'],
          }),
          expect.objectContaining({
            id: 'setup-voice',
            label: 'Dry-run voice provider',
            route: '/api/motion/full-auto',
            toolId: 'motion-voice',
            body: {
              project: '$motionProject',
              requestedEngines: ['remotion', 'hyperframes'],
              setupDryRun: { setupId: 'voice' },
              voiceProviderId: '$voiceProviderId?',
            },
            inputPlaceholders: ['$motionProject'],
            expectedReceipts: ['audio receipt', 'word timing receipt', 'transcript receipt'],
          }),
          expect.objectContaining({
            id: 'setup-render',
            label: 'Dry-run render runner',
            route: '/api/motion/full-auto',
            toolId: 'motion-render',
            body: {
              project: '$motionProject',
              requestedEngines: ['remotion', 'hyperframes'],
              setupDryRun: { setupId: 'render' },
              renderEngine: 'remotion',
              renderProviderId: '$renderProviderId?',
            },
            inputPlaceholders: ['$motionProject'],
            expectedReceipts: ['source lint', 'contact sheet', 'mp4 probe'],
          }),
          expect.objectContaining({
            id: 'review-capture',
            route: '/api/motion/capture',
            toolId: 'motion-capture',
            body: expect.objectContaining({
              project: '$motionProject',
              requestIds: ['capture-local-app-still', 'capture-local-dom'],
              captureRunner: {
                kind: 'playwright-local',
                outputDir: 'outputs/motion-captures/motion-tong-full-auto',
                launchLocalApp: true,
                headless: true,
              },
            }),
          }),
          expect.objectContaining({
            id: 'review-computer-use-capture',
            label: 'Apply computer-use capture',
            route: '/api/motion/capture',
            toolId: 'motion-capture',
            body: {
              project: '$motionProject',
              requestIds: ['capture-local-app-still', 'capture-local-dom'],
              captureRunner: '$computerUseCaptureRunner',
            },
            inputPlaceholders: ['$motionProject', '$computerUseCaptureRunner'],
            expectedReceipts: expect.arrayContaining([
              'screenshot',
              'snapshot',
              'approval receipt',
              'redaction receipt',
            ]),
          }),
          expect.objectContaining({
            id: 'prepare-preview-source',
            label: 'Prepare preview source',
            route: '/api/motion/preview-source',
            toolId: 'motion-preview-source',
            body: {
              project: '$motionProject',
              engine: 'remotion',
            },
            expectedReceipts: ['preview source files', 'runtime mount target', 'edit contract'],
          }),
          expect.objectContaining({
            id: 'edit-source',
            route: '/api/motion/source-edit',
            toolId: 'motion-source-edit',
            body: {
              project: '$motionProject',
              files: '$editedSourceFiles',
            },
          }),
        ]),
      },
    });
    expect(json.previewPlan.agentRunbook.nextStepId).toBe('step-plan');
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
              tools: expect.arrayContaining([
                'motion_start',
                'motion_regenerate',
                'motion_visuals',
                'motion_voice',
                'motion_sync',
                'motion_revise',
                'motion_source_edit',
                'motion_render',
                'motion_export_pack',
              ]),
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

  it('starts caption, motion-graphic, and engine-port workflows as editable projects', async () => {
    const { POST } = await import('@/app/api/motion/start/route');

    const captionRes = await POST(
      new Request('http://localhost/api/motion/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 'motion-caption-cut',
          workspaceId: 'demo-ws',
          sourceRefs: [
            {
              kind: 'upload',
              ref: 'asset://uploads/demo-recording.mp4',
              label: 'Demo recording',
            },
          ],
          intent: 'caption-overlay',
          mode: 'review',
          audience: 'founders',
          tone: 'sharp',
          platformTargets: [{ platform: 'x', aspectRatio: '9:16', seconds: 30 }],
          requestedEngines: ['remotion', 'hyperframes'],
          createdAt: 710,
        }),
      })
    );
    const captionJson = await captionRes.json();

    expect(captionRes.status).toBe(200);
    expect(captionJson).toMatchObject({
      ok: true,
      status: 'ready',
      workflow: {
        workflowId: 'caption-overlay-video',
        reason: 'caption overlay intent selected an overlay workflow',
      },
      project: {
        id: 'motion-caption-cut',
        title: 'Demo recording caption overlay video',
        brief: { projectKind: 'social' },
      },
      previewPlan: {
        projectId: 'motion-caption-cut',
        primaryAction: 'request-review',
      },
    });
    expect(captionJson.project.story.map((beat: { templateId: string }) => beat.templateId)).toEqual([
      'hook-card',
      'app-frame',
      'caption-line',
      'avatar-bubble',
      'cta-card',
    ]);
    expect(
      captionJson.previewPlan.editableComponents.map(
        (component: { componentId: string }) => component.componentId
      )
    ).toEqual(expect.arrayContaining(['caption-line', 'avatar-bubble']));

    const graphicRes = await POST(
      new Request('http://localhost/api/motion/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 'motion-brand-graphics',
          workspaceId: 'demo-ws',
          sourceRefs: [
            {
              kind: 'reference',
              ref: 'https://x.com/heygen/status/pr-to-video',
              label: 'Skill launch post',
            },
          ],
          intent: 'motion-graphic',
          mode: 'full-auto',
          audience: 'builders',
          tone: 'technical editorial',
          platformTargets: [{ platform: 'linkedin', aspectRatio: '4:5', seconds: 45 }],
          requestedEngines: ['hyperframes', 'provider'],
          createdAt: 711,
        }),
      })
    );
    const graphicJson = await graphicRes.json();

    expect(graphicRes.status).toBe(200);
    expect(graphicJson).toMatchObject({
      ok: true,
      status: 'ready',
      workflow: {
        workflowId: 'motion-graphic-video',
        reason: 'motion graphic intent selected a motion graphics workflow',
      },
      project: {
        id: 'motion-brand-graphics',
        workflowMode: 'full-auto',
        title: 'Skill launch post motion graphic video',
        brief: { projectKind: 'social' },
      },
      reviewPlan: {
        primaryAction: 'queue-render',
      },
    });
    expect(graphicJson.project.story.map((beat: { templateId: string }) => beat.templateId)).toEqual([
      'hook-card',
      'social-overlay',
      'data-visual-card',
      'shader-wipe',
      'contact-sheet-proof',
      'outro-slate',
    ]);

    const portRes = await POST(
      new Request('http://localhost/api/motion/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 'motion-port-kit',
          workspaceId: 'demo-ws',
          sourceRefs: [
            {
              kind: 'remotion',
              ref: 'file://renders/aether/remotion/index.tsx',
              label: 'Existing Remotion source',
            },
            {
              kind: 'hyperframes',
              ref: 'file://renders/aether/index.html',
              label: 'Existing HyperFrames source',
            },
          ],
          intent: 'port',
          mode: 'review',
          audience: 'motion engineers',
          tone: 'precise',
          platformTargets: [{ platform: 'website', aspectRatio: '16:9', seconds: 45 }],
          requestedEngines: ['remotion', 'hyperframes'],
          createdAt: 712,
        }),
      })
    );
    const portJson = await portRes.json();

    expect(portRes.status).toBe(200);
    expect(portJson).toMatchObject({
      ok: true,
      status: 'ready',
      workflow: {
        workflowId: 'remotion-hyperframes-port',
        reason: 'motion engine source selected a portability workflow',
      },
      project: {
        id: 'motion-port-kit',
        title: 'Existing Remotion source portable motion video',
        brief: { projectKind: 'case-study' },
      },
    });
    expect(portJson.project.story.map((beat: { templateId: string }) => beat.templateId)).toEqual([
      'hook-card',
      'code-highlight-card',
      'soft-wipe',
      'contact-sheet-proof',
      'cta-card',
    ]);
    expect(portJson.capturePlan).toBeNull();
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
