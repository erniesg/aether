import { NextResponse } from 'next/server';
import type { MotionProject } from '@/lib/motion/project';
import { buildMotionPreviewPlan } from '@/lib/motion/previewPlan';
import { buildMotionReviewPlan } from '@/lib/motion/reviewPlan';
import { applyVoiceSynthesisResultToMotionProject } from '@/lib/motion/voiceApply';
import {
  buildMotionVoicePlan,
  type MotionVoicePlanRequest,
} from '@/lib/motion/voicePlan';
import {
  listVoiceProviders,
  resolveVoiceProvider,
  VoiceProviderUnavailableError,
} from '@/lib/providers/voice/registry';
import { ensureConfiguredVoiceProviders } from '@/lib/providers/voice/configured';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

type MotionVoiceRequestBody = Record<string, unknown>;

function jsonError(status: number, error: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error, ...extra }, { status });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export async function POST(request: Request): Promise<Response> {
  ensureConfiguredVoiceProviders();

  let body: MotionVoiceRequestBody;
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
  const voicePlan = buildMotionVoicePlan(project, {
    draftId: stringValue(body.draftId),
    fps,
    requestedAt,
    voiceId: stringValue(body.voiceId),
  });

  if (voicePlan.status !== 'ready') {
    return NextResponse.json({
      ok: true,
      status: 'blocked',
      project,
      voicePlan,
      selectedRequests: [],
      blockers: voicePlan.blockers,
      voiceResults: [],
      reviewPlan: buildMotionReviewPlan(project),
      previewPlan: buildMotionPreviewPlan(project, { requestedAt }),
      providers: listVoiceProviders(),
    });
  }

  const selectedRequests = selectVoiceRequests(voicePlan.requests, body);
  if (!selectedRequests) {
    return jsonError(400, 'requestIds or clipIds must reference voice requests in the plan');
  }
  if (selectedRequests.length === 0) {
    return jsonError(400, 'no voice requests selected');
  }

  try {
    const provider = resolveVoiceProvider(stringValue(body.providerId));
    const voiceResults = await Promise.all(
      selectedRequests.map((voiceRequest) => provider.synthesize(voiceRequest))
    );
    const updatedProject = voiceResults.reduce(
      (nextProject, result, index) =>
        applyVoiceSynthesisResultToMotionProject(nextProject, result, {
          clipId: selectedRequests[index].clipId,
          updatedAt,
        }),
      project
    );

    return NextResponse.json({
      ok: true,
      status: 'synthesized',
      project: updatedProject,
      voicePlan: buildMotionVoicePlan(updatedProject, {
        draftId: voicePlan.draftId,
        fps,
        requestedAt,
        voiceId: stringValue(body.voiceId),
      }),
      selectedRequests,
      voiceResults,
      reviewPlan: buildMotionReviewPlan(updatedProject),
      previewPlan: buildMotionPreviewPlan(updatedProject, { requestedAt }),
      providers: listVoiceProviders(),
    });
  } catch (error) {
    if (error instanceof VoiceProviderUnavailableError) {
      return NextResponse.json({
        ok: true,
        status: 'provider-required',
        project,
        voicePlan,
        selectedRequests,
        blockers: [
          {
            id: 'voice-provider-required',
            label: error.message,
          },
        ],
        voiceResults: [],
        reviewPlan: buildMotionReviewPlan(project),
        previewPlan: buildMotionPreviewPlan(project, { requestedAt }),
        providers: listVoiceProviders(),
      });
    }

    const message = error instanceof Error ? error.message : String(error);
    return jsonError(502, message, { code: 'motion_voice_failed' });
  }
}

function selectVoiceRequests(
  requests: MotionVoicePlanRequest[],
  body: MotionVoiceRequestBody
): MotionVoicePlanRequest[] | null {
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
  requests: MotionVoicePlanRequest[],
  ids: string[],
  keyFor: (request: MotionVoicePlanRequest) => string
): MotionVoicePlanRequest[] | null {
  const requestsById = new Map(requests.map((request) => [keyFor(request), request]));
  const selected = ids.flatMap((id) => {
    const request = requestsById.get(id);
    return request ? [request] : [];
  });
  return selected.length === ids.length ? selected : null;
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
