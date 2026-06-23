import type {
  WorkflowRegistryId,
  WorkflowRunMode,
  WorkflowSourceKind,
} from '@/lib/workflow/registry';
import type { MotionBeatRole } from './project';

export type MotionWorkflowExampleEditSurface =
  | 'script'
  | 'code-evidence'
  | 'capture'
  | 'visual'
  | 'image-to-video'
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
    id: 'repo-app-launch-video',
    workflowId: 'repo-launch-video',
    label: 'Repo app launch',
    summary:
      'Turn a repo plus optional site captures into a launch video with proof, product motion, and export variants.',
    sourceKinds: ['repo', 'site', 'capture', 'reference'],
    suggestedMode: 'review',
    platformTargets: ['x 9:16 30s', 'linkedin 4:5 45s', 'website 16:9 60s'],
    storyRoles: ['hook', 'problem', 'proof', 'demo', 'payoff', 'cta'],
    beatPrompts: [
      'Open with the app name and the product promise found in repo facts.',
      'Name the launch problem without drifting into generic category copy.',
      'Show the strongest sourced repo or product claim as a proof card.',
      'Use captured app frames or generated visual inserts for the product flow.',
      'Show linked variants and export readiness as the payoff.',
      'End with the concrete launch action for the target platform.',
    ],
    reusableComponentIds: ['hook-card', 'proof-card', 'app-frame', 'agent-trace', 'cta-card'],
    editSurfaces: [
      'script',
      'capture',
      'visual',
      'image-to-video',
      'component',
      'voice',
      'timing',
      'effect',
      'export',
    ],
    sampleCopyLines: [
      'Point Aether at the repo.',
      'Pull the product facts, captures, and references into a launch cut.',
      'Review the video plan, regenerate weak scenes, then export every format.',
    ],
  },
  {
    id: 'feature-social-cut',
    workflowId: 'feature-social-video',
    label: 'Feature social cut',
    summary:
      'Create a short social reveal for a specific feature with capture-driven scenes and editable caption/voice timing.',
    sourceKinds: ['repo', 'site', 'capture', 'upload', 'reference'],
    suggestedMode: 'review',
    platformTargets: ['instagram 9:16 20s', 'tiktok 9:16 20s', 'x 1:1 20s'],
    storyRoles: ['hook', 'demo', 'proof', 'payoff', 'cta'],
    beatPrompts: [
      'Lead with the feature outcome, not a product overview.',
      'Cut quickly into the app interaction or generated image-to-video insert.',
      'Anchor the feature in one repo, capture, or reference receipt.',
      'Show the before/after or user-visible payoff.',
      'Close with the smallest next action.',
    ],
    reusableComponentIds: ['hook-card', 'app-frame', 'proof-card', 'cta-card'],
    editSurfaces: [
      'script',
      'capture',
      'visual',
      'image-to-video',
      'component',
      'voice',
      'timing',
      'effect',
      'export',
    ],
    sampleCopyLines: [
      'A tiny feature video built from the actual app surface.',
      'Swap the capture, regenerate the motion insert, or retime the captions.',
      'Export the square, vertical, and feed cuts from one editable timeline.',
    ],
  },
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
