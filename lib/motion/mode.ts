import type { WorkflowEngine, WorkflowSourceKind } from '@/lib/workflow/registry';
import {
  buildAgentMotionCapturePlan,
  type AgentMotionCapturePlan,
} from './capturePlan';
import {
  buildMotionAgentExecutionHandoff,
  type MotionAgentExecutionHandoff,
} from './agentHandoff';
import { buildMotionPreviewPlan, type MotionPreviewPlan } from './previewPlan';
import type { MotionProject, MotionProvenanceRef, MotionWorkflowMode } from './project';
import { buildMotionReviewPlan, type MotionReviewPlan } from './reviewPlan';
import {
  routeAgentMotionWorkflow,
  type MotionWorkflowIntent,
  type RoutedAgentMotionWorkflow,
} from './workflowRouter';
import type { MotionWorkflowPlanSourceRef } from './workflowPlan';

type DirectWorkflowSourceKind = Extract<WorkflowSourceKind, MotionProvenanceRef['kind']>;

export interface SwitchMotionWorkflowModeInput {
  project: MotionProject;
  mode: MotionWorkflowMode;
  requestedEngines?: WorkflowEngine[];
  fps?: number;
  requestedAt: number;
}

export interface SwitchMotionWorkflowModeResult {
  status: 'ready';
  workflow: RoutedAgentMotionWorkflow;
  project: MotionProject;
  reviewPlan: MotionReviewPlan;
  previewPlan: MotionPreviewPlan;
  capturePlan: AgentMotionCapturePlan | null;
  agentHandoff: MotionAgentExecutionHandoff;
}

export function switchMotionWorkflowMode(
  input: SwitchMotionWorkflowModeInput
): SwitchMotionWorkflowModeResult {
  const project = {
    ...input.project,
    workflowMode: input.mode,
    updatedAt: input.requestedAt,
  };
  const workflow = routeAgentMotionWorkflow({
    intent: inferWorkflowIntent(project),
    mode: input.mode,
    sourceRefs: inferWorkflowSourceRefs(project),
    requestedEngines: input.requestedEngines,
    createdAt: input.requestedAt,
  });
  const capturePlan = buildAgentMotionCapturePlan(project);
  const visibleCapturePlan = capturePlan.status === 'not-needed' ? null : capturePlan;

  return {
    status: 'ready',
    workflow,
    project,
    reviewPlan: buildMotionReviewPlan(project),
    previewPlan: buildMotionPreviewPlan(project, {
      engines: workflow.plan.engines,
      fps: input.fps,
      workflowRunPlan: workflow.plan.runPlan,
      requestedAt: input.requestedAt,
    }),
    capturePlan: visibleCapturePlan,
    agentHandoff: buildMotionAgentExecutionHandoff({
      workflow,
      project,
      capturePlan: visibleCapturePlan,
    }),
  };
}

function inferWorkflowIntent(project: MotionProject): MotionWorkflowIntent {
  if (project.brief.projectKind === 'pr') return 'pr';
  if (project.brief.projectKind === 'feature') return 'feature';
  if (project.brief.projectKind === 'demo') return 'demo';
  if (project.brief.projectKind === 'social') return 'social';
  if (project.brief.projectKind === 'case-study') return 'port';
  return 'launch';
}

function inferWorkflowSourceRefs(project: MotionProject): MotionWorkflowPlanSourceRef[] {
  const refs = project.sourceRefs.flatMap(provenanceToWorkflowSources);
  const profileRef = sourceProfileRef(project);
  if (profileRef) refs.push(profileRef);

  if (project.brief.appProfile.repoUrl) {
    refs.push({
      kind: 'repo',
      ref: project.brief.appProfile.repoUrl,
      label: project.brief.appProfile.name,
    });
  }
  if (project.brief.appProfile.siteUrl) {
    refs.push({
      kind: 'site',
      ref: project.brief.appProfile.siteUrl,
      label: project.brief.appProfile.name,
    });
  }

  const deduped = dedupeSources(refs);
  if (deduped.length > 0) return deduped;

  return [
    {
      kind: 'reference',
      ref: project.id,
      label: project.title,
    },
  ];
}

function provenanceToWorkflowSources(ref: MotionProvenanceRef): MotionWorkflowPlanSourceRef[] {
  if (isDirectWorkflowSourceKind(ref.kind)) {
    return [{ kind: ref.kind, ref: ref.ref, label: ref.label }];
  }
  if (ref.kind === 'code-change') {
    return [{ kind: 'pr', ref: ref.ref, label: ref.label ?? 'Pull request' }];
  }
  return [];
}

function sourceProfileRef(project: MotionProject): MotionWorkflowPlanSourceRef | null {
  const profile = project.sourceProfile;
  if (!profile) return null;
  if (profile.kind === 'local-repo' || profile.kind === 'github-repo') {
    return { kind: 'repo', ref: profile.sourceRef, label: profile.label };
  }
  if (profile.kind === 'site') {
    return { kind: 'site', ref: profile.sourceRef, label: profile.label };
  }
  if (profile.kind === 'pr') {
    return { kind: 'pr', ref: profile.sourceRef, label: profile.label };
  }
  return null;
}

function isDirectWorkflowSourceKind(
  kind: MotionProvenanceRef['kind']
): kind is DirectWorkflowSourceKind {
  return (
    kind === 'repo' ||
    kind === 'site' ||
    kind === 'capture' ||
    kind === 'upload' ||
    kind === 'reference'
  );
}

function dedupeSources(sources: MotionWorkflowPlanSourceRef[]): MotionWorkflowPlanSourceRef[] {
  const seen = new Set<string>();
  return sources.filter((source) => {
    const key = `${source.kind}:${source.ref}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
