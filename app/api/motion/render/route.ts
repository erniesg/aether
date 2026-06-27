import { NextResponse } from 'next/server';
import type { MotionProject } from '@/lib/motion/project';
import { buildMotionPreviewPlan } from '@/lib/motion/previewPlan';
import { buildMotionReviewPlan } from '@/lib/motion/reviewPlan';
import {
  buildMotionRenderRequest,
  executeMotionRender,
} from '@/lib/motion/renderExecution';
import { buildMotionRenderPlan } from '@/lib/motion/renderPlan';
import type { MotionRenderEngine } from '@/lib/providers/video/types';
import {
  listMotionRenderProviders,
  MotionRenderProviderUnavailableError,
  resolveMotionRenderProvider,
} from '@/lib/providers/video/render-registry';
import { ensureConfiguredMotionRenderProviders } from '@/lib/providers/video/configured-render';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

type MotionRenderRequestBody = Record<string, unknown>;

const VALID_RENDER_ENGINES = new Set<MotionRenderEngine>(['remotion', 'hyperframes']);

function jsonError(status: number, error: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error, ...extra }, { status });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export async function POST(request: Request): Promise<Response> {
  ensureConfiguredMotionRenderProviders();

  let body: MotionRenderRequestBody;
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

  const engine = parseEngine(body.engine);
  if (!engine) return jsonError(400, 'engine must be remotion or hyperframes');

  const fps = numericValue(body.fps);
  if (body.fps !== undefined && (!fps || fps <= 0)) {
    return jsonError(400, 'fps must be a positive number');
  }

  const project = body.project as unknown as MotionProject;
  const requestedAt = numericValue(body.requestedAt) ?? Date.now();
  const draftId = stringValue(body.draftId);
  const providerId = stringValue(body.providerId);

  const plan = buildMotionRenderPlan(project, {
    engine,
    draftId,
    fps,
    requestedAt,
  });

  if (plan.status !== 'ready') {
    return NextResponse.json({
      ok: true,
      status: 'blocked',
      project,
      plan,
      blockers: plan.blockers,
      request: null,
      renderResult: null,
      reviewPlan: buildMotionReviewPlan(project),
      previewPlan: buildMotionPreviewPlan(project, {
        engines: [engine],
        fps: fps ?? undefined,
        requestedAt,
      }),
      providers: listMotionRenderProviders(),
    });
  }

  try {
    const provider = resolveMotionRenderProvider({ engine, preferredId: providerId });
    const result = await executeMotionRender(project, {
      engine,
      provider,
      draftId,
      fps,
      requestedAt,
      updatedAt: numericValue(body.updatedAt),
    });

    return NextResponse.json({
      ok: true,
      ...result,
      reviewPlan: buildMotionReviewPlan(result.project),
      previewPlan: buildMotionPreviewPlan(result.project, {
        engines: [engine],
        fps: fps ?? undefined,
        requestedAt,
      }),
      providers: listMotionRenderProviders(),
    });
  } catch (error) {
    if (error instanceof MotionRenderProviderUnavailableError) {
      return NextResponse.json({
        ok: true,
        status: 'provider-required',
        project,
        plan,
        blockers: [
          {
            id: 'render-provider-required',
            label: error.message,
          },
        ],
        request: buildMotionRenderRequest(project, plan),
        renderResult: null,
        reviewPlan: buildMotionReviewPlan(project),
        previewPlan: buildMotionPreviewPlan(project, {
          engines: [engine],
          fps: fps ?? undefined,
          requestedAt,
        }),
        providers: listMotionRenderProviders(),
      });
    }

    const message = error instanceof Error ? error.message : String(error);
    return jsonError(502, message, { code: 'motion_render_failed' });
  }
}

function parseEngine(value: unknown): MotionRenderEngine | null {
  if (value === undefined) return 'remotion';
  if (typeof value === 'string' && VALID_RENDER_ENGINES.has(value as MotionRenderEngine)) {
    return value as MotionRenderEngine;
  }
  return null;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function numericValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
