import {
  applyMotionTimelineRevision,
  type MotionTimelineRevisionOperation,
} from './revise';
import { appendSourceEditExecutionHistory } from './executionHistory';
import { getMotionEffectPreset, motionEffectPresetOrDefault } from './effectPresets';
import { DEFAULT_MOTION_FPS, motionFrames } from './project';
import type { MotionProject, StoryBeat, TimelineClip, TimelineTrack } from './project';
import type { MotionSyncEffectCueKind } from './syncPlan';

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

export type MotionSourceBundleAppliedEdit =
  | MotionSourceBundleAppliedTimelineClipEdit
  | MotionSourceBundleAppliedStoryBeatEdit;

export interface MotionSourceBundleAppliedTimelineClipEdit {
  kind: 'timeline-clip';
  path: string;
  draftId: string;
  trackId: string;
  clipId: string;
  changedFields: string[];
}

export interface MotionSourceBundleAppliedStoryBeatEdit {
  kind: 'story-beat';
  path: string;
  draftId: string;
  beatId: string;
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

interface SourceSyncEffectCueOverride {
  id: string;
  kind: MotionSyncEffectCueKind;
  label: string;
  startSeconds: number;
  durationSeconds: number;
  effectPresetId: string;
  targetClipId: string;
  targetBeatId: string | null;
  soundCueId: string | null;
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
  const appliedEdits = mergeAppliedEdits(plans.flatMap((plan) => plan.appliedEdits));

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
    const sourcePaths = input.files.map((file) => file.path);
    const revisedProject = applyMotionTimelineRevision(project, {
      id: revisionId,
      requestedAt: input.requestedAt,
      updatedAt: input.updatedAt ?? input.requestedAt,
      operations,
    });
    const projectWithHistory = {
      ...revisedProject,
      executionHistory: appendSourceEditExecutionHistory(
        revisedProject.executionHistory,
        {
          id: revisionId,
          sourcePaths,
          operationCount: operations.length,
          provenance: [{ kind: 'revision', ref: revisionId }],
        },
        input.updatedAt ?? input.requestedAt
      ),
    };

    return {
      status: 'applied',
      project: projectWithHistory,
      appliedEdits,
      blockers: [],
      operationCount: operations.length,
      sourcePaths,
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
  if (isUnsafeSourcePath(file.path, normalizedPath)) {
    return {
      operations: [],
      appliedEdits: [],
      blockers: [
        {
          id: 'source-edit-unsafe-path',
          path: file.path,
          message: 'Source edit paths must stay inside the editable motion source bundle.',
        },
      ],
    };
  }

  const pathDraftId = draftIdFromTimelinePath(normalizedPath);
  if (pathDraftId) {
    return timelineJsonEdits(project, file, normalizedPath, pathDraftId);
  }

  if (normalizedPath === 'SCRIPT.md') {
    return scriptMarkdownEdits(project, file.path, file.contents);
  }

  if (normalizedPath === 'STORYBOARD.md') {
    return storyboardMarkdownEdits(project, file.path, file.contents);
  }

  if (normalizedPath === 'EDIT.md') {
    return editMarkdownEdits(project, file.path, file.contents);
  }

  return {
    operations: [],
    appliedEdits: [],
    blockers: [
      {
        id: 'source-edit-unsupported-file',
        path: file.path,
        message: 'Only timeline JSON, SCRIPT.md, STORYBOARD.md, and EDIT.md source files are supported by source-edit.',
      },
    ],
  };
}

function timelineJsonEdits(
  project: MotionProject,
  file: MotionSourceBundleEditFile,
  normalizedPath: string,
  pathDraftId: string
): TimelineEditPlan {
  if (!normalizedPath) {
    return {
      operations: [],
      appliedEdits: [],
      blockers: [
        {
          id: 'source-edit-unsupported-file',
          path: file.path,
          message: 'Timeline source path is required.',
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

  const trackPlan = timelineEditsForTracks(project, {
    path: file.path,
    draftId,
    tracks: artifact.tracks,
  });
  const syncCuePlan = timelineSyncEffectCueEdits(project, {
    path: file.path,
    draftId,
    effectCues: artifact.syncEffectCues,
  });

  return mergeTimelineEditPlans([trackPlan, syncCuePlan]);
}

function scriptMarkdownEdits(
  project: MotionProject,
  path: string,
  contents: string
): TimelineEditPlan {
  const draftId = project.currentDraftId;
  const storyById = storyBeatMap(project);
  const operations: MotionTimelineRevisionOperation[] = [];
  const appliedEdits: MotionSourceBundleAppliedEdit[] = [];
  const blockers: MotionSourceBundleEditBlocker[] = [];

  markdownSections(contents).forEach((section) => {
    const beat = storyById.get(section.heading);
    if (!beat) {
      blockers.push({
        id: 'source-edit-story-beat-not-found',
        path,
        message: `Motion story beat not found in SCRIPT.md: ${section.heading}`,
      });
      return;
    }

    const narration = scriptNarration(section.lines);
    if (!narration || narration === beat.narration) return;

    operations.push({
      kind: 'update-story-beat',
      beatId: beat.id,
      narration,
    });
    appliedEdits.push({
      kind: 'story-beat',
      path,
      draftId,
      beatId: beat.id,
      changedFields: ['narration'],
    });

    const clipPlan = narrationClipEditsForBeat(project, {
      path,
      draftId,
      beatId: beat.id,
      narration,
    });
    operations.push(...clipPlan.operations);
    appliedEdits.push(...clipPlan.appliedEdits);
    blockers.push(...clipPlan.blockers);
  });

  return { operations, appliedEdits, blockers };
}

function storyboardMarkdownEdits(
  project: MotionProject,
  path: string,
  contents: string
): TimelineEditPlan {
  const draftId = project.currentDraftId;
  const storyById = storyBeatMap(project);
  const operations: MotionTimelineRevisionOperation[] = [];
  const appliedEdits: MotionSourceBundleAppliedEdit[] = [];
  const blockers: MotionSourceBundleEditBlocker[] = [];
  const sections = markdownSections(contents);
  const orderPlan = storyboardOrderEdits(project, {
    path,
    draftId,
    sections,
    storyById,
  });
  operations.push(...orderPlan.operations);
  appliedEdits.push(...orderPlan.appliedEdits);
  blockers.push(...orderPlan.blockers);

  sections.forEach((section) => {
    const beat = storyById.get(section.heading);
    if (!beat) {
      blockers.push({
        id: 'source-edit-story-beat-not-found',
        path,
        message: `Motion story beat not found in STORYBOARD.md: ${section.heading}`,
      });
      return;
    }

    const fields = sectionFields(section.lines);
    const storyChangedFields: string[] = [];
    const storyOperation: Extract<MotionTimelineRevisionOperation, { kind: 'update-story-beat' }> = {
      kind: 'update-story-beat',
      beatId: beat.id,
    };
    const narration = fields.get('narration');
    if (narration && narration !== beat.narration) {
      storyOperation.narration = narration;
      storyChangedFields.push('narration');
      const clipPlan = narrationClipEditsForBeat(project, {
        path,
        draftId,
        beatId: beat.id,
        narration,
      });
      operations.push(...clipPlan.operations);
      appliedEdits.push(...clipPlan.appliedEdits);
      blockers.push(...clipPlan.blockers);
    }

    const durationSeconds = secondsValue(fields.get('duration'));
    if (durationSeconds !== undefined && durationSeconds !== beat.targetSeconds) {
      storyOperation.targetSeconds = durationSeconds;
      storyChangedFields.push('targetSeconds');
    }

    if (storyChangedFields.length > 0) {
      operations.push(storyOperation);
      appliedEdits.push({
        kind: 'story-beat',
        path,
        draftId,
        beatId: beat.id,
        changedFields: storyChangedFields,
      });
    }

    const clipId = fields.get('clip');
    if (!clipId || clipId === 'unmaterialized') return;

    const location = clipLocation(project, clipId);
    if (!location) {
      blockers.push({
        id: 'source-edit-clip-not-found',
        path,
        message: `Motion timeline clip not found: ${clipId}`,
      });
      return;
    }

    const clipChangedFields: string[] = [];
    const props: Record<string, unknown> = {};
    const template = fields.get('template');
    if (template && template !== location.clip.componentId) {
      operations.push({
        kind: 'replace-component',
        clipId,
        componentId: template,
      });
      clipChangedFields.push('componentId');
    }

    const motion = fields.get('motion');
    const currentMotion = motionEffectPresetOrDefault(location.clip.props.effectPreset).id;
    if (motion && currentMotion !== motion) {
      props.effectPreset = motion;
      clipChangedFields.push('props.effectPreset');
    }

    const startSeconds = secondsValue(fields.get('start'));
    const durationFrames =
      durationSeconds === undefined ? undefined : motionFrames(durationSeconds, DEFAULT_MOTION_FPS);
    const startFrame =
      startSeconds === undefined ? undefined : motionFrames(startSeconds, DEFAULT_MOTION_FPS);
    if (startFrame !== undefined || durationFrames !== undefined) {
      const timingPlan = timingClipEditsForBeat(project, {
        path,
        draftId,
        beatId: beat.id,
        startFrame,
        durationFrames,
      });
      operations.push(...timingPlan.operations);
      appliedEdits.push(...timingPlan.appliedEdits);
      blockers.push(...timingPlan.blockers);
    }

    if (Object.keys(props).length > 0) {
      operations.push({
        kind: 'update-clip-props',
        clipId,
        props,
      });
    }

    if (clipChangedFields.length > 0) {
      appliedEdits.push({
        kind: 'timeline-clip',
        path,
        draftId,
        trackId: location.track.id,
        clipId,
        changedFields: clipChangedFields,
      });
    }
  });

  return { operations, appliedEdits, blockers };
}

function storyboardOrderEdits(
  project: MotionProject,
  input: {
    path: string;
    draftId: string;
    sections: MarkdownSection[];
    storyById: Map<string, StoryBeat>;
  }
): TimelineEditPlan {
  const currentStory = currentStoryForDraft(project, input.draftId);
  if (currentStory.length === 0 || input.sections.length !== currentStory.length) {
    return emptyTimelineEditPlan();
  }

  const beatIds: string[] = [];
  const blockers: MotionSourceBundleEditBlocker[] = [];
  input.sections.forEach((section) => {
    const beat = input.storyById.get(section.heading);
    if (!beat) return;
    beatIds.push(beat.id);
  });

  if (beatIds.length !== input.sections.length) return emptyTimelineEditPlan();
  const duplicate = firstDuplicate(beatIds);
  if (duplicate) {
    blockers.push({
      id: 'source-edit-story-order-duplicate',
      path: input.path,
      message: `STORYBOARD.md contains duplicate story beat: ${duplicate}`,
    });
    return { operations: [], appliedEdits: [], blockers };
  }

  const currentBeatIds = currentStory.map((beat) => beat.id);
  if (!sameStringSet(currentBeatIds, beatIds)) return emptyTimelineEditPlan();
  if (currentBeatIds.join('\n') === beatIds.join('\n')) return emptyTimelineEditPlan();

  return {
    operations: [
      {
        kind: 'reorder-story-beats',
        beatIds,
      },
    ],
    appliedEdits: beatIds.flatMap((beatId, index) =>
      currentBeatIds[index] === beatId
        ? []
        : [
            {
              kind: 'story-beat' as const,
              path: input.path,
              draftId: input.draftId,
              beatId,
              changedFields: ['order'],
            },
          ]
    ),
    blockers,
  };
}

function editMarkdownEdits(
  project: MotionProject,
  path: string,
  contents: string
): TimelineEditPlan {
  const draftId = project.currentDraftId;
  const operations: MotionTimelineRevisionOperation[] = [];
  const appliedEdits: MotionSourceBundleAppliedEdit[] = [];
  const blockers: MotionSourceBundleEditBlocker[] = [];

  markdownSections(contents).forEach((section) => {
    if (section.heading === 'Editable Components' || section.heading === 'Sync Effect Cues') return;

    const location = clipLocation(project, section.heading);
    if (!location) {
      blockers.push({
        id: 'source-edit-clip-not-found',
        path,
        message: `Motion timeline clip not found: ${section.heading}`,
      });
      return;
    }

    const controlIds = editControlIds(section.lines);
    const values = editableValues(section.lines);
    const props: Record<string, unknown> = {};
    const changedFields: string[] = [];

    values.forEach((value, key) => {
      if (value === undefined) return;
      if (controlIds.length > 0 && !controlIds.includes(key)) {
        blockers.push({
          id: 'source-edit-control-not-editable',
          path,
          message: `Motion timeline clip ${section.heading} does not expose editable control: ${key}`,
        });
        return;
      }

      if (canonicalJson(location.clip.props[key]) === canonicalJson(value)) return;
      props[key] = value;
      changedFields.push(`props.${key}`);
    });

    if (changedFields.length === 0) return;

    operations.push({
      kind: 'update-clip-props',
      clipId: section.heading,
      props,
    });
    appliedEdits.push({
      kind: 'timeline-clip',
      path,
      draftId,
      trackId: location.track.id,
      clipId: section.heading,
      changedFields,
    });
  });

  return { operations, appliedEdits, blockers };
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

function timelineSyncEffectCueEdits(
  project: MotionProject,
  input: { path: string; draftId: string; effectCues: unknown }
): TimelineEditPlan {
  if (input.effectCues === undefined) {
    return emptyTimelineEditPlan();
  }

  if (!Array.isArray(input.effectCues)) {
    return {
      operations: [],
      appliedEdits: [],
      blockers: [
        {
          id: 'source-edit-sync-effect-cues-invalid',
          path: input.path,
          message: 'Timeline syncEffectCues must be an array when provided.',
        },
      ],
    };
  }

  const operations: MotionTimelineRevisionOperation[] = [];
  const appliedEdits: MotionSourceBundleAppliedEdit[] = [];
  const blockers: MotionSourceBundleEditBlocker[] = [];

  input.effectCues.forEach((candidateCue, cueIndex) => {
    const parsed = parseSourceSyncEffectCue(input.path, candidateCue, cueIndex);
    if (!parsed.ok) {
      blockers.push(parsed.blocker);
      return;
    }

    const cue = parsed.cue;
    const location = clipLocationForDraft(project, input.draftId, cue.targetClipId);
    if (!location) {
      blockers.push({
        id: 'source-edit-sync-effect-target-not-found',
        path: input.path,
        message: `Sync effect cue ${cue.id} targets a missing clip: ${cue.targetClipId}`,
      });
      return;
    }

    const currentOverrides = syncEffectCueOverrides(location.clip.props.syncEffectCueOverrides);
    const nextOverrides = upsertSyncEffectCueOverride(currentOverrides, cue);
    const props: Record<string, unknown> = {};
    const changedFields: string[] = [];

    if (canonicalJson(location.clip.props.effectPreset) !== canonicalJson(cue.effectPresetId)) {
      props.effectPreset = cue.effectPresetId;
      changedFields.push('props.effectPreset');
    }

    if (canonicalJson(currentOverrides) !== canonicalJson(nextOverrides)) {
      props.syncEffectCueOverrides = nextOverrides;
      changedFields.push('props.syncEffectCueOverrides');
    }

    if (changedFields.length === 0) return;

    operations.push({
      kind: 'update-clip-props',
      clipId: cue.targetClipId,
      props,
    });
    appliedEdits.push({
      kind: 'timeline-clip',
      path: input.path,
      draftId: input.draftId,
      trackId: location.track.id,
      clipId: cue.targetClipId,
      changedFields,
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

function parseSourceSyncEffectCue(
  path: string,
  candidateCue: unknown,
  cueIndex: number
):
  | { ok: true; cue: SourceSyncEffectCueOverride }
  | { ok: false; blocker: MotionSourceBundleEditBlocker } {
  if (!isObject(candidateCue)) {
    return {
      ok: false,
      blocker: {
        id: 'source-edit-sync-effect-cue-invalid',
        path,
        message: `Timeline syncEffectCues[${cueIndex}] must be an object.`,
      },
    };
  }

  const id = stringValue(candidateCue.id);
  const kind = syncEffectCueKind(candidateCue.kind);
  const label = stringValue(candidateCue.label);
  const startSeconds = numericValue(candidateCue.startSeconds);
  const durationSeconds = numericValue(candidateCue.durationSeconds);
  const effectPresetId = stringValue(candidateCue.effectPresetId);
  const targetClipId = stringValue(candidateCue.targetClipId);
  const targetBeatId = nullableStringValue(candidateCue.targetBeatId);
  const soundCueId = nullableStringValue(candidateCue.soundCueId);

  if (
    !id ||
    !kind ||
    !label ||
    startSeconds === undefined ||
    durationSeconds === undefined ||
    !effectPresetId ||
    !targetClipId
  ) {
    return {
      ok: false,
      blocker: {
        id: 'source-edit-sync-effect-cue-invalid',
        path,
        message:
          `Timeline syncEffectCues[${cueIndex}] must include id, kind, label, startSeconds, durationSeconds, effectPresetId, and targetClipId.`,
      },
    };
  }

  if (startSeconds < 0 || durationSeconds <= 0) {
    return {
      ok: false,
      blocker: {
        id: 'source-edit-sync-effect-cue-invalid',
        path,
        message: `Timeline syncEffectCues[${cueIndex}] must use non-negative startSeconds and positive durationSeconds.`,
      },
    };
  }

  if (!getMotionEffectPreset(effectPresetId)) {
    return {
      ok: false,
      blocker: {
        id: 'source-edit-sync-effect-preset-not-found',
        path,
        message: `Sync effect cue ${id} uses an unknown effect preset: ${effectPresetId}`,
      },
    };
  }

  return {
    ok: true,
    cue: {
      id,
      kind,
      label,
      startSeconds,
      durationSeconds,
      effectPresetId,
      targetClipId,
      targetBeatId,
      soundCueId,
    },
  };
}

function syncEffectCueKind(value: unknown): MotionSyncEffectCueKind | null {
  return value === 'caption-emphasis' || value === 'transition' || value === 'cta'
    ? value
    : null;
}

function nullableStringValue(value: unknown): string | null {
  return value === null || value === undefined ? null : stringValue(value) ?? null;
}

function syncEffectCueOverrides(value: unknown): SourceSyncEffectCueOverride[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((candidate): SourceSyncEffectCueOverride[] => {
    if (!isObject(candidate)) return [];
    const parsed = parseSourceSyncEffectCue(
      'syncEffectCueOverrides',
      candidate,
      0
    );
    return parsed.ok ? [parsed.cue] : [];
  });
}

function upsertSyncEffectCueOverride(
  currentOverrides: SourceSyncEffectCueOverride[],
  cue: SourceSyncEffectCueOverride
): SourceSyncEffectCueOverride[] {
  return [
    ...currentOverrides.filter((override) => override.id !== cue.id),
    cue,
  ].sort((a, b) => a.startSeconds - b.startSeconds || a.id.localeCompare(b.id));
}

function mergeTimelineEditPlans(plans: TimelineEditPlan[]): TimelineEditPlan {
  return {
    operations: plans.flatMap((plan) => plan.operations),
    appliedEdits: mergeAppliedEdits(plans.flatMap((plan) => plan.appliedEdits)),
    blockers: plans.flatMap((plan) => plan.blockers),
  };
}

function emptyTimelineEditPlan(): TimelineEditPlan {
  return { operations: [], appliedEdits: [], blockers: [] };
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

function isUnsafeSourcePath(rawPath: string, normalizedPath: string): boolean {
  if (rawPath.startsWith('/') || rawPath.includes('\\')) return true;
  return normalizedPath.split('/').some((segment) => segment === '..');
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

interface MarkdownSection {
  heading: string;
  lines: string[];
}

function markdownSections(contents: string): MarkdownSection[] {
  const sections: MarkdownSection[] = [];
  let current: MarkdownSection | null = null;

  contents.split(/\r?\n/).forEach((line) => {
    const heading = /^##\s+(.+?)\s*$/.exec(line)?.[1];
    if (heading) {
      if (current) sections.push(current);
      current = { heading, lines: [] };
      return;
    }

    current?.lines.push(line);
  });

  if (current) sections.push(current);
  return sections;
}

function scriptNarration(lines: string[]): string | undefined {
  const narrationLines = lines.filter((line) => {
    const trimmed = line.trim();
    return trimmed.length > 0 && !isScriptMetadataLine(trimmed);
  });
  const narration = narrationLines.join('\n').trim();
  return narration.length > 0 ? narration : undefined;
}

function isScriptMetadataLine(line: string): boolean {
  return /^(Role|Target seconds|Template|Provenance):\s*/.test(line);
}

function sectionFields(lines: string[]): Map<string, string> {
  const fields = new Map<string, string>();
  lines.forEach((line) => {
    const match = /^([A-Za-z ]+):\s*(.*)$/.exec(line.trim());
    if (!match) return;
    fields.set(normalizeFieldKey(match[1]), match[2].trim());
  });
  return fields;
}

function normalizeFieldKey(key: string): string {
  return key.trim().toLowerCase().replace(/\s+/g, '-');
}

function secondsValue(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const match = /^(-?\d+(?:\.\d+)?)s?$/.exec(value.trim());
  if (!match) return undefined;
  const seconds = Number(match[1]);
  return Number.isFinite(seconds) ? seconds : undefined;
}

function storyBeatMap(project: MotionProject): Map<string, StoryBeat> {
  const beats = [
    ...(project.drafts.find((draft) => draft.id === project.currentDraftId)?.story ?? []),
    ...project.story,
    ...project.drafts.flatMap((draft) => draft.story),
  ];
  const map = new Map<string, StoryBeat>();
  beats.forEach((beat) => {
    if (!map.has(beat.id)) map.set(beat.id, beat);
  });
  return map;
}

function currentStoryForDraft(project: MotionProject, draftId: string): StoryBeat[] {
  const draftStory = project.drafts.find((draft) => draft.id === draftId)?.story ?? [];
  return draftStory.length > 0 ? draftStory : project.story;
}

function narrationClipEditsForBeat(
  project: MotionProject,
  input: { path: string; draftId: string; beatId: string; narration: string }
): TimelineEditPlan {
  const operations: MotionTimelineRevisionOperation[] = [];
  const appliedEdits: MotionSourceBundleAppliedEdit[] = [];
  const blockers: MotionSourceBundleEditBlocker[] = [];
  const tracks = tracksForDraft(project, input.draftId);
  if (!tracks) {
    return {
      operations,
      appliedEdits,
      blockers: [
        {
          id: 'source-edit-draft-not-found',
          path: input.path,
          message: `Motion draft not found: ${input.draftId}`,
        },
      ],
    };
  }

  tracks.forEach((track) => {
    track.clips
      .filter((clip) =>
        clip.provenance.some((ref) => ref.kind === 'story-beat' && ref.ref === input.beatId)
      )
      .forEach((clip) => {
        const props = narrationPropsForClip(track, clip, input.narration);
        const changedFields = Object.keys(props)
          .filter((key) => canonicalJson(clip.props[key]) !== canonicalJson(props[key]))
          .map((key) => `props.${key}`);
        if (changedFields.length === 0) return;

        operations.push({
          kind: 'update-clip-props',
          clipId: clip.id,
          props,
        });
        appliedEdits.push({
          kind: 'timeline-clip',
          path: input.path,
          draftId: input.draftId,
          trackId: track.id,
          clipId: clip.id,
          changedFields,
        });
      });
  });

  return { operations, appliedEdits, blockers };
}

function timingClipEditsForBeat(
  project: MotionProject,
  input: {
    path: string;
    draftId: string;
    beatId: string;
    startFrame?: number;
    durationFrames?: number;
  }
): TimelineEditPlan {
  const operations: MotionTimelineRevisionOperation[] = [];
  const appliedEdits: MotionSourceBundleAppliedEdit[] = [];
  const blockers: MotionSourceBundleEditBlocker[] = [];
  const tracks = tracksForDraft(project, input.draftId);
  if (!tracks) {
    return {
      operations,
      appliedEdits,
      blockers: [
        {
          id: 'source-edit-draft-not-found',
          path: input.path,
          message: `Motion draft not found: ${input.draftId}`,
        },
      ],
    };
  }

  tracks.forEach((track) => {
    if (!tracksShouldFollowStoryTiming(track)) return;

    track.clips
      .filter((clip) =>
        clip.provenance.some((ref) => ref.kind === 'story-beat' && ref.ref === input.beatId)
      )
      .forEach((clip) => {
        const changedFields: string[] = [];
        const operation: Extract<MotionTimelineRevisionOperation, { kind: 'retime-clip' }> = {
          kind: 'retime-clip',
          clipId: clip.id,
        };

        if (input.startFrame !== undefined && input.startFrame !== clip.startFrame) {
          operation.startFrame = input.startFrame;
          changedFields.push('startFrame');
        }
        if (input.durationFrames !== undefined && input.durationFrames !== clip.durationFrames) {
          operation.durationFrames = input.durationFrames;
          changedFields.push('durationFrames');
        }
        if (changedFields.length === 0) return;

        operations.push(operation);
        appliedEdits.push({
          kind: 'timeline-clip',
          path: input.path,
          draftId: input.draftId,
          trackId: track.id,
          clipId: clip.id,
          changedFields,
        });
      });
  });

  return { operations, appliedEdits, blockers };
}

function narrationPropsForClip(
  track: TimelineTrack,
  clip: TimelineClip,
  narration: string
): Record<string, unknown> {
  if (!tracksShouldFollowStoryTiming(track)) return {};
  if (track.kind === 'caption' || track.kind === 'voice') return { text: narration };

  const props: Record<string, unknown> = {};
  if ('narration' in clip.props || !('text' in clip.props)) props.narration = narration;
  if (typeof clip.props.text === 'string') props.text = narration;
  if (typeof clip.props.caption === 'string') props.caption = narration;
  return props;
}

function tracksShouldFollowStoryTiming(track: TimelineTrack): boolean {
  return track.kind === 'text' || track.kind === 'caption' || track.kind === 'voice';
}

function clipLocation(
  project: MotionProject,
  clipId: string
): { track: TimelineTrack; clip: TimelineClip } | null {
  return clipLocationForDraft(project, project.currentDraftId, clipId);
}

function clipLocationForDraft(
  project: MotionProject,
  draftId: string,
  clipId: string
): { track: TimelineTrack; clip: TimelineClip } | null {
  const tracks =
    tracksForDraft(project, draftId) ??
    project.tracks ??
    project.drafts.flatMap((draft) => draft.tracks);

  for (const track of tracks) {
    const clip = track.clips.find((candidate) => candidate.id === clipId);
    if (clip) return { track, clip };
  }

  return null;
}

function editControlIds(lines: string[]): string[] {
  const line = lines.find((candidate) => candidate.trim().startsWith('Edit controls:'));
  if (!line) return [];
  const value = line.replace(/^Edit controls:\s*/, '').trim();
  if (!value || value === 'none') return [];
  return value.split(',').map((control) => control.trim()).filter(Boolean);
}

function editableValues(lines: string[]): Map<string, unknown> {
  const values = new Map<string, unknown>();
  let inValues = false;

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (trimmed === 'Editable values:') {
      inValues = true;
      return;
    }
    if (!inValues || trimmed.length === 0) return;
    if (/^(Regenerate|Files|Provenance|Component|Track|Controls|Edit controls):/.test(trimmed)) {
      inValues = false;
      return;
    }

    const match = /^-\s*([A-Za-z0-9_.-]+):\s*(.*)$/.exec(trimmed);
    if (!match) return;
    values.set(match[1], parseEditableValue(match[2]));
  });

  return values;
}

function parseEditableValue(value: string): unknown {
  const trimmed = value.trim();
  if (trimmed === 'null') return undefined;
  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
}

function mergeAppliedEdits(edits: MotionSourceBundleAppliedEdit[]): MotionSourceBundleAppliedEdit[] {
  const merged = new Map<string, MotionSourceBundleAppliedEdit>();

  edits.forEach((edit) => {
    const key =
      edit.kind === 'timeline-clip'
        ? `timeline-clip:${edit.path}:${edit.draftId}:${edit.trackId}:${edit.clipId}`
        : `story-beat:${edit.path}:${edit.draftId}:${edit.beatId}`;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, { ...edit, changedFields: uniqueStrings(edit.changedFields) });
      return;
    }

    merged.set(key, {
      ...existing,
      changedFields: uniqueStrings([...existing.changedFields, ...edit.changedFields]),
    } as MotionSourceBundleAppliedEdit);
  });

  return Array.from(merged.values());
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values));
}

function firstDuplicate(values: string[]): string | null {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) return value;
    seen.add(value);
  }
  return null;
}

function sameStringSet(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  const rightSet = new Set(right);
  return left.every((value) => rightSet.has(value));
}
