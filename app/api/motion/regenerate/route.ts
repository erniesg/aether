import { NextResponse } from 'next/server';
import type { WorkflowEngine } from '@/lib/workflow/registry';
import type { MotionRegenerateScope } from '@/lib/motion/componentRegistry';
import type { MotionProject } from '@/lib/motion/project';
import { buildAgentMotionCapturePlan } from '@/lib/motion/capturePlan';
import { buildMotionPreviewPlan } from '@/lib/motion/previewPlan';
import {
  buildMotionReviewPlan,
  createMotionComponentRegenerationRequest,
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
  const scope = stringValue(body.scope);
  const prompt = stringValue(body.prompt);
  if (!clipId || !scope || !prompt) {
    return jsonError(400, 'clipId, scope, and prompt are required');
  }

  const requestedEngines = parseRequestedEngines(body.requestedEngines);
  if (body.requestedEngines !== undefined && !requestedEngines) {
    return jsonError(400, 'requestedEngines must contain remotion, hyperframes, or provider');
  }

  const requestedAt = numericValue(body.requestedAt) ?? Date.now();
  const project = body.project as unknown as MotionProject;

  try {
    const regenerationRequest = createMotionComponentRegenerationRequest(project, {
      clipId,
      scope: scope as MotionRegenerateScope,
      prompt,
      requestedAt,
    });
    const capturePlan = buildAgentMotionCapturePlan(project);

    return NextResponse.json({
      ok: true,
      regenerationRequest,
      project,
      reviewPlan: buildMotionReviewPlan(project),
      previewPlan: buildMotionPreviewPlan(project, {
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

function numericValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
