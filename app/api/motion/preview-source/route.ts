import { NextResponse } from 'next/server';
import type { MotionProject } from '@/lib/motion/project';
import { appendPreparedPreviewSourceExecutionHistory } from '@/lib/motion/executionHistory';
import {
  buildMotionPreviewPlan,
  summarizeMotionRenderSourcePackageFromSourceFiles,
} from '@/lib/motion/previewPlan';
import { buildMotionReviewPlan } from '@/lib/motion/reviewPlan';
import type { MotionPreparedPreviewSource } from '@/lib/motion/start';
import { buildMotionRenderRequest } from '@/lib/motion/renderExecution';
import { buildMotionRenderPlan } from '@/lib/motion/renderPlan';
import type {
  MotionRenderEngine,
  MotionRenderSourceFile,
} from '@/lib/providers/video/types';
import type { WorkflowEngine } from '@/lib/workflow/registry';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

type MotionPreviewSourceRequestBody = Record<string, unknown>;

const VALID_RENDER_ENGINES = new Set<MotionRenderEngine>(['remotion', 'hyperframes']);
const VALID_WORKFLOW_ENGINES = new Set<WorkflowEngine>([
  'remotion',
  'hyperframes',
  'provider',
]);

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
  const previewEngines = parseRequestedEngines(body.requestedEngines, engine);
  const plan = buildMotionRenderPlan(project, {
    engine,
    draftId,
    fps,
    requestedAt,
  });
  const previewPlan = buildMotionPreviewPlan(project, {
    engines: previewEngines,
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
  const sourcePackage = summarizeMotionRenderSourcePackageFromSourceFiles(sourceFiles);
  const previewSource: MotionPreparedPreviewSource = {
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
    runtimeHost: buildRuntimeHost(engine),
    sourcePackage,
    sourceHost: {
      apiRoute: '/api/motion/preview-source',
      entryPath: entryFile?.path ?? null,
      timelinePath: timelineFile?.path ?? null,
      manifestPath: manifestFile?.path ?? null,
      sourceFileCount: sourceFiles.length,
    },
    sourceFiles,
  };
  const projectWithExecutionHistory: MotionProject = {
    ...project,
    executionHistory: appendPreparedPreviewSourceExecutionHistory(
      project.executionHistory,
      previewSource,
      requestedAt
    ),
    updatedAt: requestedAt,
  };

  return NextResponse.json({
    ok: true,
    status: 'ready',
    project: projectWithExecutionHistory,
    plan,
    request: requestForSource,
    previewSource,
    reviewPlan: buildMotionReviewPlan(projectWithExecutionHistory),
    previewPlan: buildMotionPreviewPlan(projectWithExecutionHistory, {
      engines: previewEngines,
      fps,
      requestedAt,
    }),
  });
}

function buildRuntimeHost(engine: MotionRenderEngine) {
  if (engine === 'remotion') {
    const timelinePath = 'timeline/draft-primary.json';
    return {
      status: 'source-ready' as const,
      previewSurface: 'player' as const,
      dependencyLabels: ['@remotion/player', 'remotion', '@remotion/media'],
      adapterRequirement: `aether Player adapter mounts ${timelinePath} through @remotion/player.`,
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

function parseRequestedEngines(
  value: unknown,
  selectedEngine: MotionRenderEngine
): WorkflowEngine[] {
  if (!Array.isArray(value)) return [selectedEngine];
  const engines = value.filter(
    (candidate): candidate is WorkflowEngine =>
      typeof candidate === 'string' && VALID_WORKFLOW_ENGINES.has(candidate as WorkflowEngine)
  );
  return Array.from(new Set([...engines, selectedEngine]));
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
