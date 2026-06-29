import { NextResponse } from 'next/server';
import type { WorkflowEngine } from '@/lib/workflow/registry';
import type { MotionProject } from '@/lib/motion/project';
import { buildMotionPreviewPlan } from '@/lib/motion/previewPlan';
import { buildMotionReviewPlan } from '@/lib/motion/reviewPlan';
import type { MotionSourcePatchAuthoringRequest } from '@/lib/motion/sourcePatchDraft';
import { applyMotionSourceBundleEdits } from '@/lib/motion/sourceBundleApply';
import {
  listMotionSourceAuthorProviders,
  MotionSourceAuthorProviderUnavailableError,
  resolveMotionSourceAuthorProvider,
} from '@/lib/providers/source-author/registry';
import { ensureConfiguredMotionSourceAuthorProviders } from '@/lib/providers/source-author/configured';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

type MotionSourceAuthorRequestBody = Record<string, unknown>;

const VALID_ENGINES = new Set<WorkflowEngine>(['remotion', 'hyperframes', 'provider']);

function jsonError(status: number, error: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error, ...extra }, { status });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export async function POST(request: Request): Promise<Response> {
  ensureConfiguredMotionSourceAuthorProviders();

  let body: MotionSourceAuthorRequestBody;
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

  if (!isObject(body.authoringRequest)) {
    return jsonError(400, 'authoringRequest is required');
  }

  const requestedEngines = parseRequestedEngines(body.requestedEngines);
  if (body.requestedEngines !== undefined && !requestedEngines) {
    return jsonError(400, 'requestedEngines must contain remotion, hyperframes, or provider');
  }

  const fps = numericValue(body.fps);
  if (body.fps !== undefined && (!fps || fps <= 0)) {
    return jsonError(400, 'fps must be a positive number');
  }

  const project = body.project as unknown as MotionProject;
  const authoringRequest = body.authoringRequest as unknown as MotionSourcePatchAuthoringRequest;
  if (!Array.isArray(authoringRequest.sourceFiles) || authoringRequest.sourceFiles.length === 0) {
    return jsonError(400, 'authoringRequest.sourceFiles must be a non-empty array');
  }

  const requestedAt = numericValue(body.requestedAt) ?? Date.now();
  const updatedAt = numericValue(body.updatedAt) ?? requestedAt;

  try {
    const provider = resolveMotionSourceAuthorProvider(stringValue(body.providerId));
    const authoringResult = await provider.author(authoringRequest);
    const sourceEditResult = applyMotionSourceBundleEdits(project, {
      id: authoringRequest.sourceEditId,
      requestedAt,
      updatedAt,
      files: authoringResult.files,
    });
    const updatedProject = sourceEditResult.project;

    return NextResponse.json({
      ok: true,
      status: sourceEditResult.status === 'applied' ? 'authored' : sourceEditResult.status,
      project: updatedProject,
      selectedRequest: authoringRequest,
      authoringResult,
      sourceEditResult,
      blockers: sourceEditResult.blockers,
      reviewPlan: buildMotionReviewPlan(updatedProject),
      previewPlan: buildMotionPreviewPlan(updatedProject, {
        engines: requestedEngines ?? undefined,
        fps,
        requestedAt,
      }),
      providers: listMotionSourceAuthorProviders(),
    });
  } catch (error) {
    if (error instanceof MotionSourceAuthorProviderUnavailableError) {
      return NextResponse.json({
        ok: true,
        status: 'provider-required',
        project,
        selectedRequest: authoringRequest,
        authoringResult: null,
        sourceEditResult: null,
        blockers: [
          {
            id: 'source-author-provider-required',
            label: error.message,
          },
        ],
        reviewPlan: buildMotionReviewPlan(project),
        previewPlan: buildMotionPreviewPlan(project, {
          engines: requestedEngines ?? undefined,
          fps,
          requestedAt,
        }),
        providers: listMotionSourceAuthorProviders(),
      });
    }

    const message = error instanceof Error ? error.message : String(error);
    return jsonError(502, message, { code: 'motion_source_author_failed' });
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
