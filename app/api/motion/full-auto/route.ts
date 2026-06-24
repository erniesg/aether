import { NextResponse } from 'next/server';
import { applyCaptureResultToMotionProject } from '@/lib/motion/captureApply';
import {
  buildAgentMotionCapturePlan,
  type AgentMotionCapturePlanRequest,
} from '@/lib/motion/capturePlan';
import {
  runSavedMotionFullAuto,
  type MotionFullAutoStepHandler,
  type RunSavedMotionFullAutoOptions,
} from '@/lib/motion/fullAutoExecution';
import { applyMotionImageToVideoResultToMotionProject } from '@/lib/motion/imageToVideoApply';
import { buildMotionImageToVideoPlan } from '@/lib/motion/imageToVideoPlan';
import type { MotionProject } from '@/lib/motion/project';
import { buildMotionPreviewPlan } from '@/lib/motion/previewPlan';
import { executeMotionRender } from '@/lib/motion/renderExecution';
import { buildMotionReviewPlan } from '@/lib/motion/reviewPlan';
import { applyMotionSyncPlanToMotionProject } from '@/lib/motion/syncApply';
import { buildMotionSyncPlan } from '@/lib/motion/syncPlan';
import { applyMotionVisualSourceSelectionToMotionProject } from '@/lib/motion/visualSourceApply';
import { buildMotionVisualSourcingPlan } from '@/lib/motion/visualSourcingPlan';
import { applyVoiceSynthesisResultToMotionProject } from '@/lib/motion/voiceApply';
import {
  buildMotionVoicePlan,
  type MotionVoicePlanRequest,
} from '@/lib/motion/voicePlan';
import type { CaptureProvider, CaptureResult } from '@/lib/providers/capture/types';
import {
  CaptureProviderUnavailableError,
  listCaptureProviders,
  resolveCaptureProvider,
} from '@/lib/providers/capture/registry';
import type { VoiceProvider } from '@/lib/providers/voice/types';
import {
  listVoiceProviders,
  resolveVoiceProvider,
  VoiceProviderUnavailableError,
} from '@/lib/providers/voice/registry';
import type { MotionRenderEngine, MotionRenderProvider } from '@/lib/providers/video/types';
import {
  listMotionRenderProviders,
  MotionRenderProviderUnavailableError,
  resolveMotionRenderProvider,
} from '@/lib/providers/video/render-registry';
import {
  listMotionImageToVideoProviders,
  MotionImageToVideoProviderUnavailableError,
  resolveMotionImageToVideoProvider,
} from '@/lib/providers/video/generation-registry';
import type {
  MotionImageToVideoProvider,
  MotionImageToVideoRequest,
  MotionImageToVideoResult,
} from '@/lib/providers/video/types';
import type { WorkflowEngine } from '@/lib/workflow/registry';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

type MotionFullAutoRequestBody = Record<string, unknown>;

const VALID_WORKFLOW_ENGINES = new Set<WorkflowEngine>(['remotion', 'hyperframes', 'provider']);
const VALID_RENDER_ENGINES = new Set<MotionRenderEngine>(['remotion', 'hyperframes']);

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
  const renderEngine = parseRenderEngine(body.renderEngine ?? body.engine, engines ?? []);
  if ((body.renderEngine !== undefined || body.engine !== undefined) && !renderEngine) {
    return jsonError(400, 'renderEngine must be remotion or hyperframes');
  }
  const handlers = buildProviderHandlers(body, {
    engines: engines ?? undefined,
    fps: fps ?? undefined,
    renderEngine: renderEngine ?? undefined,
    requestedAt,
    updatedAt: numericValue(body.updatedAt),
  });
  const options: RunSavedMotionFullAutoOptions = {
    engines: engines ?? undefined,
    fps: fps ?? undefined,
    requestedAt,
    updatedAt: numericValue(body.updatedAt),
    maxSteps: maxSteps ?? undefined,
    handlers,
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
    providers: {
      capture: listCaptureProviders(),
      imageToVideo: listMotionImageToVideoProviders(),
      voice: listVoiceProviders(),
      render: listMotionRenderProviders(),
    },
  });
}

function buildProviderHandlers(
  body: MotionFullAutoRequestBody,
  options: {
    engines?: WorkflowEngine[];
    fps?: number;
    renderEngine?: MotionRenderEngine;
    requestedAt: number;
    updatedAt?: number;
  }
): RunSavedMotionFullAutoOptions['handlers'] {
  const captureProvider = safeResolveCaptureProvider(stringValue(body.captureProviderId));
  const imageToVideoProvider = safeResolveImageToVideoProvider(
    stringValue(body.imageToVideoProviderId)
  );
  const voiceProvider = safeResolveVoiceProvider(stringValue(body.voiceProviderId));
  const renderEngine = options.renderEngine ?? preferredRenderEngine(options.engines);
  const renderProvider = safeResolveRenderProvider({
    engine: renderEngine,
    providerId: stringValue(body.renderProviderId),
  });
  const handlers: RunSavedMotionFullAutoOptions['handlers'] = {};

  if (captureProvider) {
    handlers.capture = captureHandler({
      body,
      provider: captureProvider,
      requestedAt: options.requestedAt,
      updatedAt: options.updatedAt,
    });
  }

  handlers['visual-source'] = visualSourceHandler({
    body,
    fps: options.fps,
    requestedAt: options.requestedAt,
    updatedAt: options.updatedAt,
  });

  if (voiceProvider) {
    handlers.voice = voiceHandler({
      body,
      provider: voiceProvider,
      fps: options.fps,
      requestedAt: options.requestedAt,
      updatedAt: options.updatedAt,
    });
  }

  handlers.sync = syncHandler({
    fps: options.fps,
    requestedAt: options.requestedAt,
    updatedAt: options.updatedAt,
  });

  if (imageToVideoProvider) {
    handlers['visual-generation'] = imageToVideoHandler({
      body,
      provider: imageToVideoProvider,
      fps: options.fps,
      requestedAt: options.requestedAt,
      updatedAt: options.updatedAt,
    });
  }

  if (renderProvider) {
    handlers.render = renderHandler({
      engine: renderEngine,
      provider: renderProvider,
      fps: options.fps,
      requestedAt: options.requestedAt,
      updatedAt: options.updatedAt,
    });
  }

  return handlers;
}

function captureHandler(input: {
  body: MotionFullAutoRequestBody;
  provider: CaptureProvider;
  requestedAt: number;
  updatedAt?: number;
}): MotionFullAutoStepHandler {
  return async ({ project }) => {
    const capturePlan = buildAgentMotionCapturePlan(project);
    if (capturePlan.status !== 'ready') return project;

    const selectedRequests = selectCaptureRequests(capturePlan.requests, input.body);
    if (!selectedRequests || selectedRequests.length === 0) return project;

    const captureResults = await Promise.all(
      selectedRequests.map((planRequest) =>
        input.provider.capture({
          ...planRequest.request,
          preferredProviderId: input.provider.id,
        })
      )
    );
    return applyCaptureResultToMotionProject(
      project,
      mergeCaptureResults(input.provider.id, captureResults),
      { updatedAt: input.updatedAt ?? input.requestedAt }
    );
  };
}

function visualSourceHandler(input: {
  body: MotionFullAutoRequestBody;
  fps?: number;
  requestedAt: number;
  updatedAt?: number;
}): MotionFullAutoStepHandler {
  return async ({ project }) => {
    const visualSourcingPlan = buildMotionVisualSourcingPlan(project, {
      requestedAt: input.requestedAt,
    });
    if (visualSourcingPlan.status !== 'ready') return project;

    const imageToVideoPlan = buildMotionImageToVideoPlan(project, {
      fps: input.fps,
      requestedAt: input.requestedAt,
    });
    if (imageToVideoPlan.status !== 'ready') return project;

    const selectedRequests = selectImageToVideoRequests(imageToVideoPlan.requests, input.body);
    if (!selectedRequests || selectedRequests.length === 0) return project;

    return applyMotionVisualSourceSelectionToMotionProject(project, visualSourcingPlan, {
      clipIds: selectedRequests.map((request) => request.clipId),
      sourceAssetIds: selectedRequests.map((request) => request.sourceAssetId),
      providerId: 'asset-selection',
      updatedAt: input.updatedAt ?? input.requestedAt,
    });
  };
}

function voiceHandler(input: {
  body: MotionFullAutoRequestBody;
  provider: VoiceProvider;
  fps?: number;
  requestedAt: number;
  updatedAt?: number;
}): MotionFullAutoStepHandler {
  return async ({ project }) => {
    const voicePlan = buildMotionVoicePlan(project, {
      fps: input.fps,
      requestedAt: input.requestedAt,
      voiceId: stringValue(input.body.voiceId),
    });
    if (voicePlan.status !== 'ready') return project;

    const selectedRequests = selectVoiceRequests(voicePlan.requests, input.body);
    if (!selectedRequests || selectedRequests.length === 0) return project;

    const voiceResults = await Promise.all(
      selectedRequests.map((voiceRequest) => input.provider.synthesize(voiceRequest))
    );
    return voiceResults.reduce(
      (nextProject, result, index) =>
        applyVoiceSynthesisResultToMotionProject(nextProject, result, {
          clipId: selectedRequests[index].clipId,
          updatedAt: input.updatedAt ?? input.requestedAt,
        }),
      project
    );
  };
}

function syncHandler(input: {
  fps?: number;
  requestedAt: number;
  updatedAt?: number;
}): MotionFullAutoStepHandler {
  return async ({ project }) => {
    const syncPlan = buildMotionSyncPlan(project, {
      fps: input.fps,
      requestedAt: input.requestedAt,
    });
    if (syncPlan.status !== 'ready') return project;

    return applyMotionSyncPlanToMotionProject(project, syncPlan, {
      providerId: 'motion-sync',
      updatedAt: input.updatedAt ?? input.requestedAt,
    });
  };
}

function imageToVideoHandler(input: {
  body: MotionFullAutoRequestBody;
  provider: MotionImageToVideoProvider;
  fps?: number;
  requestedAt: number;
  updatedAt?: number;
}): MotionFullAutoStepHandler {
  return async ({ project }) => {
    const imageToVideoPlan = buildMotionImageToVideoPlan(project, {
      fps: input.fps,
      requestedAt: input.requestedAt,
    });
    if (imageToVideoPlan.status !== 'ready') return project;

    const selectedRequests = selectImageToVideoRequests(imageToVideoPlan.requests, input.body);
    if (!selectedRequests || selectedRequests.length === 0) return project;

    const generationResults = await Promise.all(
      selectedRequests.map((generationRequest) => input.provider.generate(generationRequest))
    );
    return applyMotionImageToVideoResultToMotionProject(
      withImageToVideoPlannedNode(project, imageToVideoPlan.imageToVideoNode),
      mergeImageToVideoResults(input.provider.id, generationResults),
      { updatedAt: input.updatedAt ?? input.requestedAt }
    );
  };
}

function renderHandler(input: {
  engine: MotionRenderEngine;
  provider: MotionRenderProvider;
  fps?: number;
  requestedAt: number;
  updatedAt?: number;
}): MotionFullAutoStepHandler {
  return async ({ project }) => {
    const result = await executeMotionRender(project, {
      engine: input.engine,
      provider: input.provider,
      fps: input.fps,
      requestedAt: input.requestedAt,
      updatedAt: input.updatedAt ?? input.requestedAt,
    });
    return result.project;
  };
}

function selectCaptureRequests(
  requests: AgentMotionCapturePlanRequest[],
  body: MotionFullAutoRequestBody
): AgentMotionCapturePlanRequest[] | null {
  const requestIds = parseStringArray(body.captureRequestIds);
  if (body.captureRequestIds !== undefined && !requestIds) return null;

  if (requestIds) {
    return selectByIds(requests, requestIds, (request) => request.id);
  }

  const includeOptional = body.includeOptionalCapture === true;
  return requests.filter((request) => request.required || includeOptional);
}

function selectVoiceRequests(
  requests: MotionVoicePlanRequest[],
  body: MotionFullAutoRequestBody
): MotionVoicePlanRequest[] | null {
  const requestIds = parseStringArray(body.voiceRequestIds);
  if (body.voiceRequestIds !== undefined && !requestIds) return null;

  if (requestIds) {
    return selectByIds(requests, requestIds, (request) => request.id);
  }

  const clipIds = parseStringArray(body.voiceClipIds);
  if (body.voiceClipIds !== undefined && !clipIds) return null;

  if (clipIds) {
    return selectByIds(requests, clipIds, (request) => request.clipId);
  }

  return requests;
}

function selectImageToVideoRequests(
  requests: MotionImageToVideoRequest[],
  body: MotionFullAutoRequestBody
): MotionImageToVideoRequest[] | null {
  const requestIds = parseStringArray(body.imageToVideoRequestIds);
  if (body.imageToVideoRequestIds !== undefined && !requestIds) return null;

  if (requestIds) {
    return selectByIds(requests, requestIds, (request) => request.id);
  }

  const clipIds = parseStringArray(body.imageToVideoClipIds);
  if (body.imageToVideoClipIds !== undefined && !clipIds) return null;

  if (clipIds) {
    return selectByIds(requests, clipIds, (request) => request.clipId);
  }

  return requests;
}

function selectByIds<T>(
  requests: T[],
  ids: string[],
  keyFor: (request: T) => string
): T[] | null {
  const requestsById = new Map(requests.map((request) => [keyFor(request), request]));
  const selected = ids.flatMap((id) => {
    const request = requestsById.get(id);
    return request ? [request] : [];
  });
  return selected.length === ids.length ? selected : null;
}

function mergeCaptureResults(providerId: string, results: CaptureResult[]): CaptureResult {
  return {
    providerId,
    artifacts: results.flatMap((result) => result.artifacts),
    provenance: uniqueProvenance(results.flatMap((result) => result.provenance)),
  };
}

function mergeImageToVideoResults(
  providerId: string,
  results: MotionImageToVideoResult[]
): MotionImageToVideoResult {
  return {
    providerId,
    artifacts: results.flatMap((result) => result.artifacts),
    provenance: uniqueProvenance(results.flatMap((result) => result.provenance)),
  };
}

function withImageToVideoPlannedNode(
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

function safeResolveCaptureProvider(providerId?: string): CaptureProvider | null {
  try {
    return resolveCaptureProvider(providerId);
  } catch (error) {
    if (error instanceof CaptureProviderUnavailableError) return null;
    throw error;
  }
}

function safeResolveImageToVideoProvider(providerId?: string): MotionImageToVideoProvider | null {
  try {
    return resolveMotionImageToVideoProvider(providerId);
  } catch (error) {
    if (error instanceof MotionImageToVideoProviderUnavailableError) return null;
    throw error;
  }
}

function safeResolveVoiceProvider(providerId?: string): VoiceProvider | null {
  try {
    return resolveVoiceProvider(providerId);
  } catch (error) {
    if (error instanceof VoiceProviderUnavailableError) return null;
    throw error;
  }
}

function safeResolveRenderProvider(input: {
  engine: MotionRenderEngine;
  providerId?: string;
}): MotionRenderProvider | null {
  try {
    return resolveMotionRenderProvider({
      engine: input.engine,
      preferredId: input.providerId,
    });
  } catch (error) {
    if (error instanceof MotionRenderProviderUnavailableError) return null;
    throw error;
  }
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

function parseRenderEngine(value: unknown, engines: WorkflowEngine[]): MotionRenderEngine | null {
  if (value === undefined) return preferredRenderEngine(engines);
  if (typeof value === 'string' && VALID_RENDER_ENGINES.has(value as MotionRenderEngine)) {
    return value as MotionRenderEngine;
  }
  return null;
}

function preferredRenderEngine(engines: WorkflowEngine[] = []): MotionRenderEngine {
  const renderEngine = engines.find(
    (engine): engine is MotionRenderEngine => engine === 'remotion' || engine === 'hyperframes'
  );
  return renderEngine ?? 'remotion';
}

function uniqueWorkflowEngines(engines: WorkflowEngine[]): WorkflowEngine[] {
  return Array.from(new Set(engines));
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

function uniqueProvenance<T extends { kind: string; ref: string }>(refs: T[]): T[] {
  const seen = new Set<string>();
  return refs.filter((ref) => {
    const key = `${ref.kind}:${ref.ref}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
