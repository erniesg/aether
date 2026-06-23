import {
  applyMotionTimelineRevision,
  type MotionTimelineRevisionOperation,
} from './revise';
import type { MotionProject, TimelineClip, TimelineTrack } from './project';

export type MotionSourceBundleEditStatus = 'applied' | 'blocked' | 'noop';

export interface MotionSourceBundleEditFile {
  path: string;
  contents: string;
}

export interface ApplyMotionSourceBundleEditsInput {
  id?: string;
  requestedAt: number;
  updatedAt?: number;
  files: MotionSourceBundleEditFile[];
}

export interface MotionSourceBundleAppliedEdit {
  kind: 'timeline-clip';
  path: string;
  draftId: string;
  trackId: string;
  clipId: string;
  changedFields: string[];
}

export interface MotionSourceBundleEditBlocker {
  id: string;
  path: string;
  message: string;
}

export interface ApplyMotionSourceBundleEditsResult {
  status: MotionSourceBundleEditStatus;
  project: MotionProject;
  appliedEdits: MotionSourceBundleAppliedEdit[];
  blockers: MotionSourceBundleEditBlocker[];
  operationCount: number;
  sourcePaths: string[];
}

interface TimelineEditPlan {
  operations: MotionTimelineRevisionOperation[];
  appliedEdits: MotionSourceBundleAppliedEdit[];
  blockers: MotionSourceBundleEditBlocker[];
}

export function applyMotionSourceBundleEdits(
  project: MotionProject,
  input: ApplyMotionSourceBundleEditsInput
): ApplyMotionSourceBundleEditsResult {
  if (input.files.length === 0) {
    return blocked(project, input, [
      {
        id: 'source-edit-files-required',
        path: '',
        message: 'At least one edited source file is required.',
      },
    ]);
  }

  const plans = input.files.map((file) => planSourceFileEdits(project, file));
  const blockers = plans.flatMap((plan) => plan.blockers);
  const operations = plans.flatMap((plan) => plan.operations);
  const appliedEdits = plans.flatMap((plan) => plan.appliedEdits);

  if (blockers.length > 0) {
    return blocked(project, input, blockers);
  }

  if (operations.length === 0) {
    return {
      status: 'noop',
      project,
      appliedEdits: [],
      blockers: [],
      operationCount: 0,
      sourcePaths: input.files.map((file) => file.path),
    };
  }

  const revisionId = input.id ?? `source-edit-${input.requestedAt}`;
  try {
    const revisedProject = applyMotionTimelineRevision(project, {
      id: revisionId,
      requestedAt: input.requestedAt,
      updatedAt: input.updatedAt ?? input.requestedAt,
      operations,
    });

    return {
      status: 'applied',
      project: revisedProject,
      appliedEdits,
      blockers: [],
      operationCount: operations.length,
      sourcePaths: input.files.map((file) => file.path),
    };
  } catch (error) {
    return blocked(project, input, [
      {
        id: 'source-edit-revision-rejected',
        path: appliedEdits[0]?.path ?? input.files[0]?.path ?? '',
        message: error instanceof Error ? error.message : String(error),
      },
    ]);
  }
}

function planSourceFileEdits(
  project: MotionProject,
  file: MotionSourceBundleEditFile
): TimelineEditPlan {
  const normalizedPath = normalizePath(file.path);
  const pathDraftId = draftIdFromTimelinePath(normalizedPath);
  if (!pathDraftId) {
    return {
      operations: [],
      appliedEdits: [],
      blockers: [
        {
          id: 'source-edit-unsupported-file',
          path: file.path,
          message: 'Only editable timeline JSON source files are supported by source-edit.',
        },
      ],
    };
  }

  let artifact: unknown;
  try {
    artifact = JSON.parse(file.contents);
  } catch {
    return {
      operations: [],
      appliedEdits: [],
      blockers: [
        {
          id: 'source-edit-invalid-json',
          path: file.path,
          message: 'Timeline source file must contain valid JSON.',
        },
      ],
    };
  }

  if (!isObject(artifact)) {
    return {
      operations: [],
      appliedEdits: [],
      blockers: [
        {
          id: 'source-edit-invalid-timeline',
          path: file.path,
          message: 'Timeline source file must be a JSON object.',
        },
      ],
    };
  }

  const draftId = stringValue(artifact.draftId) ?? pathDraftId;
  if (draftId !== pathDraftId) {
    return {
      operations: [],
      appliedEdits: [],
      blockers: [
        {
          id: 'source-edit-draft-mismatch',
          path: file.path,
          message: `Timeline file path targets ${pathDraftId}, but JSON targets ${draftId}.`,
        },
      ],
    };
  }

  if (stringValue(artifact.projectId) && stringValue(artifact.projectId) !== project.id) {
    return {
      operations: [],
      appliedEdits: [],
      blockers: [
        {
          id: 'source-edit-project-mismatch',
          path: file.path,
          message: `Timeline JSON belongs to ${artifact.projectId}, not ${project.id}.`,
        },
      ],
    };
  }

  if (!Array.isArray(artifact.tracks)) {
    return {
      operations: [],
      appliedEdits: [],
      blockers: [
        {
          id: 'source-edit-tracks-required',
          path: file.path,
          message: 'Timeline JSON must include a tracks array.',
        },
      ],
    };
  }

  return timelineEditsForTracks(project, {
    path: file.path,
    draftId,
    tracks: artifact.tracks,
  });
}

function timelineEditsForTracks(
  project: MotionProject,
  input: { path: string; draftId: string; tracks: unknown[] }
): TimelineEditPlan {
  const baselineTracks = tracksForDraft(project, input.draftId);
  if (!baselineTracks) {
    return {
      operations: [],
      appliedEdits: [],
      blockers: [
        {
          id: 'source-edit-draft-not-found',
          path: input.path,
          message: `Motion draft not found: ${input.draftId}`,
        },
      ],
    };
  }

  const trackMap = new Map(baselineTracks.map((track) => [track.id, track]));
  const operations: MotionTimelineRevisionOperation[] = [];
  const appliedEdits: MotionSourceBundleAppliedEdit[] = [];
  const blockers: MotionSourceBundleEditBlocker[] = [];

  input.tracks.forEach((candidateTrack, trackIndex) => {
    if (!isObject(candidateTrack)) {
      blockers.push({
        id: 'source-edit-track-invalid',
        path: input.path,
        message: `Timeline track at index ${trackIndex} must be an object.`,
      });
      return;
    }

    const trackId = stringValue(candidateTrack.id);
    if (!trackId || !Array.isArray(candidateTrack.clips)) {
      blockers.push({
        id: 'source-edit-track-invalid',
        path: input.path,
        message: `Timeline track at index ${trackIndex} must include id and clips.`,
      });
      return;
    }

    const baselineTrack = trackMap.get(trackId);
    if (!baselineTrack) {
      blockers.push({
        id: 'source-edit-track-not-found',
        path: input.path,
        message: `Motion timeline track not found: ${trackId}`,
      });
      return;
    }

    const clipMap = new Map(baselineTrack.clips.map((clip) => [clip.id, clip]));
    candidateTrack.clips.forEach((candidateClip, clipIndex) => {
      const planned = timelineEditForClip({
        path: input.path,
        draftId: input.draftId,
        trackId,
        clipIndex,
        clipMap,
        candidateClip,
      });
      operations.push(...planned.operations);
      appliedEdits.push(...planned.appliedEdits);
      blockers.push(...planned.blockers);
    });
  });

  return { operations, appliedEdits, blockers };
}

function timelineEditForClip(input: {
  path: string;
  draftId: string;
  trackId: string;
  clipIndex: number;
  clipMap: Map<string, TimelineClip>;
  candidateClip: unknown;
}): TimelineEditPlan {
  const blockers: MotionSourceBundleEditBlocker[] = [];
  if (!isObject(input.candidateClip)) {
    return {
      operations: [],
      appliedEdits: [],
      blockers: [
        {
          id: 'source-edit-clip-invalid',
          path: input.path,
          message: `Timeline clip at ${input.trackId}[${input.clipIndex}] must be an object.`,
        },
      ],
    };
  }

  const clipId = stringValue(input.candidateClip.id);
  if (!clipId) {
    return {
      operations: [],
      appliedEdits: [],
      blockers: [
        {
          id: 'source-edit-clip-invalid',
          path: input.path,
          message: `Timeline clip at ${input.trackId}[${input.clipIndex}] must include id.`,
        },
      ],
    };
  }

  const baselineClip = input.clipMap.get(clipId);
  if (!baselineClip) {
    return {
      operations: [],
      appliedEdits: [],
      blockers: [
        {
          id: 'source-edit-clip-not-found',
          path: input.path,
          message: `Motion timeline clip not found: ${clipId}`,
        },
      ],
    };
  }

  const startFrame = numericValue(input.candidateClip.startFrame);
  const durationFrames = numericValue(input.candidateClip.durationFrames);
  const componentId = optionalStringValue(input.candidateClip.componentId);
  const props = input.candidateClip.props;
  if (startFrame === undefined || durationFrames === undefined || !isObject(props)) {
    return {
      operations: [],
      appliedEdits: [],
      blockers: [
        {
          id: 'source-edit-clip-invalid',
          path: input.path,
          message: `Timeline clip ${clipId} must include numeric startFrame, numeric durationFrames, and object props.`,
        },
      ],
    };
  }

  const operations: MotionTimelineRevisionOperation[] = [];
  const changedFields: string[] = [];
  if (startFrame !== baselineClip.startFrame || durationFrames !== baselineClip.durationFrames) {
    operations.push({
      kind: 'retime-clip',
      clipId,
      ...(startFrame === baselineClip.startFrame ? {} : { startFrame }),
      ...(durationFrames === baselineClip.durationFrames ? {} : { durationFrames }),
    });
    if (startFrame !== baselineClip.startFrame) changedFields.push('startFrame');
    if (durationFrames !== baselineClip.durationFrames) changedFields.push('durationFrames');
  }

  if (componentId !== baselineClip.componentId) {
    operations.push({
      kind: 'replace-component',
      clipId,
      componentId: componentId ?? '',
    });
    changedFields.push('componentId');
  }

  const propChanges = changedPropFields(baselineClip.props, props);
  if (propChanges.length > 0) {
    operations.push({
      kind: 'replace-clip-props',
      clipId,
      props,
    });
    changedFields.push(...propChanges);
  }

  if (changedFields.length === 0) {
    return { operations: [], appliedEdits: [], blockers };
  }

  return {
    operations,
    appliedEdits: [
      {
        kind: 'timeline-clip',
        path: input.path,
        draftId: input.draftId,
        trackId: input.trackId,
        clipId,
        changedFields: uniqueStrings(changedFields),
      },
    ],
    blockers,
  };
}

function tracksForDraft(project: MotionProject, draftId: string): TimelineTrack[] | null {
  const draft = project.drafts.find((candidate) => candidate.id === draftId);
  if (!draft) return null;
  return draft.tracks.length > 0 ? draft.tracks : project.tracks;
}

function draftIdFromTimelinePath(path: string): string | null {
  return /^timeline\/([^/]+)\.json$/.exec(path)?.[1] ?? null;
}

function normalizePath(path: string): string {
  return path.replace(/^\.\//, '').replace(/^\/+/, '');
}

function changedPropFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>
): string[] {
  return uniqueStrings([...Object.keys(before), ...Object.keys(after)])
    .filter((key) => canonicalJson(before[key]) !== canonicalJson(after[key]))
    .map((key) => `props.${key}`);
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!isObject(value)) return value;

  return Object.keys(value)
    .sort()
    .reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = canonicalValue(value[key]);
      return acc;
    }, {});
}

function blocked(
  project: MotionProject,
  input: ApplyMotionSourceBundleEditsInput,
  blockers: MotionSourceBundleEditBlocker[]
): ApplyMotionSourceBundleEditsResult {
  return {
    status: 'blocked',
    project,
    appliedEdits: [],
    blockers,
    operationCount: 0,
    sourcePaths: input.files.map((file) => file.path),
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function optionalStringValue(value: unknown): string | undefined {
  return value === undefined ? undefined : stringValue(value);
}

function numericValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values));
}
