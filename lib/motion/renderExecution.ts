import type {
  MotionRenderEngine,
  MotionRenderProvider,
  MotionRenderRequest,
  MotionRenderResult,
} from '@/lib/providers/video/types';
import type {
  MotionGraphNode,
  MotionProject,
  TimelineTrack,
} from './project';
import {
  buildMotionRenderPlan,
  type MotionRenderPlan,
  type MotionRenderPlanBlocker,
} from './renderPlan';
import { buildMotionRenderSourceBundle } from './renderSource';
import { applyMotionRenderResultToMotionProject } from './renderApply';

export interface ExecuteMotionRenderOptions {
  engine: MotionRenderEngine;
  provider: MotionRenderProvider;
  draftId?: string;
  fps?: number;
  requestedAt: number;
  updatedAt?: number;
}

export type ExecuteMotionRenderResult =
  | {
      status: 'blocked';
      project: MotionProject;
      plan: MotionRenderPlan;
      blockers: MotionRenderPlanBlocker[];
      request?: undefined;
      renderResult?: undefined;
    }
  | {
      status: 'rendered';
      project: MotionProject;
      plan: MotionRenderPlan;
      blockers: [];
      request: MotionRenderRequest;
      renderResult: MotionRenderResult;
    };

export async function executeMotionRender(
  project: MotionProject,
  options: ExecuteMotionRenderOptions
): Promise<ExecuteMotionRenderResult> {
  if (options.provider.engine !== options.engine) {
    throw new Error(`${options.provider.id} does not support ${options.engine} render requests`);
  }

  const plan = buildMotionRenderPlan(project, {
    engine: options.engine,
    draftId: options.draftId,
    fps: options.fps,
    requestedAt: options.requestedAt,
  });

  if (plan.status !== 'ready') {
    return {
      status: 'blocked',
      project,
      plan,
      blockers: plan.blockers,
    };
  }

  const request = buildMotionRenderRequest(project, plan);
  const renderResult = await options.provider.render(request);
  const projectWithRenderNode = plan.renderNode
    ? upsertGraphNode(project, plan.renderNode)
    : project;

  return {
    status: 'rendered',
    project: applyMotionRenderResultToMotionProject(projectWithRenderNode, renderResult, {
      renderRequest: request,
      updatedAt: options.updatedAt,
    }),
    plan,
    blockers: [],
    request,
    renderResult,
  };
}

export function buildMotionRenderRequest(
  project: MotionProject,
  plan: MotionRenderPlan
): MotionRenderRequest {
  const tracks = selectTracks(project, plan.draftId);
  const request: MotionRenderRequest = {
    id: plan.id,
    projectId: plan.projectId,
    draftId: plan.draftId,
    engine: plan.engine,
    compositionId: plan.compositionId,
    fps: plan.fps,
    durationFrames: plan.durationFrames,
    tracks,
    outputs: plan.outputs,
    provenance: plan.provenance,
  };
  const sourceBundle = buildMotionRenderSourceBundle(project, request);

  return {
    ...request,
    sourceFiles: sourceBundle.files,
  };
}

function selectTracks(project: MotionProject, draftId: string): TimelineTrack[] {
  const draft = project.drafts.find((candidate) => candidate.id === draftId);
  if (draft?.tracks.length) return draft.tracks;
  if (draftId === project.currentDraftId) return project.tracks;
  return [];
}

function upsertGraphNode(project: MotionProject, nextNode: MotionGraphNode): MotionProject {
  const existingIndex = project.graphNodes.findIndex((node) => node.id === nextNode.id);

  return {
    ...project,
    graphNodes:
      existingIndex === -1
        ? [...project.graphNodes, nextNode]
        : project.graphNodes.map((node, index) =>
            index === existingIndex ? nextNode : node
          ),
  };
}
