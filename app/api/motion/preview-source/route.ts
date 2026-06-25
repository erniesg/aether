import { NextResponse } from 'next/server';
import type { MotionProject } from '@/lib/motion/project';
import { buildMotionPreviewPlan } from '@/lib/motion/previewPlan';
import { buildMotionReviewPlan } from '@/lib/motion/reviewPlan';
import { buildMotionRenderRequest } from '@/lib/motion/renderExecution';
import { buildMotionRenderPlan } from '@/lib/motion/renderPlan';
import type {
  MotionRenderEngine,
  MotionRenderSourceFile,
} from '@/lib/providers/video/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

type MotionPreviewSourceRequestBody = Record<string, unknown>;

const VALID_RENDER_ENGINES = new Set<MotionRenderEngine>(['remotion', 'hyperframes']);

function jsonError(status: number, error: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error, ...extra }, { status });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export async function POST(request: Request): Promise<Response> {
  let body: MotionPreviewSourceRequestBody;
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
  const plan = buildMotionRenderPlan(project, {
    engine,
    draftId,
    fps,
    requestedAt,
  });
  const previewPlan = buildMotionPreviewPlan(project, {
    engines: [engine],
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
      previewSource: null,
      reviewPlan: buildMotionReviewPlan(project),
      previewPlan,
    });
  }

  const requestForSource = buildMotionRenderRequest(project, plan);
  const runtimePreview =
    previewPlan.enginePreviews.find((preview) => preview.engine === engine)?.runtimePreview ??
    null;
  const sourceFiles = requestForSource.sourceFiles ?? [];
  const entryFile = findSourceFile(sourceFiles, 'entry');
  const timelineFile = findSourceFile(sourceFiles, 'timeline');
  const manifestFile = findSourceFile(sourceFiles, 'manifest');

  return NextResponse.json({
    ok: true,
    status: 'ready',
    project,
    plan,
    request: requestForSource,
    previewSource: {
      id: `preview-source-${requestForSource.id}`,
      projectId: project.id,
      draftId: requestForSource.draftId,
      engine,
      runtimeKind:
        runtimePreview?.kind ?? (engine === 'remotion' ? 'remotion-player' : 'hyperframes-iframe'),
      label: runtimePreview?.label ?? (engine === 'remotion' ? 'Remotion Player' : 'HyperFrames iframe'),
      mountLabel:
        runtimePreview?.mountLabel ??
        (engine === 'remotion' ? 'Mount Remotion Player' : 'Mount HyperFrames iframe'),
      compositionId: requestForSource.compositionId,
      entryPoint: entryFile?.path ?? (engine === 'remotion' ? 'remotion/index.tsx' : 'index.html'),
      durationSeconds: requestForSource.durationFrames / requestForSource.fps,
      fps: requestForSource.fps,
      sourceHostRequirement:
        runtimePreview?.sourceHostRequirement ??
        'Serve the source bundle to the same-shell preview runtime.',
      editLinkLabels: runtimePreview?.editLinkLabels ?? [],
      runtimeHost: buildRuntimeHost(engine, entryFile?.path),
      sourceHost: {
        apiRoute: '/api/motion/preview-source',
        entryPath: entryFile?.path ?? null,
        timelinePath: timelineFile?.path ?? null,
        manifestPath: manifestFile?.path ?? null,
        sourceFileCount: sourceFiles.length,
      },
      sourceFiles,
    },
    reviewPlan: buildMotionReviewPlan(project),
    previewPlan,
  });
}

function buildRuntimeHost(engine: MotionRenderEngine, entryPath: string | undefined) {
  if (engine === 'remotion') {
    const path = entryPath ?? 'remotion/index.tsx';
    return {
      status: 'needs-player-adapter' as const,
      previewSurface: 'player' as const,
      dependencyLabels: ['@remotion/player', 'remotion', '@remotion/media'],
      adapterRequirement: `Compile ${path} into a Remotion Player component before same-shell playback.`,
    };
  }

  return {
    status: 'embedded-preview' as const,
    previewSurface: 'iframe' as const,
    dependencyLabels: ['HTML preview frame', 'GSAP timeline'],
    adapterRequirement: null,
  };
}

function parseEngine(value: unknown): MotionRenderEngine | null {
  if (value === undefined) return 'remotion';
  if (typeof value === 'string' && VALID_RENDER_ENGINES.has(value as MotionRenderEngine)) {
    return value as MotionRenderEngine;
  }
  return null;
}

function findSourceFile(
  files: MotionRenderSourceFile[],
  kind: MotionRenderSourceFile['kind']
): MotionRenderSourceFile | null {
  return files.find((file) => file.kind === kind) ?? null;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function numericValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
