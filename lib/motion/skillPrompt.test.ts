import { describe, expect, it } from 'vitest';
import { buildMotionPreviewPlan } from './previewPlan';
import { buildRepoLaunchMotionProject } from './storyboard';
import { buildMotionSkillAuthoringPrompt } from './skillPrompt';
import type { AgentMotionStartResult } from './start';
import { materializeMotionTimeline } from './timeline';
import { routeAgentMotionWorkflow } from './workflowRouter';

function motionStart(): AgentMotionStartResult {
  const sourceRefs = [{ kind: 'repo' as const, ref: 'https://github.com/erniesg/aether' }];
  const project = materializeMotionTimeline(
    buildRepoLaunchMotionProject({
      id: 'motion-aether-launch',
      workspaceId: 'demo-ws',
      projectKind: 'launch',
      workflowMode: 'review',
      audience: 'creative app builders',
      tone: 'precise',
      appProfile: {
        name: 'aether',
        summary: 'Canvas-native creative system.',
        stack: ['TypeScript', 'Convex', 'tldraw'],
      },
      claims: [
        {
          text: 'aether uses TypeScript, Convex, and tldraw in the public repo.',
          source: sourceRefs[0],
        },
      ],
      platformTargets: [{ platform: 'x', aspectRatio: '9:16', seconds: 30 }],
      createdAt: 80,
    }),
    { updatedAt: 81 }
  );

  return {
    status: 'ready',
    workflow: routeAgentMotionWorkflow({
      intent: 'launch',
      mode: 'review',
      sourceRefs,
      requestedEngines: ['remotion', 'hyperframes', 'provider'],
      createdAt: 80,
    }),
    project,
    reviewPlan: null,
    previewPlan: buildMotionPreviewPlan(project, {
      engines: ['remotion', 'hyperframes', 'provider'],
      requestedAt: 82,
    }),
    capturePlan: null,
    examples: [],
    requestedInputs: [],
  };
}

describe('buildMotionSkillAuthoringPrompt', () => {
  it('turns a motion project into a reusable provider-agnostic skill prompt', () => {
    const prompt = buildMotionSkillAuthoringPrompt(motionStart());

    expect(prompt).toContain('Write a reusable aether motion skill for "Repo launch video"');
    expect(prompt).toContain('App: aether');
    expect(prompt).toContain('Engines: remotion, hyperframes, provider');
    expect(prompt).toContain('Review artifacts to produce: video-plan, draft-variations');
    expect(prompt).toContain('Regeneration targets: story-beat, component');
    expect(prompt).toContain('Verification artifacts: contact-sheet, mp4-probe');
    expect(prompt).toContain('gather/find/generate visuals');
    expect(prompt).toContain('review vs full-auto behavior');
    expect(prompt).toContain('Do not hardcode a default image, voice, video, Remotion, HyperFrames, or hosting provider.');
  });
});
