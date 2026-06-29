import { NextResponse } from 'next/server';
import type { WorkflowEngine } from '@/lib/workflow/registry';
import type {
  MotionInteractiveMarkerInput,
  MotionInteractiveMarkerKind,
  MotionProject,
} from '@/lib/motion/project';
import { buildAgentMotionCapturePlan } from '@/lib/motion/capturePlan';
import { buildMotionPreviewPlan } from '@/lib/motion/previewPlan';
import { buildMotionReviewPlan } from '@/lib/motion/reviewPlan';
import {
  applyMotionTimelineRevision,
  type MotionSourceKeyframe,
  type MotionTimelineRevisionOperation,
} from '@/lib/motion/revise';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

type MotionReviseRequestBody = Record<string, unknown>;

const VALID_ENGINES = new Set<WorkflowEngine>(['remotion', 'hyperframes', 'provider']);
const VALID_INTERACTIVE_MARKER_KINDS = new Set<MotionInteractiveMarkerKind>([
  'chapter',
  'hotspot',
  'callout',
  'branch',
  'link',
  'analytics',
]);

function jsonError(status: number, error: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error, ...extra }, { status });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export async function POST(request: Request): Promise<Response> {
  let body: MotionReviseRequestBody;
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

  const operations = parseOperations(body.operations);
  if (!operations) {
    return jsonError(400, 'operations must be a non-empty revision operation array');
  }

  const requestedEngines = parseRequestedEngines(body.requestedEngines);
  if (body.requestedEngines !== undefined && !requestedEngines) {
    return jsonError(400, 'requestedEngines must contain remotion, hyperframes, or provider');
  }

  const requestedAt = numericValue(body.requestedAt) ?? Date.now();
  const revisionId = stringValue(body.id) ?? `revision-${requestedAt}`;

  try {
    const project = applyMotionTimelineRevision(body.project as unknown as MotionProject, {
      id: revisionId,
      requestedAt,
      updatedAt: numericValue(body.updatedAt) ?? requestedAt,
      operations,
    });
    const capturePlan = buildAgentMotionCapturePlan(project);

    return NextResponse.json({
      ok: true,
      project,
      reviewPlan: buildMotionReviewPlan(project),
      previewPlan: buildMotionPreviewPlan(project, {
        engines: requestedEngines ?? undefined,
        requestedAt,
      }),
      capturePlan: capturePlan.status === 'not-needed' ? null : capturePlan,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonError(400, message, { code: 'motion_revision_failed' });
  }
}

function parseOperations(value: unknown): MotionTimelineRevisionOperation[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;

  const operations = value.flatMap((candidate): MotionTimelineRevisionOperation[] => {
    if (!isObject(candidate)) return [];
    const kind = stringValue(candidate.kind);

    if (kind === 'update-story-beat') {
      const beatId = stringValue(candidate.beatId);
      if (!beatId) return [];
      return [
        {
          kind,
          beatId,
          ...(stringValue(candidate.narration) === undefined
            ? {}
            : { narration: stringValue(candidate.narration) }),
          ...(numericValue(candidate.targetSeconds) === undefined
            ? {}
            : { targetSeconds: numericValue(candidate.targetSeconds) }),
        },
      ];
    }

    if (kind === 'update-clip-props' || kind === 'replace-clip-props') {
      const clipId = stringValue(candidate.clipId);
      if (!clipId || !isObject(candidate.props)) return [];
      return [{ kind, clipId, props: candidate.props }];
    }

    if (kind === 'replace-clip-asset') {
      const clipId = stringValue(candidate.clipId);
      const assetId = stringValue(candidate.assetId);
      const assetUrl = stringValue(candidate.assetUrl);
      const captureArtifactKind = stringValue(candidate.captureArtifactKind);
      const mimeType = stringValue(candidate.mimeType);
      const crop = stringValue(candidate.crop);
      const zoom = numericValue(candidate.zoom);
      const cursorPath = stringValue(candidate.cursorPath);
      const sourceAssetId = stringValue(candidate.sourceAssetId);
      if (!clipId || !assetId) return [];
      return [
        {
          kind,
          clipId,
          assetId,
          ...(assetUrl === undefined ? {} : { assetUrl }),
          ...(captureArtifactKind === undefined ? {} : { captureArtifactKind }),
          ...(mimeType === undefined ? {} : { mimeType }),
          ...(crop === undefined ? {} : { crop }),
          ...(zoom === undefined ? {} : { zoom }),
          ...(cursorPath === undefined ? {} : { cursorPath }),
          ...(sourceAssetId === undefined ? {} : { sourceAssetId }),
        },
      ];
    }

    if (kind === 'update-clip-source-keyframes') {
      const clipId = stringValue(candidate.clipId);
      const keyframes = parseSourceKeyframes(candidate.keyframes);
      if (!clipId || !keyframes) return [];
      return [{ kind, clipId, keyframes }];
    }

    if (kind === 'upsert-interactive-marker') {
      const marker = parseInteractiveMarker(candidate.marker);
      if (!marker) return [];
      return [{ kind, marker }];
    }

    if (kind === 'remove-interactive-marker') {
      const markerId = stringValue(candidate.markerId);
      if (!markerId) return [];
      return [{ kind, markerId }];
    }

    if (kind === 'retime-clip') {
      const clipId = stringValue(candidate.clipId);
      if (!clipId) return [];
      return [
        {
          kind,
          clipId,
          ...(numericValue(candidate.startFrame) === undefined
            ? {}
            : { startFrame: numericValue(candidate.startFrame) }),
          ...(numericValue(candidate.durationFrames) === undefined
            ? {}
            : { durationFrames: numericValue(candidate.durationFrames) }),
        },
      ];
    }

    if (kind === 'replace-component') {
      const clipId = stringValue(candidate.clipId);
      const componentId = stringValue(candidate.componentId);
      if (!clipId || !componentId) return [];
      return [
        {
          kind,
          clipId,
          componentId,
          ...(isObject(candidate.props) ? { props: candidate.props } : {}),
        },
      ];
    }

    return [];
  });

  return operations.length === value.length ? operations : null;
}

function parseInteractiveMarker(value: unknown): MotionInteractiveMarkerInput | null {
  if (!isObject(value)) return null;

  const id = stringValue(value.id);
  const kind = stringValue(value.kind);
  const label = stringValue(value.label);
  const timeSeconds = numericValue(value.timeSeconds);
  const durationSeconds = numericValue(value.durationSeconds);
  const metadataLabels = parseStringArray(value.metadataLabels);
  if (
    !id ||
    !kind ||
    !VALID_INTERACTIVE_MARKER_KINDS.has(kind as MotionInteractiveMarkerKind) ||
    !label ||
    timeSeconds === undefined ||
    durationSeconds === undefined ||
    !metadataLabels
  ) {
    return null;
  }

  const beatId = stringValue(value.beatId);
  const clipId = stringValue(value.clipId);
  const componentLabel = stringValue(value.componentLabel);
  const targetLabel = stringValue(value.targetLabel);
  const targetDraftId = stringValue(value.targetDraftId);
  const targetFormat = stringValue(value.targetFormat);
  const href = stringValue(value.href);

  return {
    id,
    kind: kind as MotionInteractiveMarkerKind,
    label,
    timeSeconds,
    durationSeconds,
    ...(beatId === undefined ? {} : { beatId }),
    ...(clipId === undefined ? {} : { clipId }),
    ...(componentLabel === undefined ? {} : { componentLabel }),
    ...(targetLabel === undefined ? {} : { targetLabel }),
    ...(targetDraftId === undefined ? {} : { targetDraftId }),
    ...(targetFormat === undefined ? {} : { targetFormat }),
    ...(href === undefined ? {} : { href }),
    metadataLabels,
  };
}

function parseSourceKeyframes(value: unknown): MotionSourceKeyframe[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;

  const keyframes = value.flatMap((candidate): MotionSourceKeyframe[] => {
    if (!isObject(candidate)) return [];
    const atFrame = numericValue(candidate.atFrame);
    if (atFrame === undefined) return [];

    const crop = stringValue(candidate.crop);
    const zoom = numericValue(candidate.zoom);
    const cursorPath = stringValue(candidate.cursorPath);
    const label = stringValue(candidate.label);
    if (candidate.crop !== undefined && crop === undefined) return [];
    if (candidate.zoom !== undefined && zoom === undefined) return [];
    if (candidate.cursorPath !== undefined && cursorPath === undefined) return [];
    if (candidate.label !== undefined && label === undefined) return [];

    return [
      {
        atFrame,
        ...(crop === undefined ? {} : { crop }),
        ...(zoom === undefined ? {} : { zoom }),
        ...(cursorPath === undefined ? {} : { cursorPath }),
        ...(label === undefined ? {} : { label }),
      },
    ];
  });

  return keyframes.length === value.length ? keyframes : null;
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

function parseStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const strings = value.filter((item): item is string => typeof item === 'string');
  return strings.length === value.length ? strings : null;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function numericValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
