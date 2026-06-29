import { describe, expect, it, vi } from 'vitest';
import type { CaptureResult } from '@/lib/providers/capture/types';
import { applyCaptureResultToMotionProject } from './captureApply';
import { appendSetupDryRunExecutionHistory } from './executionHistory';
import type { MotionProject } from './project';
import { buildMotionPreviewPlan } from './previewPlan';
import { runSavedMotionFullAuto } from './fullAutoExecution';
import { buildRepoLaunchMotionProject } from './storyboard';
import { materializeMotionTimeline } from './timeline';

function project(mode: MotionProject['workflowMode'] = 'full-auto'): MotionProject {
  return materializeMotionTimeline(
    buildRepoLaunchMotionProject({
      id: 'motion-aether-launch',
      workspaceId: 'demo-ws',
      projectKind: 'launch',
      workflowMode: mode,
      audience: 'creative app builders',
      tone: 'precise',
      appProfile: {
        name: 'aether',
        repoUrl: 'https://github.com/erniesg/aether',
        summary: 'Canvas-native creative system.',
        stack: ['TypeScript', 'Convex', 'tldraw'],
      },
      claims: [
        {
          text: 'aether uses TypeScript, Convex, and tldraw in the public repo.',
          source: { kind: 'repo', ref: 'https://github.com/erniesg/aether' },
        },
      ],
      sourceProfile: {
        kind: 'github-repo',
        label: 'aether source material',
        sourceRef: 'https://github.com/erniesg/aether',
        summary: 'GitHub repo with hosted capture candidates',
        signals: [],
        captureCandidates: [
          {
            id: 'capture-hosted-still',
            label: 'Capture aether homepage',
            mode: 'screenshot',
            targetKind: 'url',
            targetRef: 'https://aether.example',
            reason: 'Hosted site is available as product evidence.',
            provenance: [{ kind: 'site', ref: 'https://aether.example' }],
          },
          {
            id: 'record-hosted-flow',
            label: 'Record aether product flow',
            mode: 'screen-recording',
            targetKind: 'url',
            targetRef: 'https://aether.example',
            reason: 'Demo scenes need a product flow.',
            provenance: [{ kind: 'site', ref: 'https://aether.example' }],
          },
        ],
        storyboardHints: [],
        provenance: [{ kind: 'repo', ref: 'https://github.com/erniesg/aether' }],
      },
      platformTargets: [{ platform: 'x', aspectRatio: '9:16', seconds: 30 }],
      createdAt: 120,
    }),
    { updatedAt: 121 }
  );
}

const captureResult: CaptureResult = {
  providerId: 'browser-capture',
  artifacts: [
    {
      id: 'capture-aether-homepage',
      kind: 'screenshot',
      assetUrl: 'asset://captures/aether-homepage.png',
      mimeType: 'image/png',
      width: 1440,
      height: 1200,
      viewport: { width: 1440, height: 1200, deviceScaleFactor: 1 },
      cursorTargets: [],
      provenance: [{ kind: 'capture', ref: 'capture-hosted-still' }],
    },
    {
      id: 'recording-aether-flow',
      kind: 'recording',
      assetUrl: 'asset://captures/aether-flow.mp4',
      mimeType: 'video/mp4',
      width: 1440,
      height: 1200,
      viewport: { width: 1440, height: 1200, deviceScaleFactor: 1 },
      cursorTargets: [],
      durationMs: 6000,
      provenance: [{ kind: 'capture', ref: 'record-hosted-flow' }],
    },
  ],
  provenance: [{ kind: 'provider', ref: 'browser-capture' }],
};

describe('runSavedMotionFullAuto', () => {
  it('pauses at the next provider-backed gate when no provider handler is configured', async () => {
    const result = await runSavedMotionFullAuto(project(), {
      engines: ['hyperframes'],
      requestedAt: 600,
    });

    expect(result).toMatchObject({
      status: 'paused',
      run: {
        id: 'full-auto-motion-aether-launch-draft-primary-600',
        status: 'paused',
        mode: 'full-auto',
        reason: 'provider-required',
        stepId: 'capture',
        stepLabel: 'Product capture',
        actionLabel: 'Capture product material',
        advancedStepIds: [],
        providerRequirementLabels: ['browser capture', 'screen recording'],
        apiRoutes: ['/api/motion/capture'],
        toolIds: ['motion-capture'],
      },
      project: {
        id: 'motion-aether-launch',
      },
      productionPlan: {
        nextStepId: 'capture',
      },
    });
    expect(result.project.executionHistory).toBeUndefined();
  });

  it('advances injected gates, saves their receipts, and pauses at the next provider blocker', async () => {
    const capture = vi.fn(({ project: currentProject }) =>
      applyCaptureResultToMotionProject(currentProject, captureResult, { updatedAt: 610 })
    );

    const result = await runSavedMotionFullAuto(project(), {
      engines: ['hyperframes'],
      requestedAt: 600,
      handlers: {
        capture,
      },
    });

    expect(capture).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      status: 'paused',
      run: {
        status: 'paused',
        reason: 'provider-required',
        stepId: 'visual-source',
        advancedStepIds: ['capture'],
        receiptCount: 1,
        reviewPacket: {
          kind: 'motion-full-auto-review-packet',
          status: 'paused',
          mode: 'full-auto',
          advancedStepLabels: ['Product capture'],
          savedReceiptCount: 2,
          savedReceiptLabels: ['Screenshot', 'Recording'],
          savedArtifacts: [
            {
              kind: 'capture',
              label: 'Screenshot',
              ref: 'capture-aether-homepage',
              assetUrl: 'asset://captures/aether-homepage.png',
              mimeType: 'image/png',
            },
            {
              kind: 'capture',
              label: 'Recording',
              ref: 'recording-aether-flow',
              assetUrl: 'asset://captures/aether-flow.mp4',
              mimeType: 'video/mp4',
            },
          ],
          editableSurfaceLabels: ['capture', 'recording', 'crop', 'cursor path'],
          proofLabels: ['screenshots', 'recordings', 'DOM snapshots', 'cursor targets'],
          nextReviewLabel: 'Visual sourcing',
          nextActionLabel: 'Plan source visuals',
          nextRouteLabels: ['/api/motion/visuals'],
          nextToolLabels: ['motion-visuals'],
          instruction:
            'Full auto paused at Visual sourcing; review saved receipts before continuing or switch to review gates.',
        },
      },
      productionPlan: {
        nextStepId: 'visual-source',
      },
    });
    expect(result.project.executionHistory).toEqual([
      expect.objectContaining({
        id: 'execution-capture-browser-capture-610',
        gateId: 'capture',
        receiptCount: 2,
        receiptLabels: ['Screenshot', 'Recording'],
      }),
    ]);
  });

  it('pauses instead of retrying when a handler returns no changed project', async () => {
    const capture = vi.fn(({ project: currentProject }) => currentProject);

    const result = await runSavedMotionFullAuto(project(), {
      engines: ['hyperframes'],
      requestedAt: 602,
      handlers: {
        capture,
      },
    });

    expect(capture).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      status: 'paused',
      run: {
        reason: 'handler-required',
        stepId: 'capture',
        advancedStepIds: [],
      },
      productionPlan: {
        nextStepId: 'capture',
      },
    });
  });

  it('moves the next capability setup card after setup dry-run receipts are saved', async () => {
    const baseProject = project();
    const before = buildMotionPreviewPlan(baseProject, {
      engines: ['hyperframes'],
      requestedAt: 603,
    });
    expect(before.capabilitySetup.nextActionLabel).toBe('Connect browser capture');

    const projectWithSetupReceipts: MotionProject = {
      ...baseProject,
      executionHistory: appendSetupDryRunExecutionHistory(
        baseProject.executionHistory,
        {
          setupId: 'computer-use',
          gateId: 'capture',
          label: 'Computer-use capture',
          receiptLabels: ['approval receipt', 'redaction receipt', 'safe-scope receipt'],
          provenance: [{ kind: 'manual', ref: 'setup:computer-use' }],
        },
        604
      ),
    };
    const after = buildMotionPreviewPlan(projectWithSetupReceipts, {
      engines: ['hyperframes'],
      requestedAt: 605,
    });

    expect(after.capabilitySetup.nextActionLabel).toBe('Connect visual sources');
    expect(after.capabilitySetup.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'capture',
          status: 'configured',
          configuredProviderLabels: ['computer use dry run'],
        }),
        expect.objectContaining({
          id: 'computer-use',
          status: 'configured',
          dryRunPendingLabels: [],
        }),
      ])
    );

    const result = await runSavedMotionFullAuto(projectWithSetupReceipts, {
      engines: ['hyperframes'],
      requestedAt: 606,
    });
    expect(result).toMatchObject({
      status: 'paused',
      run: {
        reason: 'provider-required',
        stepId: 'capture',
        advancedStepIds: [],
      },
      productionPlan: {
        nextStepId: 'capture',
      },
    });
  });

  it('pauses for review-mode approvals instead of auto-running review gates', async () => {
    const result = await runSavedMotionFullAuto(project('review'), {
      engines: ['hyperframes'],
      requestedAt: 601,
      handlers: {
        capture: vi.fn(),
      },
    });

    expect(result).toMatchObject({
      status: 'paused',
      run: {
        status: 'paused',
        mode: 'review',
        reason: 'review-required',
        stepId: 'drafts',
        advancedStepIds: [],
        actionLabel: 'Review draft variations',
      },
      productionPlan: {
        nextStepId: 'drafts',
      },
    });
  });
});
