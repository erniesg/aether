import type {
  WorkflowRegistryId,
  WorkflowRunMode,
  WorkflowSourceKind,
} from '@/lib/workflow/registry';
import type { MotionBeatRole } from './project';

export type MotionWorkflowExampleEditSurface =
  | 'script'
  | 'code-evidence'
  | 'component'
  | 'voice'
  | 'timing'
  | 'effect'
  | 'export';

export interface MotionWorkflowExample {
  id: string;
  workflowId: WorkflowRegistryId;
  label: string;
  summary: string;
  sourceKinds: WorkflowSourceKind[];
  suggestedMode: WorkflowRunMode;
  platformTargets: string[];
  storyRoles: MotionBeatRole[];
  beatPrompts: string[];
  reusableComponentIds: string[];
  editSurfaces: MotionWorkflowExampleEditSurface[];
  sampleCopyLines: string[];
}

const MOTION_WORKFLOW_EXAMPLES = [
  {
    id: 'daily-skill-launch-pr-to-video',
    workflowId: 'pr-to-video',
    label: 'Daily skill launch: PR-to-video',
    summary:
      'Turn a pull request or workflow release into a short launch clip for a daily skill series.',
    sourceKinds: ['pr', 'repo'],
    suggestedMode: 'review',
    platformTargets: ['x 9:16 30s', 'linkedin 4:5 45s'],
    storyRoles: ['hook', 'change', 'diff', 'proof', 'cta'],
    beatPrompts: [
      'Open with the weekly launch frame and the workflow name.',
      'State the painful user behavior in one line.',
      'Show the pull request evidence or code-change summary.',
      'Preview the generated video plan, timeline, and proof output.',
      'End with the install or run command plus the next-launch cadence.',
    ],
    reusableComponentIds: ['hook-card', 'agent-trace', 'proof-card', 'cta-card'],
    editSurfaces: ['script', 'code-evidence', 'component', 'voice', 'timing', 'effect', 'export'],
    sampleCopyLines: [
      "This week we're launching new skills for HyperFrames, each built around a workflow.",
      'Today is pr-to-video.',
      'Nobody reads pull requests. Now agents can turn them into a short explainer video.',
      'npx skills add heygen-com/hyperframes',
      'New skill launching every day. Follow for more.',
    ],
  },
] as const satisfies readonly MotionWorkflowExample[];

export function listMotionWorkflowExamples(
  workflowId?: string
): MotionWorkflowExample[] {
  return MOTION_WORKFLOW_EXAMPLES.filter(
    (example) => !workflowId || example.workflowId === workflowId
  ).map((example) => ({
    ...example,
    sourceKinds: [...example.sourceKinds],
    platformTargets: [...example.platformTargets],
    storyRoles: [...example.storyRoles],
    beatPrompts: [...example.beatPrompts],
    reusableComponentIds: [...example.reusableComponentIds],
    editSurfaces: [...example.editSurfaces],
    sampleCopyLines: [...example.sampleCopyLines],
  }));
}
