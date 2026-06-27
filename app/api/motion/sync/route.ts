import { NextResponse } from 'next/server';
import type { WorkflowEngine } from '@/lib/workflow/registry';
import type { MotionProject } from '@/lib/motion/project';
import { buildMotionPreviewPlan } from '@/lib/motion/previewPlan';
import { buildMotionReviewPlan } from '@/lib/motion/reviewPlan';
import { applyMotionSyncPlanToMotionProject } from '@/lib/motion/syncApply';
import { buildMotionSyncPlan } from '@/lib/motion/syncPlan';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

type MotionSyncRequestBody = Record<string, unknown>;

const VALID_ENGINES = new Set<WorkflowEngine>(['remotion', 'hyperframes', 'provider']);

function jsonError(status: number, error: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error, ...extra }, { status });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export async function POST(request: Request): Promise<Response> {
  let body: MotionSyncRequestBody;
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

  const requestedEngines = parseRequestedEngines(body.requestedEngines);
  if (body.requestedEngines !== undefined && !requestedEngines) {
    return jsonError(400, 'requestedEngines must contain remotion, hyperframes, or provider');
  }

  const requestedAt = numericValue(body.requestedAt) ?? Date.now();
  const updatedAt = numericValue(body.updatedAt) ?? requestedAt;
  const draftId = stringValue(body.draftId);
  const fps = numericValue(body.fps);
  const project = body.project as unknown as MotionProject;

  try {
    const syncPlan = buildMotionSyncPlan(project, {
      draftId,
      fps,
      requestedAt,
    });

    if (syncPlan.status === 'ready') {
      const syncedProject = applyMotionSyncPlanToMotionProject(project, syncPlan, {
        providerId: 'motion-sync',
        updatedAt,
      });

      return NextResponse.json({
        ok: true,
        status: 'synced',
        project: syncedProject,
        syncPlan: buildMotionSyncPlan(syncedProject, {
          draftId,
          fps,
          requestedAt,
        }),
        reviewPlan: buildMotionReviewPlan(syncedProject),
        previewPlan: buildMotionPreviewPlan(syncedProject, {
          engines: requestedEngines ?? undefined,
          fps,
          requestedAt,
        }),
      });
    }

    return NextResponse.json({
      ok: true,
      project,
      syncPlan,
      reviewPlan: buildMotionReviewPlan(project),
      previewPlan: buildMotionPreviewPlan(project, {
        engines: requestedEngines ?? undefined,
        fps,
        requestedAt,
      }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonError(400, message, { code: 'motion_sync_failed' });
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
