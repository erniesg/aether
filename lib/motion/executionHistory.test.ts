import { describe, expect, it } from 'vitest';
import {
  appendComponentRegenerationExecutionHistory,
} from './executionHistory';
import { createMotionComponentRegenerationRequest } from './reviewPlan';
import { buildRepoLaunchMotionProject } from './storyboard';
import { materializeMotionTimeline } from './timeline';

function project() {
  return materializeMotionTimeline(
    buildRepoLaunchMotionProject({
      id: 'motion-aether-launch',
      workspaceId: 'demo-ws',
      projectKind: 'launch',
      workflowMode: 'review',
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
      platformTargets: [{ platform: 'x', aspectRatio: '9:16', seconds: 30 }],
      createdAt: 80,
    }),
    { updatedAt: 81 }
  );
}

describe('appendComponentRegenerationExecutionHistory', () => {
  it('records a typed revision receipt for a scoped component regeneration request', () => {
    const request = createMotionComponentRegenerationRequest(project(), {
      clipId: 'clip-beat-demo-text',
      scope: 'capture',
      prompt: 'Refresh the product-flow capture with the current canvas.',
      requestedAt: 90,
    });

    const history = appendComponentRegenerationExecutionHistory(undefined, request, 91);

    expect(history).toEqual([
      {
        id: 'execution-regeneration-app-frame-capture-91',
        gateId: 'drafts',
        label: 'Regenerate capture for App frame',
        savedAt: 91,
        receiptCount: 3,
        receiptLabels: ['Regeneration request', 'Capture plan', 'Source patch plan'],
        receipts: [
          {
            id: 'receipt-regeneration-regen-clip-beat-demo-text-capture-90-request',
            kind: 'revision',
            label: 'Regeneration request',
            ref: 'regen-clip-beat-demo-text-capture-90',
          },
          {
            id: 'receipt-regeneration-regen-clip-beat-demo-text-capture-90-capture-plan',
            kind: 'revision',
            label: 'Capture plan',
            ref: 'regen-clip-beat-demo-text-capture-90:capture-plan',
          },
          {
            id: 'receipt-regeneration-regen-clip-beat-demo-text-capture-90-source-patch-plan',
            kind: 'revision',
            label: 'Source patch plan',
            ref: 'source-patch-regen-clip-beat-demo-text-capture-90',
          },
        ],
        provenance: expect.arrayContaining([
          { kind: 'revision', ref: 'regen-clip-beat-demo-text-capture-90' },
          { kind: 'timeline', ref: 'clip-beat-demo-text' },
          { kind: 'story-beat', ref: 'beat-demo' },
        ]),
      },
    ]);
  });
});
