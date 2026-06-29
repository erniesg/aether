import { NextResponse } from 'next/server';
import {
  runMotionAgentHandoffTemplates,
  type MotionAgentHandoffDispatchResult,
} from '@/lib/motion/agentHandoffRunner';
import type { MotionProject } from '@/lib/motion/project';
import type { MotionTimelineRevisionOperation } from '@/lib/motion/revise';
import type {
  MaterializedMotionAgentRequestTemplate,
  MotionAgentExecutionHandoff,
} from '@/lib/motion/agentHandoff';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

type MotionAgentHandoffRequestBody = Record<string, unknown>;
type MotionRouteHandler = (request: Request) => Promise<Response>;
type MotionRouteHandlerLoader = () => Promise<MotionRouteHandler>;

const ROUTE_HANDLERS: Record<string, MotionRouteHandlerLoader> = {
  '/api/motion/capture': async () => (await import('@/app/api/motion/capture/route')).POST,
  '/api/motion/export-pack': async () =>
    (await import('@/app/api/motion/export-pack/route')).POST,
  '/api/motion/full-auto': async () => (await import('@/app/api/motion/full-auto/route')).POST,
  '/api/motion/image-to-video': async () =>
    (await import('@/app/api/motion/image-to-video/route')).POST,
  '/api/motion/image-to-video/take': async () =>
    (await import('@/app/api/motion/image-to-video/take/route')).POST,
  '/api/motion/interactive-export': async () =>
    (await import('@/app/api/motion/interactive-export/route')).POST,
  '/api/motion/preview-source': async () =>
    (await import('@/app/api/motion/preview-source/route')).POST,
  '/api/motion/regenerate': async () =>
    (await import('@/app/api/motion/regenerate/route')).POST,
  '/api/motion/render': async () => (await import('@/app/api/motion/render/route')).POST,
  '/api/motion/revise': async () => (await import('@/app/api/motion/revise/route')).POST,
  '/api/motion/source-edit': async () =>
    (await import('@/app/api/motion/source-edit/route')).POST,
  '/api/motion/sync': async () => (await import('@/app/api/motion/sync/route')).POST,
  '/api/motion/visuals': async () => (await import('@/app/api/motion/visuals/route')).POST,
  '/api/motion/voice': async () => (await import('@/app/api/motion/voice/route')).POST,
};

function jsonError(status: number, error: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error, ...extra }, { status });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export async function POST(request: Request): Promise<Response> {
  let body: MotionAgentHandoffRequestBody;
  try {
    const parsed = await request.json();
    if (!isObject(parsed)) return jsonError(400, 'body must be a JSON object');
    body = parsed;
  } catch {
    return jsonError(400, 'request body must be JSON');
  }

  if (!isObject(body.handoff)) return jsonError(400, 'handoff is required');
  if (!isObject(body.project)) return jsonError(400, 'project is required');

  const templateIds = parseTemplateIds(body.templateIds, body.handoff);
  if (!templateIds) {
    return jsonError(400, 'templateIds must be a non-empty string array or handoff.nextTemplateId');
  }

  try {
    const result = await runMotionAgentHandoffTemplates({
      handoff: body.handoff as unknown as MotionAgentExecutionHandoff,
      project: body.project as unknown as MotionProject,
      templateIds,
      input: parseInput(body),
      dispatch: dispatchMotionRoute,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonError(400, message, { code: 'motion_agent_handoff_failed' });
  }
}

async function dispatchMotionRoute(
  request: MaterializedMotionAgentRequestTemplate
): Promise<MotionAgentHandoffDispatchResult> {
  const loadHandler = ROUTE_HANDLERS[request.route];
  if (!loadHandler) {
    return {
      status: 400,
      json: {
        ok: false,
        error: `motion route is not supported by agent handoff: ${request.route}`,
      },
    };
  }

  const handler = await loadHandler();
  const response = await handler(
    new Request(`http://localhost${request.route}`, {
      method: request.method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request.body),
    })
  );

  return {
    status: response.status,
    json: await response.json(),
  };
}

function parseTemplateIds(value: unknown, handoff: Record<string, unknown>): string[] | null {
  if (Array.isArray(value)) {
    const templateIds = value.filter(
      (templateId): templateId is string =>
        typeof templateId === 'string' && templateId.trim().length > 0
    );
    return templateIds.length === value.length && templateIds.length > 0 ? templateIds : null;
  }

  const nextTemplateId = stringValue(handoff.nextTemplateId);
  return nextTemplateId ? [nextTemplateId] : null;
}

function parseInput(body: MotionAgentHandoffRequestBody) {
  const input = isObject(body.input) ? body.input : {};
  return {
    imageToVideoProviderId: stringValue(
      input.imageToVideoProviderId ?? body.imageToVideoProviderId
    ),
    voiceProviderId: stringValue(input.voiceProviderId ?? body.voiceProviderId),
    renderProviderId: stringValue(input.renderProviderId ?? body.renderProviderId),
    computerUseCaptureRunner:
      input.computerUseCaptureRunner ?? body.computerUseCaptureRunner,
    editedSourceFiles: input.editedSourceFiles ?? body.editedSourceFiles,
    timelineRevisionId: stringValue(input.timelineRevisionId ?? body.timelineRevisionId),
    timelineRevisionOperations: timelineRevisionOperationsValue(
      input.timelineRevisionOperations ?? body.timelineRevisionOperations
    ),
    generatedVideoClipId: stringValue(
      input.generatedVideoClipId ?? body.generatedVideoClipId
    ),
    generatedVideoTakeId: stringValue(
      input.generatedVideoTakeId ?? body.generatedVideoTakeId
    ),
  };
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function timelineRevisionOperationsValue(
  value: unknown
): MotionTimelineRevisionOperation[] | undefined {
  return Array.isArray(value) ? (value as MotionTimelineRevisionOperation[]) : undefined;
}
