import { NextResponse } from 'next/server';
import type { MotionProject } from '@/lib/motion/project';
import { applyStagedMotionImageToVideoTake } from '@/lib/motion/imageToVideoApply';
import { buildMotionPreviewPlan } from '@/lib/motion/previewPlan';
import { buildMotionReviewPlan } from '@/lib/motion/reviewPlan';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type MotionImageToVideoTakeRequestBody = Record<string, unknown>;

function jsonError(status: number, error: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error, ...extra }, { status });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export async function POST(request: Request): Promise<Response> {
  let body: MotionImageToVideoTakeRequestBody;
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
  if (!clipId) return jsonError(400, 'clipId is required');

  const takeId = stringValue(body.takeId);
  if (!takeId) return jsonError(400, 'takeId is required');

  const requestedAt = numericValue(body.requestedAt) ?? Date.now();
  const updatedAt = numericValue(body.updatedAt) ?? requestedAt;
  const project = applyStagedMotionImageToVideoTake(body.project as unknown as MotionProject, {
    clipId,
    takeId,
    updatedAt,
  });

  if (!project) {
    return jsonError(400, 'takeId must reference a generated video take on the clip', {
      code: 'motion_image_to_video_take_missing',
    });
  }

  return NextResponse.json({
    ok: true,
    status: 'take-applied',
    project,
    reviewPlan: buildMotionReviewPlan(project),
    previewPlan: buildMotionPreviewPlan(project, { requestedAt }),
  });
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function numericValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
