import { describe, expect, it } from 'vitest';

import type { MotionProject } from './project';
import {
  buildMotionAgentExecutionHandoff,
  materializeMotionAgentRequestTemplate,
  type MotionAgentRequestTemplate,
} from './agentHandoff';
import { buildAgentMotionCapturePlan } from './capturePlan';
import { routeAgentMotionWorkflow } from './workflowRouter';

const project: MotionProject = {
  id: 'motion-tong-full-auto',
  workspaceId: 'demo-ws',
  title: 'tong launch video',
  brief: {
    projectKind: 'launch',
    appProfile: {
      name: 'tong',
      summary: 'City-specific language learning app.',
      stack: ['TypeScript'],
    },
    audience: 'language learners',
    platformTargets: [{ platform: 'x', aspectRatio: '9:16', seconds: 30 }],
    claims: [],
    tone: 'textural',
    brandMotion: {
      palette: ['#111111', '#f7f4ee'],
      fontFamilies: ['Inter'],
      motionStyle: 'kinetic editorial',
    },
  },
  story: [],
  workflowMode: 'full-auto',
  currentDraftId: 'draft-primary',
  drafts: [],
  tracks: [],
  graphNodes: [],
  exports: [],
  sourceRefs: [],
  createdAt: 1,
  updatedAt: 1,
};

function template(body: Record<string, unknown>): MotionAgentRequestTemplate {
  return {
    id: 'full-auto-run',
    label: 'Run saved gates',
    method: 'POST',
    route: '/api/motion/full-auto',
    toolId: 'motion-render',
    body,
    inputPlaceholders: [
      '$motionProject',
      '$imageToVideoProviderId',
      '$voiceProviderId',
      '$renderProviderId',
      '$editedSourceFiles',
    ],
    expectedReceipts: ['export pack'],
  };
}

describe('materializeMotionAgentRequestTemplate', () => {
  it('replaces nested placeholders with a project and provider selections', () => {
    const sourceTemplate = template({
      project: '$motionProject',
      nested: {
        imageToVideoProviderId: '$imageToVideoProviderId',
        voiceProviderId: '$voiceProviderId',
      },
      files: '$editedSourceFiles',
      renderProviderId: '$renderProviderId',
      unchanged: 'literal',
    });

    const result = materializeMotionAgentRequestTemplate(sourceTemplate, {
      project,
      imageToVideoProviderId: 'image-provider',
      voiceProviderId: 'voice-provider',
      renderProviderId: 'render-provider',
      editedSourceFiles: [{ path: 'src/video.tsx', contents: 'export {}' }],
    });

    expect(result).toEqual({
      templateId: 'full-auto-run',
      label: 'Run saved gates',
      method: 'POST',
      route: '/api/motion/full-auto',
      toolId: 'motion-render',
      body: {
        project,
        nested: {
          imageToVideoProviderId: 'image-provider',
          voiceProviderId: 'voice-provider',
        },
        files: [{ path: 'src/video.tsx', contents: 'export {}' }],
        renderProviderId: 'render-provider',
        unchanged: 'literal',
      },
      missingPlaceholders: [],
    });
    expect(sourceTemplate.body).toEqual({
      project: '$motionProject',
      nested: {
        imageToVideoProviderId: '$imageToVideoProviderId',
        voiceProviderId: '$voiceProviderId',
      },
      files: '$editedSourceFiles',
      renderProviderId: '$renderProviderId',
      unchanged: 'literal',
    });
  });

  it('reports placeholders that cannot be resolved', () => {
    const result = materializeMotionAgentRequestTemplate(
      template({
        project: '$motionProject',
        renderProviderId: '$renderProviderId',
      }),
      { project }
    );

    expect(result.missingPlaceholders).toEqual(['$renderProviderId']);
    expect(result.body.renderProviderId).toBe('$renderProviderId');
  });

  it('omits optional provider placeholders when no provider is selected', () => {
    const result = materializeMotionAgentRequestTemplate(
      template({
        project: '$motionProject',
        imageToVideoProviderId: '$imageToVideoProviderId?',
        voiceProviderId: '$voiceProviderId?',
        renderProviderId: '$renderProviderId?',
      }),
      { project }
    );

    expect(result.missingPlaceholders).toEqual([]);
    expect(result.body).toEqual({ project });
  });

  it('requires the guarded computer-use capture runner placeholder when present', () => {
    const sourceTemplate = template({
      project: '$motionProject',
      setupDryRun: { setupId: 'computer-use' },
      captureRunner: '$computerUseCaptureRunner',
    });

    const blocked = materializeMotionAgentRequestTemplate(sourceTemplate, { project });
    expect(blocked.missingPlaceholders).toEqual(['$computerUseCaptureRunner']);
    expect(blocked.body.captureRunner).toBe('$computerUseCaptureRunner');

    const approvedRunner = {
      kind: 'computer-use-local',
      approved: true,
      redactionManifest: {
        labels: ['tokens', 'emails'],
        applied: true,
        receiptRef: 'redaction-approved-1',
      },
      receipts: [
        {
          assetUrl: 'asset://computer-use/aether-home.png',
          width: 1080,
          height: 1920,
          mimeType: 'image/png',
        },
      ],
    };
    const ready = materializeMotionAgentRequestTemplate(sourceTemplate, {
      project,
      computerUseCaptureRunner: approvedRunner,
    });

    expect(ready.missingPlaceholders).toEqual([]);
    expect(ready.body).toEqual({
      project,
      setupDryRun: { setupId: 'computer-use' },
      captureRunner: approvedRunner,
    });
  });

  it('carries capture preflight metadata on agent-native handoff templates', () => {
    const repoSource = { kind: 'repo' as const, ref: '/Users/erniesg/code/erniesg/tong' };
    const captureProject: MotionProject = {
      ...project,
      sourceRefs: [repoSource],
      sourceProfile: {
        kind: 'local-repo',
        label: 'tong source material',
        sourceRef: repoSource.ref,
        summary: 'local repo with 1 app route and 3 capture candidates',
        signals: [],
        captureCandidates: [
          {
            id: 'capture-local-app-still',
            label: 'Capture local app route /',
            mode: 'screenshot',
            targetKind: 'local-app',
            targetRef: 'http://localhost:3000/',
            setup: 'npm run dev',
            setupCwd: repoSource.ref,
            reason: 'Local repo exposes an app route suitable for a product still.',
            provenance: [repoSource],
          },
          {
            id: 'capture-local-dom',
            label: 'Read local app structure /',
            mode: 'dom-snapshot',
            targetKind: 'local-app',
            targetRef: 'http://localhost:3000/',
            setup: 'npm run dev',
            setupCwd: repoSource.ref,
            reason: 'DOM structure helps captions stay grounded.',
            provenance: [repoSource],
          },
          {
            id: 'record-local-flow',
            label: 'Record local product flow /',
            mode: 'screen-recording',
            targetKind: 'local-app',
            targetRef: 'http://localhost:3000/',
            setup: 'npm run dev',
            setupCwd: repoSource.ref,
            reason: 'Launch videos need a real product insert.',
            provenance: [repoSource],
          },
        ],
        storyboardHints: [],
        provenance: [repoSource],
      },
    };
    const workflow = routeAgentMotionWorkflow({
      intent: 'launch',
      mode: 'full-auto',
      sourceRefs: [repoSource],
      requestedEngines: ['remotion', 'hyperframes'],
      createdAt: 2,
    });
    const capturePlan = buildAgentMotionCapturePlan(captureProject);

    const handoff = buildMotionAgentExecutionHandoff({
      workflow,
      project: captureProject,
      capturePlan,
    });

    const fullAuto = handoff.templates.find((candidate) => candidate.id === 'full-auto-run');
    expect(fullAuto?.capturePlan).toMatchObject({
      kind: 'motion-agent-capture-template-plan',
      applyRoute: '/api/motion/capture',
      requestIds: ['capture-local-app-still', 'capture-local-dom'],
      requestLabels: ['Capture local app route /', 'Read local app structure /'],
      requestModes: ['screenshot', 'dom-snapshot'],
      targetLabels: ['local-app http://localhost:3000/'],
      setupLabels: ['npm run dev -> http://localhost:3000/'],
      receiptLabels: [
        'screenshot',
        'cursor targets',
        'viewport receipt',
        'snapshot',
        'route metadata',
        'app launch readiness',
      ],
      runnerLabel: 'Playwright local capture',
      fallbackLabels: ['Use computer control when browser capture cannot reach the app state'],
    });
    expect(fullAuto?.expectedReceipts).toEqual(
      expect.arrayContaining([
        'screenshot',
        'cursor targets',
        'viewport receipt',
        'snapshot',
        'route metadata',
        'app launch readiness',
      ])
    );

    const computerUse = handoff.templates.find(
      (candidate) => candidate.id === 'review-computer-use-capture'
    );
    expect(computerUse?.capturePlan).toMatchObject({
      requestIds: ['capture-local-app-still', 'capture-local-dom'],
      runnerLabel: 'computer-use capture',
      receiptLabels: expect.arrayContaining(['approval receipt', 'redaction receipt']),
    });

    const recording = handoff.templates.find((candidate) => candidate.id === 'record-product-flow');
    expect(recording?.capturePlan).toMatchObject({
      requestIds: ['record-local-flow'],
      requestModes: ['screen-recording'],
      receiptLabels: ['recording', 'cursor targets', 'app-state receipt', 'app launch readiness'],
    });

    const materialized = materializeMotionAgentRequestTemplate(fullAuto!, {
      project: captureProject,
    });
    expect(materialized.capturePlan).toEqual(fullAuto?.capturePlan);
  });
});
