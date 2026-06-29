import { NextResponse } from 'next/server';
import type { MotionProject, MotionWorkflowMode } from '@/lib/motion/project';
import { switchMotionWorkflowMode } from '@/lib/motion/mode';
import type { WorkflowEngine } from '@/lib/workflow/registry';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

type MotionModeRequestBody = Record<string, unknown>;

const VALID_ENGINES = new Set<WorkflowEngine>(['remotion', 'hyperframes', 'provider']);

function jsonError(status: number, error: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error, ...extra }, { status });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export async function POST(request: Request): Promise<Response> {
  let body: MotionModeRequestBody;
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

  const mode = parseMode(body.mode);
  if (!mode) return jsonError(400, 'mode must be review or full-auto');

  const requestedEngines = parseRequestedEngines(body.requestedEngines);
  if (body.requestedEngines !== undefined && !requestedEngines) {
    return jsonError(400, 'requestedEngines must contain remotion, hyperframes, or provider');
  }

  const fps = numericValue(body.fps);
  if (body.fps !== undefined && (!fps || fps <= 0)) {
    return jsonError(400, 'fps must be a positive number');
  }

  try {
    const result = switchMotionWorkflowMode({
      project: body.project as unknown as MotionProject,
      mode,
      requestedEngines: requestedEngines ?? undefined,
      fps: fps ?? undefined,
      requestedAt: numericValue(body.requestedAt) ?? Date.now(),
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonError(400, message, { code: 'motion_mode_failed' });
  }
}

function parseMode(value: unknown): MotionWorkflowMode | null {
  return value === 'review' || value === 'full-auto' ? value : null;
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

function numericValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}
