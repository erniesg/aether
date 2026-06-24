import { NextResponse } from 'next/server';
import {
  runSavedMotionFullAuto,
  type RunSavedMotionFullAutoOptions,
} from '@/lib/motion/fullAutoExecution';
import type { MotionProject } from '@/lib/motion/project';
import { buildMotionPreviewPlan } from '@/lib/motion/previewPlan';
import { buildMotionReviewPlan } from '@/lib/motion/reviewPlan';
import type { WorkflowEngine } from '@/lib/workflow/registry';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

type MotionFullAutoRequestBody = Record<string, unknown>;

const VALID_WORKFLOW_ENGINES = new Set<WorkflowEngine>(['remotion', 'hyperframes', 'provider']);

function jsonError(status: number, error: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error, ...extra }, { status });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export async function POST(request: Request): Promise<Response> {
  let body: MotionFullAutoRequestBody;
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

  const engines = parseWorkflowEngines(body.requestedEngines ?? body.engines);
  if ((body.requestedEngines !== undefined || body.engines !== undefined) && !engines) {
    return jsonError(400, 'requestedEngines must contain remotion, hyperframes, or provider');
  }

  const fps = numericValue(body.fps);
  if (body.fps !== undefined && (!fps || fps <= 0)) {
    return jsonError(400, 'fps must be a positive number');
  }

  const maxSteps = numericValue(body.maxSteps);
  if (body.maxSteps !== undefined && (maxSteps === undefined || maxSteps < 0)) {
    return jsonError(400, 'maxSteps must be a non-negative number');
  }

  const project = body.project as unknown as MotionProject;
  const requestedAt = numericValue(body.requestedAt) ?? Date.now();
  const options: RunSavedMotionFullAutoOptions = {
    engines: engines ?? undefined,
    fps: fps ?? undefined,
    requestedAt,
    updatedAt: numericValue(body.updatedAt),
    maxSteps: maxSteps ?? undefined,
  };
  const result = await runSavedMotionFullAuto(project, options);

  return NextResponse.json({
    ok: true,
    ...result,
    reviewPlan: buildMotionReviewPlan(result.project),
    previewPlan: buildMotionPreviewPlan(result.project, {
      engines: engines ?? undefined,
      fps: fps ?? undefined,
      requestedAt,
    }),
  });
}

function parseWorkflowEngines(value: unknown): WorkflowEngine[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;

  const engines = value.flatMap((candidate) =>
    typeof candidate === 'string' && VALID_WORKFLOW_ENGINES.has(candidate as WorkflowEngine)
      ? [candidate as WorkflowEngine]
      : []
  );
  if (engines.length !== value.length) return null;
  return uniqueWorkflowEngines(engines);
}

function uniqueWorkflowEngines(engines: WorkflowEngine[]): WorkflowEngine[] {
  return Array.from(new Set(engines));
}

function numericValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
