import type { ToolRegistryId } from '@/lib/tool/registry';
import type { WorkflowEngine, WorkflowSourceKind } from '@/lib/workflow/registry';
import { CodeChangeProviderUnavailableError } from '@/lib/providers/code-change/registry';
import type { CodeChangeResult, CodeChangeSource } from '@/lib/providers/code-change/types';
import {
  buildAgentMotionCapturePlan,
  type AgentMotionCapturePlan,
} from './capturePlan';
import { buildMotionPreviewPlan, type MotionPreviewPlan } from './previewPlan';
import { buildMotionReviewPlan, type MotionReviewPlan } from './reviewPlan';
import { buildCodeChangeMotionProject } from './storyboard';
import {
  buildRepoMotionProjectFromUrl,
  type BuildRepoMotionProjectFromUrlOptions,
  type RepoMotionProjectKind,
} from './repoMotion';
import type { BuildLocalRepoMotionProjectFromPathOptions } from './localRepoMotion';
import { buildSiteMotionProjectFromUrl } from './siteMotion';
import { materializeMotionTimeline } from './timeline';
import type {
  AppProfile,
  MotionPlatformTarget,
  MotionProject,
  MotionWorkflowMode,
} from './project';
import {
  buildPrMotionProjectFromSource,
  type BuildPrMotionProjectFromSourceOptions,
} from './prMotion';
import {
  routeAgentMotionWorkflow,
  type MotionWorkflowIntent,
  type RoutedAgentMotionWorkflow,
} from './workflowRouter';
import type { MotionWorkflowPlanSourceRef } from './workflowPlan';

export type AgentMotionStartStatus =
  | 'ready'
  | 'needs-source'
  | 'needs-evidence'
  | 'planned-only';

export type AgentMotionRequestedInput =
  | {
      kind: 'source';
      label: string;
      missingSourceKinds: WorkflowSourceKind[];
    }
  | {
      kind: 'code-change';
      label: string;
      sourceRef: MotionWorkflowPlanSourceRef;
      toolId: ToolRegistryId;
    }
  | {
      kind: 'project-builder';
      label: string;
      workflowId: string;
    };

export interface StartAgentMotionWorkflowInput {
  id: string;
  workspaceId: string;
  intent?: MotionWorkflowIntent;
  mode: MotionWorkflowMode;
  sourceRefs: MotionWorkflowPlanSourceRef[];
  audience: string;
  tone: string;
  platformTargets: MotionPlatformTarget[];
  requestedEngines?: WorkflowEngine[];
  createdAt: number;
  codeChange?: CodeChangeResult;
  codeChangeSource?: CodeChangeSource;
  appProfile?: AppProfile;
}

export interface StartAgentMotionWorkflowOptions
  extends BuildRepoMotionProjectFromUrlOptions,
    BuildPrMotionProjectFromSourceOptions,
    BuildLocalRepoMotionProjectFromPathOptions {}

export interface AgentMotionStartResult {
  status: AgentMotionStartStatus;
  workflow: RoutedAgentMotionWorkflow;
  project: MotionProject | null;
  reviewPlan: MotionReviewPlan | null;
  previewPlan: MotionPreviewPlan | null;
  capturePlan: AgentMotionCapturePlan | null;
  requestedInputs: AgentMotionRequestedInput[];
}

export async function startAgentMotionWorkflow(
  input: StartAgentMotionWorkflowInput,
  options: StartAgentMotionWorkflowOptions = {}
): Promise<AgentMotionStartResult> {
  const workflow = routeAgentMotionWorkflow({
    intent: input.intent,
    mode: input.mode,
    sourceRefs: input.sourceRefs,
    requestedEngines: input.requestedEngines,
    createdAt: input.createdAt,
  });

  if (workflow.plan.sourceStatus !== 'ready') {
    return {
      status: 'needs-source',
      workflow,
      project: null,
      reviewPlan: null,
      previewPlan: null,
      capturePlan: null,
      requestedInputs: [
        {
          kind: 'source',
          label: formatMissingSourceLabel(workflow.plan.missingSourceKinds),
          missingSourceKinds: workflow.plan.missingSourceKinds,
        },
      ],
    };
  }

  if (workflow.workflowId === 'pr-to-video') {
    return await startCodeChangeWorkflow(input, workflow, options);
  }

  if (
    workflow.workflowId === 'repo-launch-video' ||
    workflow.workflowId === 'feature-social-video'
  ) {
    const repoSource = findSource(input.sourceRefs, 'repo');
    if (repoSource) {
      const project = isLocalRepoRef(repoSource.ref)
        ? await buildLocalRepoStartProject(input, repoSource, options)
        : await buildRepoMotionProjectFromUrl(
            {
              id: input.id,
              workspaceId: input.workspaceId,
              repoUrl: repoSource.ref,
              projectKind: projectKindFor(input),
              workflowMode: input.mode,
              audience: input.audience,
              tone: input.tone,
              platformTargets: input.platformTargets,
              materializeTimeline: true,
              createdAt: input.createdAt,
            },
            options
          );
      return readyResult(workflow, project, input.createdAt);
    }

    const siteSource = findSource(input.sourceRefs, 'site');
    if (siteSource) {
      const project = await buildSiteStartProject(input, siteSource, options);
      return readyResult(workflow, project, input.createdAt);
    }
  }

  if (workflow.workflowId === 'website-to-video') {
    const siteSource = findSource(input.sourceRefs, 'site');
    if (siteSource) {
      const project = await buildSiteStartProject(input, siteSource, options);
      return readyResult(workflow, project, input.createdAt);
    }
  }

  return {
    status: 'planned-only',
    workflow,
    project: null,
    reviewPlan: null,
    previewPlan: null,
    capturePlan: null,
    requestedInputs: [
      {
        kind: 'project-builder',
        label: `Create editable project builder for ${workflow.workflowId}`,
        workflowId: workflow.workflowId,
      },
    ],
  };
}

async function startCodeChangeWorkflow(
  input: StartAgentMotionWorkflowInput,
  workflow: RoutedAgentMotionWorkflow,
  options: StartAgentMotionWorkflowOptions
): Promise<AgentMotionStartResult> {
  const prSource = findSource(input.sourceRefs, 'pr');
  if (!prSource) {
    return needsCodeChangeEvidence(input, workflow, prSource);
  }

  if (!input.codeChange || !input.appProfile) {
    try {
      const project = await buildPrMotionProjectFromSource(
        {
          id: input.id,
          workspaceId: input.workspaceId,
          prRef: prSource.ref,
          workflowMode: input.mode,
          audience: input.audience,
          tone: input.tone,
          appProfile: input.appProfile,
          codeChange: input.codeChange,
          codeChangeSource: input.codeChangeSource,
          platformTargets: input.platformTargets,
          materializeTimeline: true,
          createdAt: input.createdAt,
        },
        options
      );

      return readyResult(workflow, project, input.createdAt);
    } catch (error) {
      if (!(error instanceof CodeChangeProviderUnavailableError)) throw error;
      return needsCodeChangeEvidence(input, workflow, prSource);
    }
  }

  const project = materializeMotionTimeline(
    buildCodeChangeMotionProject({
      id: input.id,
      workspaceId: input.workspaceId,
      sourceRef: input.codeChangeSource ?? { kind: 'github-pr', ref: prSource.ref },
      workflowMode: input.mode,
      audience: input.audience,
      tone: input.tone,
      appProfile: input.appProfile,
      codeChange: input.codeChange,
      platformTargets: input.platformTargets,
      createdAt: input.createdAt,
    }),
    { updatedAt: input.createdAt }
  );

  return readyResult(workflow, project, input.createdAt);
}

function needsCodeChangeEvidence(
  input: StartAgentMotionWorkflowInput,
  workflow: RoutedAgentMotionWorkflow,
  prSource: MotionWorkflowPlanSourceRef | undefined
): AgentMotionStartResult {
  return {
    status: 'needs-evidence',
    workflow,
    project: null,
    reviewPlan: null,
    previewPlan: null,
    capturePlan: null,
    requestedInputs: [
      {
        kind: 'code-change',
        label: 'Collect PR evidence',
        sourceRef: prSource ?? { kind: 'pr', ref: 'missing-pr-source' },
        toolId: 'motion-brief',
      },
    ],
  };
}

function readyResult(
  workflow: RoutedAgentMotionWorkflow,
  project: MotionProject,
  requestedAt: number
): AgentMotionStartResult {
  return {
    status: 'ready',
    workflow,
    project,
    reviewPlan: buildMotionReviewPlan(project),
    previewPlan: buildMotionPreviewPlan(project, {
      engines: workflow.plan.engines,
      requestedAt,
    }),
    capturePlan: capturePlanFor(project),
    requestedInputs: [],
  };
}

function capturePlanFor(project: MotionProject): AgentMotionCapturePlan | null {
  const capturePlan = buildAgentMotionCapturePlan(project);
  return capturePlan.status === 'not-needed' ? null : capturePlan;
}

async function buildSiteStartProject(
  input: StartAgentMotionWorkflowInput,
  siteSource: MotionWorkflowPlanSourceRef,
  options: BuildRepoMotionProjectFromUrlOptions
): Promise<MotionProject> {
  return await buildSiteMotionProjectFromUrl(
    {
      id: input.id,
      workspaceId: input.workspaceId,
      siteUrl: siteSource.ref,
      siteLabel: siteSource.label,
      projectKind: projectKindFor(input),
      workflowMode: input.mode,
      audience: input.audience,
      tone: input.tone,
      platformTargets: input.platformTargets,
      materializeTimeline: true,
      createdAt: input.createdAt,
    },
    options
  );
}

async function buildLocalRepoStartProject(
  input: StartAgentMotionWorkflowInput,
  repoSource: MotionWorkflowPlanSourceRef,
  options: StartAgentMotionWorkflowOptions
): Promise<MotionProject> {
  const { buildLocalRepoMotionProjectFromPath } = await import('./localRepoMotion');
  return await buildLocalRepoMotionProjectFromPath(
    {
      id: input.id,
      workspaceId: input.workspaceId,
      repoPath: repoSource.ref,
      projectKind: projectKindFor(input),
      workflowMode: input.mode,
      audience: input.audience,
      tone: input.tone,
      platformTargets: input.platformTargets,
      materializeTimeline: true,
      createdAt: input.createdAt,
    },
    options
  );
}

function projectKindFor(input: StartAgentMotionWorkflowInput): RepoMotionProjectKind {
  if (input.intent === 'feature' || input.intent === 'social' || input.intent === 'demo') {
    return input.intent;
  }

  return 'launch';
}

function isLocalRepoRef(ref: string): boolean {
  const trimmed = ref.trim();
  return (
    trimmed.startsWith('/') ||
    trimmed.startsWith('./') ||
    trimmed.startsWith('../') ||
    trimmed.startsWith('~/') ||
    trimmed.startsWith('file://') ||
    /^[a-zA-Z]:[\\/]/.test(trimmed)
  );
}

function findSource(
  sourceRefs: MotionWorkflowPlanSourceRef[],
  kind: WorkflowSourceKind
): MotionWorkflowPlanSourceRef | undefined {
  return sourceRefs.find((source) => source.kind === kind);
}

function formatMissingSourceLabel(kinds: WorkflowSourceKind[]): string {
  if (kinds.length === 0) return 'Add source';
  if (kinds.length === 1) return `Add ${kinds[0]}`;

  return `Add ${kinds.slice(0, -1).join(', ')}, or ${kinds[kinds.length - 1]}`;
}
