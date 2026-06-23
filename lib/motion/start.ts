import type { ToolRegistryId } from '@/lib/tool/registry';
import type { WorkflowEngine, WorkflowSourceKind } from '@/lib/workflow/registry';
import type { CodeChangeResult, CodeChangeSource } from '@/lib/providers/code-change/types';
import { buildMotionReviewPlan, type MotionReviewPlan } from './reviewPlan';
import { buildCodeChangeMotionProject } from './storyboard';
import {
  buildRepoMotionProjectFromUrl,
  type BuildRepoMotionProjectFromUrlOptions,
  type RepoMotionProjectKind,
} from './repoMotion';
import { buildSiteMotionProjectFromUrl } from './siteMotion';
import { materializeMotionTimeline } from './timeline';
import type {
  AppProfile,
  MotionPlatformTarget,
  MotionProject,
  MotionWorkflowMode,
} from './project';
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

export interface AgentMotionStartResult {
  status: AgentMotionStartStatus;
  workflow: RoutedAgentMotionWorkflow;
  project: MotionProject | null;
  reviewPlan: MotionReviewPlan | null;
  requestedInputs: AgentMotionRequestedInput[];
}

export async function startAgentMotionWorkflow(
  input: StartAgentMotionWorkflowInput,
  options: BuildRepoMotionProjectFromUrlOptions = {}
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
    return startCodeChangeWorkflow(input, workflow);
  }

  if (
    workflow.workflowId === 'repo-launch-video' ||
    workflow.workflowId === 'feature-social-video'
  ) {
    const repoSource = findSource(input.sourceRefs, 'repo');
    if (repoSource) {
      const project = await buildRepoMotionProjectFromUrl(
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

      return readyResult(workflow, project);
    }

    const siteSource = findSource(input.sourceRefs, 'site');
    if (siteSource) {
      const project = await buildSiteStartProject(input, siteSource, options);
      return readyResult(workflow, project);
    }
  }

  if (workflow.workflowId === 'website-to-video') {
    const siteSource = findSource(input.sourceRefs, 'site');
    if (siteSource) {
      const project = await buildSiteStartProject(input, siteSource, options);
      return readyResult(workflow, project);
    }
  }

  return {
    status: 'planned-only',
    workflow,
    project: null,
    reviewPlan: null,
    requestedInputs: [
      {
        kind: 'project-builder',
        label: `Create editable project builder for ${workflow.workflowId}`,
        workflowId: workflow.workflowId,
      },
    ],
  };
}

function startCodeChangeWorkflow(
  input: StartAgentMotionWorkflowInput,
  workflow: RoutedAgentMotionWorkflow
): AgentMotionStartResult {
  const prSource = findSource(input.sourceRefs, 'pr');
  if (!input.codeChange || !input.appProfile || !prSource) {
    return {
      status: 'needs-evidence',
      workflow,
      project: null,
      reviewPlan: null,
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

  return readyResult(workflow, project);
}

function readyResult(
  workflow: RoutedAgentMotionWorkflow,
  project: MotionProject
): AgentMotionStartResult {
  return {
    status: 'ready',
    workflow,
    project,
    reviewPlan: buildMotionReviewPlan(project),
    requestedInputs: [],
  };
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

function projectKindFor(input: StartAgentMotionWorkflowInput): RepoMotionProjectKind {
  if (input.intent === 'feature' || input.intent === 'social' || input.intent === 'demo') {
    return input.intent;
  }

  return 'launch';
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
