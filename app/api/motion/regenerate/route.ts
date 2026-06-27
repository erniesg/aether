import { NextResponse } from 'next/server';
import type { WorkflowEngine } from '@/lib/workflow/registry';
import type { MotionRegenerateScope } from '@/lib/motion/componentRegistry';
import type { MotionProject } from '@/lib/motion/project';
import { buildAgentMotionCapturePlan } from '@/lib/motion/capturePlan';
import {
  appendComponentRegenerationExecutionHistory,
  appendDraftVariationExecutionHistory,
  appendReferenceSignalRegenerationExecutionHistory,
} from '@/lib/motion/executionHistory';
import { buildMotionPreviewPlan } from '@/lib/motion/previewPlan';
import {
  buildMotionReviewPlan,
  createMotionComponentRegenerationRequest,
  createMotionDraftVariationRequest,
  createMotionReferenceSignalRegenerationRequest,
  stageMotionDraftVariation,
  stageMotionComponentRegeneration,
  stageMotionReferenceSignalRegeneration,
} from '@/lib/motion/reviewPlan';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

type MotionRegenerateRequestBody = Record<string, unknown>;

const VALID_ENGINES = new Set<WorkflowEngine>(['remotion', 'hyperframes', 'provider']);

function jsonError(status: number, error: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error, ...extra }, { status });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export async function POST(request: Request): Promise<Response> {
  let body: MotionRegenerateRequestBody;
  try {
    const parsed = await request.json();
    if (!isObject(parsed)) return jsonError(400, 'body must be a JSON object');
    body = parsed;
  } catch {
    return jsonError(400, 'request body must be JSON');
  }

  if (!isObject(body.project)) {
    return jsonError(400, 'project is required');
  }

  const clipId = stringValue(body.clipId);
  const draftId = stringValue(body.draftId);
  const referenceSignalId = stringValue(body.referenceSignalId);
  const sourceUrl = stringValue(body.sourceUrl);
  const componentIds = stringArrayValue(body.componentIds);
  const scope = stringValue(body.scope);
  const prompt = stringValue(body.prompt);
  if (!clipId && !referenceSignalId && !draftId) {
    return jsonError(400, 'clipId, referenceSignalId, or draftId with prompt is required');
  }
  if (draftId && !prompt) {
    return jsonError(400, 'draftId and prompt are required');
  }
  if (!draftId && (!scope || !prompt)) {
    return jsonError(
      400,
      referenceSignalId
        ? 'scope and prompt are required'
        : 'clipId, scope, and prompt are required'
    );
  }
  if (referenceSignalId && (!componentIds || componentIds.length === 0)) {
    return jsonError(400, 'componentIds are required for reference regeneration');
  }

  const requestedEngines = parseRequestedEngines(body.requestedEngines);
  if (body.requestedEngines !== undefined && !requestedEngines) {
    return jsonError(400, 'requestedEngines must contain remotion, hyperframes, or provider');
  }

  const requestedAt = numericValue(body.requestedAt) ?? Date.now();
  const project = body.project as unknown as MotionProject;

  try {
    if (draftId) {
      if (!prompt) {
        return jsonError(400, 'draftId and prompt are required');
      }
      const regenerationRequest = createMotionDraftVariationRequest(project, {
        draftId,
        prompt,
        requestedAt,
      });
      const stagedProject = stageMotionDraftVariation(project, regenerationRequest);
      const updatedProject = {
        ...stagedProject,
        executionHistory: appendDraftVariationExecutionHistory(
          stagedProject.executionHistory,
          regenerationRequest,
          requestedAt
        ),
      };
      const capturePlan = buildAgentMotionCapturePlan(updatedProject);

      return NextResponse.json({
        ok: true,
        regenerationRequest,
        project: updatedProject,
        reviewPlan: buildMotionReviewPlan(updatedProject),
        previewPlan: buildMotionPreviewPlan(updatedProject, {
          engines: requestedEngines ?? undefined,
          requestedAt,
        }),
        capturePlan: capturePlan.status === 'not-needed' ? null : capturePlan,
      });
    }

    if (referenceSignalId) {
      if (!scope || !prompt) {
        return jsonError(400, 'scope and prompt are required');
      }
      const regenerationRequest = createMotionReferenceSignalRegenerationRequest(project, {
        referenceSignalId,
        sourceUrl,
        scope: scope as MotionRegenerateScope,
        componentIds: componentIds ?? [],
        prompt,
        requestedAt,
      });
      const stagedProject = stageMotionReferenceSignalRegeneration(
        project,
        regenerationRequest
      );
      const updatedProject = {
        ...stagedProject,
        executionHistory: appendReferenceSignalRegenerationExecutionHistory(
          stagedProject.executionHistory,
          regenerationRequest,
          requestedAt
        ),
      };
      const capturePlan = buildAgentMotionCapturePlan(updatedProject);

      return NextResponse.json({
        ok: true,
        regenerationRequest,
        project: updatedProject,
        reviewPlan: buildMotionReviewPlan(updatedProject),
        previewPlan: buildMotionPreviewPlan(updatedProject, {
          engines: requestedEngines ?? undefined,
          requestedAt,
        }),
        capturePlan: capturePlan.status === 'not-needed' ? null : capturePlan,
      });
    }

    if (!clipId) {
      return jsonError(400, 'clipId, scope, and prompt are required');
    }
    if (!scope || !prompt) {
      return jsonError(400, 'clipId, scope, and prompt are required');
    }

    const regenerationRequest = createMotionComponentRegenerationRequest(project, {
      clipId,
      scope: scope as MotionRegenerateScope,
      prompt,
      requestedAt,
    });
    const stagedProject = stageMotionComponentRegeneration(project, regenerationRequest);
    const updatedProject = {
      ...stagedProject,
      executionHistory: appendComponentRegenerationExecutionHistory(
        stagedProject.executionHistory,
        regenerationRequest,
        requestedAt
      ),
    };
    const capturePlan = buildAgentMotionCapturePlan(updatedProject);

    return NextResponse.json({
      ok: true,
      regenerationRequest,
      project: updatedProject,
      reviewPlan: buildMotionReviewPlan(updatedProject),
      previewPlan: buildMotionPreviewPlan(updatedProject, {
        engines: requestedEngines ?? undefined,
        requestedAt,
      }),
      capturePlan: capturePlan.status === 'not-needed' ? null : capturePlan,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonError(400, message, { code: 'motion_regeneration_failed' });
  }
}

function parseRequestedEngines(value: unknown): WorkflowEngine[] | null {
  if (value === undefined) return null;
  if (!Array.isArray(value)) return null;
  const engines = value.filter(
    (engine): engine is WorkflowEngine =>
      typeof engine === 'string' && VALID_ENGINES.has(engine as WorkflowEngine)
  );
  return engines.length === value.length ? engines : null;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function stringArrayValue(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const strings = value
    .map((entry) => stringValue(entry))
    .filter((entry): entry is string => Boolean(entry));
  return strings.length === value.length ? strings : undefined;
}

function numericValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
