import { NextResponse } from 'next/server';
import type { MotionProject } from '@/lib/motion/project';
import {
  applyMotionImageToVideoResultToMotionProject,
  stageMotionImageToVideoResultForReview,
} from '@/lib/motion/imageToVideoApply';
import { buildMotionImageToVideoPlan } from '@/lib/motion/imageToVideoPlan';
import { buildMotionPreviewPlan } from '@/lib/motion/previewPlan';
import { buildMotionReviewPlan } from '@/lib/motion/reviewPlan';
import {
  listMotionImageToVideoProviders,
  MotionImageToVideoProviderUnavailableError,
  resolveMotionImageToVideoProvider,
} from '@/lib/providers/video/generation-registry';
import { ensureConfiguredMotionImageToVideoProviders } from '@/lib/providers/video/configured-generation';
import type {
  MotionImageToVideoRequest,
  MotionImageToVideoResult,
} from '@/lib/providers/video/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

type MotionImageToVideoRequestBody = Record<string, unknown>;

function jsonError(status: number, error: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error, ...extra }, { status });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export async function POST(request: Request): Promise<Response> {
  ensureConfiguredMotionImageToVideoProviders();

  let body: MotionImageToVideoRequestBody;
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

  const fps = numericValue(body.fps);
  if (body.fps !== undefined && (!fps || fps <= 0)) {
    return jsonError(400, 'fps must be a positive number');
  }

  const project = body.project as unknown as MotionProject;
  const requestedAt = numericValue(body.requestedAt) ?? Date.now();
  const updatedAt = numericValue(body.updatedAt);
  const draftId = stringValue(body.draftId);
  const applyMode = parseApplyMode(body.applyMode);
  if (body.applyMode !== undefined && !applyMode) {
    return jsonError(400, 'applyMode must be "apply" or "stage"');
  }
  const plan = buildMotionImageToVideoPlan(project, {
    draftId,
    fps,
    requestedAt,
  });

  if (plan.status !== 'ready') {
    return NextResponse.json({
      ok: true,
      status: 'blocked',
      project,
      imageToVideoPlan: plan,
      selectedRequests: [],
      blockers: plan.blockers,
      generationResults: [],
      generationResult: null,
      reviewPlan: buildMotionReviewPlan(project),
      previewPlan: buildMotionPreviewPlan(project, { requestedAt }),
      providers: listMotionImageToVideoProviders(),
    });
  }

  const selectedRequests = selectGenerationRequests(plan.requests, body);
  if (!selectedRequests) {
    return jsonError(
      400,
      'requestIds or clipIds must reference image-to-video requests in the plan'
    );
  }
  if (selectedRequests.length === 0) {
    return jsonError(400, 'no image-to-video requests selected');
  }

  try {
    const provider = resolveMotionImageToVideoProvider(stringValue(body.providerId));
    const generationResults = await Promise.all(
      selectedRequests.map((generationRequest) => provider.generate(generationRequest))
    );
    const generationResult = mergeGenerationResults(provider.id, generationResults);
    const shouldStageForReview = applyMode === 'stage';
    const updatedProject = shouldStageForReview
      ? stageMotionImageToVideoResultForReview(
          withPlannedNode(project, plan.imageToVideoNode),
          generationResult,
          { updatedAt }
        )
      : applyMotionImageToVideoResultToMotionProject(
          withPlannedNode(project, plan.imageToVideoNode),
          generationResult,
          { updatedAt }
        );

    return NextResponse.json({
      ok: true,
      status: shouldStageForReview ? 'generated-for-review' : 'generated',
      project: updatedProject,
      imageToVideoPlan: buildMotionImageToVideoPlan(updatedProject, {
        draftId: plan.draftId,
        fps,
        requestedAt,
      }),
      selectedRequests,
      generationResults,
      generationResult,
      reviewPlan: buildMotionReviewPlan(updatedProject),
      previewPlan: buildMotionPreviewPlan(updatedProject, { requestedAt }),
      providers: listMotionImageToVideoProviders(),
    });
  } catch (error) {
    if (error instanceof MotionImageToVideoProviderUnavailableError) {
      return NextResponse.json({
        ok: true,
        status: 'provider-required',
        project,
        imageToVideoPlan: plan,
        selectedRequests,
        blockers: [
          {
            id: 'image-to-video-provider-required',
            label: error.message,
          },
        ],
        generationResults: [],
        generationResult: null,
        reviewPlan: buildMotionReviewPlan(project),
        previewPlan: buildMotionPreviewPlan(project, { requestedAt }),
        providers: listMotionImageToVideoProviders(),
      });
    }

    const message = error instanceof Error ? error.message : String(error);
    return jsonError(502, message, { code: 'motion_image_to_video_failed' });
  }
}

function selectGenerationRequests(
  requests: MotionImageToVideoRequest[],
  body: MotionImageToVideoRequestBody
): MotionImageToVideoRequest[] | null {
  const requestIds = parseStringArray(body.requestIds);
  if (body.requestIds !== undefined && !requestIds) return null;

  if (requestIds) {
    return selectByIds(requests, requestIds, (request) => request.id);
  }

  const clipIds = parseStringArray(body.clipIds);
  if (body.clipIds !== undefined && !clipIds) return null;

  if (clipIds) {
    return selectByIds(requests, clipIds, (request) => request.clipId);
  }

  return requests;
}

function selectByIds(
  requests: MotionImageToVideoRequest[],
  ids: string[],
  keyFor: (request: MotionImageToVideoRequest) => string
): MotionImageToVideoRequest[] | null {
  const requestsById = new Map(requests.map((request) => [keyFor(request), request]));
  const selected = ids.flatMap((id) => {
    const request = requestsById.get(id);
    return request ? [request] : [];
  });
  return selected.length === ids.length ? selected : null;
}

function mergeGenerationResults(
  providerId: string,
  results: MotionImageToVideoResult[]
): MotionImageToVideoResult {
  return {
    providerId,
    artifacts: results.flatMap((result) => result.artifacts),
    provenance: uniqueProvenance(results.flatMap((result) => result.provenance)),
  };
}

function withPlannedNode(
  project: MotionProject,
  node: ReturnType<typeof buildMotionImageToVideoPlan>['imageToVideoNode']
): MotionProject {
  if (!node) return project;
  if (project.graphNodes.some((candidate) => candidate.id === node.id)) return project;
  return {
    ...project,
    graphNodes: [...project.graphNodes, node],
  };
}

function parseStringArray(value: unknown): string[] | null {
  if (value === undefined) return null;
  if (!Array.isArray(value)) return null;
  const values = value.flatMap((candidate) => {
    const parsed = stringValue(candidate);
    return parsed ? [parsed] : [];
  });
  return values.length === value.length ? values : null;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function numericValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function parseApplyMode(value: unknown): 'apply' | 'stage' | undefined {
  if (value === undefined) return undefined;
  if (value === 'apply' || value === 'stage') return value;
  return undefined;
}

function uniqueProvenance(
  refs: MotionImageToVideoResult['provenance']
): MotionImageToVideoResult['provenance'] {
  const seen = new Set<string>();
  return refs.filter((ref) => {
    const key = `${ref.kind}:${ref.ref}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
