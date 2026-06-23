import { NextResponse } from 'next/server';
import type { WorkflowEngine, WorkflowSourceKind } from '@/lib/workflow/registry';
import type { MotionPlatformTarget } from '@/lib/motion/project';
import type { MotionWorkflowIntent } from '@/lib/motion/workflowRouter';
import type { MotionWorkflowPlanSourceRef } from '@/lib/motion/workflowPlan';
import { startAgentMotionWorkflow } from '@/lib/motion/start';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

type MotionStartRequestBody = Record<string, unknown>;

const VALID_SOURCE_KINDS = new Set<WorkflowSourceKind>([
  'repo',
  'pr',
  'site',
  'capture',
  'upload',
  'reference',
  'remotion',
  'hyperframes',
]);
const VALID_INTENTS = new Set<MotionWorkflowIntent>([
  'launch',
  'feature',
  'demo',
  'social',
  'pr',
  'website',
  'caption-overlay',
  'motion-graphic',
  'port',
]);
const VALID_ENGINES = new Set<WorkflowEngine>(['remotion', 'hyperframes', 'provider']);
const VALID_PLATFORMS = new Set(['x', 'linkedin', 'youtube', 'tiktok', 'instagram', 'website', 'deck']);
const VALID_ASPECT_RATIOS = new Set(['16:9', '9:16', '1:1', '4:5']);

function jsonError(status: number, error: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error, ...extra }, { status });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export async function POST(request: Request): Promise<Response> {
  let body: MotionStartRequestBody;
  try {
    const parsed = await request.json();
    if (!isObject(parsed)) return jsonError(400, 'body must be a JSON object');
    body = parsed;
  } catch {
    return jsonError(400, 'request body must be JSON');
  }

  const workspaceId = stringValue(body.workspaceId);
  if (!workspaceId) return jsonError(400, 'workspaceId is required');

  const sourceRefs = parseSourceRefs(body);
  if (sourceRefs.length === 0) {
    return jsonError(400, 'Add a repoPath, repoUrl, siteUrl, prRef, or sourceRefs entry');
  }

  const mode = parseMode(body.mode);
  if (!mode) return jsonError(400, 'mode must be review or full-auto');

  const intent = parseIntent(body.intent);
  if (body.intent !== undefined && !intent) return jsonError(400, 'intent is not supported');

  const platformTargets = parsePlatformTargets(body.platformTargets);
  if (!platformTargets) {
    return jsonError(400, 'platformTargets must contain supported platform, aspectRatio, and seconds');
  }

  const requestedEngines = parseRequestedEngines(body.requestedEngines);
  if (body.requestedEngines !== undefined && !requestedEngines) {
    return jsonError(400, 'requestedEngines must contain remotion, hyperframes, or provider');
  }

  try {
    const result = await startAgentMotionWorkflow(
      {
        id: stringValue(body.id) ?? defaultMotionId(sourceRefs, numericValue(body.createdAt)),
        workspaceId,
        intent,
        mode,
        sourceRefs,
        audience: stringValue(body.audience) ?? 'builders and creators',
        tone: stringValue(body.tone) ?? 'clear, visual, product-led',
        platformTargets,
        requestedEngines: requestedEngines ?? undefined,
        createdAt: numericValue(body.createdAt) ?? Date.now(),
      },
      {
        cwd: stringValue(body.cwd),
        maxFiles: numericValue(body.maxFiles),
      }
    );

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonError(400, message, { code: 'motion_start_failed' });
  }
}

function parseSourceRefs(body: MotionStartRequestBody): MotionWorkflowPlanSourceRef[] {
  const refs: MotionWorkflowPlanSourceRef[] = [];
  const rawRefs = body.sourceRefs;
  if (Array.isArray(rawRefs)) {
    for (const candidate of rawRefs) {
      if (!isObject(candidate)) continue;
      const kind = stringValue(candidate.kind);
      const ref = stringValue(candidate.ref);
      if (!kind || !ref || !VALID_SOURCE_KINDS.has(kind as WorkflowSourceKind)) continue;
      refs.push({
        kind: kind as WorkflowSourceKind,
        ref,
        label: stringValue(candidate.label),
      });
    }
  }

  pushShorthandSource(refs, 'repo', body.repoPath, 'Local repo');
  pushShorthandSource(refs, 'repo', body.repoUrl, 'Repo');
  pushShorthandSource(refs, 'site', body.siteUrl, 'Site');
  pushShorthandSource(refs, 'pr', body.prRef, 'Pull request');

  return dedupeSources(refs);
}

function pushShorthandSource(
  refs: MotionWorkflowPlanSourceRef[],
  kind: WorkflowSourceKind,
  value: unknown,
  label: string
): void {
  const ref = stringValue(value);
  if (!ref) return;
  refs.push({ kind, ref, label });
}

function parseMode(value: unknown): 'review' | 'full-auto' | null {
  if (value === undefined) return 'review';
  return value === 'review' || value === 'full-auto' ? value : null;
}

function parseIntent(value: unknown): MotionWorkflowIntent | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'string' && VALID_INTENTS.has(value as MotionWorkflowIntent)) {
    return value as MotionWorkflowIntent;
  }
  return undefined;
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

function parsePlatformTargets(value: unknown): MotionPlatformTarget[] | null {
  if (value === undefined) {
    return [{ platform: 'x', aspectRatio: '9:16', seconds: 30 }];
  }
  if (!Array.isArray(value) || value.length === 0) return null;

  const targets = value.flatMap((candidate): MotionPlatformTarget[] => {
    if (!isObject(candidate)) return [];
    const platform = stringValue(candidate.platform);
    const aspectRatio = stringValue(candidate.aspectRatio);
    const seconds = numericValue(candidate.seconds);
    if (
      !platform ||
      !aspectRatio ||
      !VALID_PLATFORMS.has(platform) ||
      !VALID_ASPECT_RATIOS.has(aspectRatio) ||
      !seconds ||
      seconds <= 0
    ) {
      return [];
    }

    return [
      {
        platform: platform as MotionPlatformTarget['platform'],
        aspectRatio: aspectRatio as MotionPlatformTarget['aspectRatio'],
        seconds,
      },
    ];
  });

  return targets.length === value.length ? targets : null;
}

function defaultMotionId(
  sourceRefs: MotionWorkflowPlanSourceRef[],
  createdAt: number | undefined
): string {
  const source = sourceRefs[0];
  const sourceSlug = slugify(source?.ref ?? 'source');
  return `motion-${source?.kind ?? 'source'}-${sourceSlug}-${createdAt ?? Date.now()}`;
}

function dedupeSources(sourceRefs: MotionWorkflowPlanSourceRef[]): MotionWorkflowPlanSourceRef[] {
  const seen = new Set<string>();
  return sourceRefs.filter((source) => {
    const key = `${source.kind}:${source.ref}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function numericValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || 'source';
}
