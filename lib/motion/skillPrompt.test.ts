import { describe, expect, it } from 'vitest';
import { buildMotionPreviewPlan } from './previewPlan';
import { buildCodeChangeMotionProject, buildRepoLaunchMotionProject } from './storyboard';
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
    agentHandoff: null,
    examples: [],
    requestedInputs: [],
  };
}

function prMotionStart(): AgentMotionStartResult {
  const sourceRefs = [{ kind: 'pr' as const, ref: 'erniesg/aether#456' }];
  const project = materializeMotionTimeline(
    buildCodeChangeMotionProject({
      id: 'motion-pr-456',
      workspaceId: 'demo-ws',
      sourceRef: { kind: 'github-pr', ref: 'erniesg/aether#456' },
      workflowMode: 'full-auto',
      audience: 'builders',
      tone: 'precise',
      appProfile: {
        name: 'aether',
        repoUrl: 'https://github.com/erniesg/aether',
        summary: 'Creator-first canvas tool.',
        stack: ['TypeScript', 'Convex', 'tldraw'],
      },
      codeChange: {
        providerId: 'agent-collected-pr',
        title: 'Add motion video sync planning',
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
            provenance: [{ kind: 'code-change', ref: 'diff:TimelineLens.tsx#729' }],
          },
        ],
        commits: [{ sha: 'fd07d45', message: 'Surface motion sync planning' }],
        reviews: [{ reviewer: 'designer', state: 'approved' }],
        ci: [{ name: 'typecheck', status: 'passed' }],
        provenance: [{ kind: 'code-change', ref: 'github:erniesg/aether#456' }],
      },
      platformTargets: [{ platform: 'linkedin', aspectRatio: '16:9', seconds: 45 }],
      createdAt: 90,
    }),
    { updatedAt: 91 }
  );

  return {
    status: 'ready',
    workflow: routeAgentMotionWorkflow({
      intent: 'pr',
      mode: 'full-auto',
      sourceRefs,
      requestedEngines: ['remotion', 'hyperframes'],
      createdAt: 90,
    }),
    project,
    reviewPlan: null,
    previewPlan: buildMotionPreviewPlan(project, {
      engines: ['remotion', 'hyperframes'],
      requestedAt: 92,
    }),
    capturePlan: null,
    agentHandoff: null,
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
    expect(prompt).toContain('Execution run plan the SKILL.md must preserve:');
    expect(prompt).toContain('1. Video plan - routes: /api/motion/start; tools: motion-brief');
    expect(prompt).toContain(
      '3. Product capture - routes: /api/motion/capture; tools: motion-capture'
    );
    expect(prompt).toContain('pause for creator review');
    expect(prompt).toContain('gather/find/generate visuals');
    expect(prompt).toContain('review vs full-auto behavior');
    expect(prompt).toContain('Do not hardcode a default image, voice, video, Remotion, HyperFrames, or hosting provider.');
    expect(prompt).toContain('Runtime input contract the SKILL.md must document:');
    expect(prompt).toContain('"repoPath": "/absolute/local/repo/path"');
    expect(prompt).toContain('"requestedEngines": ["remotion", "hyperframes", "provider"]');
    expect(prompt).toContain('Output JSON contract the SKILL.md must document:');
    expect(prompt).toContain('"motionStartRequest"');
    expect(prompt).toContain('"nextAction": "show-review-artifacts"');
    expect(prompt).toContain('POST /api/motion/start');
  });

  it('includes collected PR evidence schema for PR-to-video skills', () => {
    const prompt = buildMotionSkillAuthoringPrompt(prMotionStart());

    expect(prompt).toContain('Write a reusable aether motion skill for "PR to video"');
    expect(prompt).toContain('Workflow id: pr-to-video');
    expect(prompt).toContain('For PR-to-video, also accept agent-collected evidence:');
    expect(prompt).toContain('"codeChangeSource": { "kind": "github-pr | local-diff | commit-range"');
    expect(prompt).toContain('"codeChange"');
    expect(prompt).toContain('"files": [{ "path": "file.ts"');
    expect(prompt).toContain('"hunks": [{ "id": "stable-hunk-id"');
    expect(prompt).toContain('"ci": [{ "name": "typecheck"');
    expect(prompt).toContain('can create an editable PR video without a separate provider');
    expect(prompt).toContain('auto-advance after saving artifacts');
    expect(prompt).toContain(
      '5. Timeline sync - routes: /api/motion/sync + /api/motion/revise + /api/motion/source-edit'
    );
    expect(prompt).toContain('"nextAction": "continue-through-saved-gates"');
  });
});
