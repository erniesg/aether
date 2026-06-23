import { getMotionComponent } from './componentRegistry';
import type {
  MotionGraphNode,
  MotionProject,
  MotionProvenanceRef,
  StoryBeat,
  TimelineClip,
  TimelineTrack,
} from './project';

export type MotionTimelineRevisionOperation =
  | {
      kind: 'update-story-beat';
      beatId: string;
      narration?: string;
      targetSeconds?: number;
    }
  | {
      kind: 'update-clip-props';
      clipId: string;
      props: Record<string, unknown>;
    }
  | {
      kind: 'retime-clip';
      clipId: string;
      startFrame?: number;
      durationFrames?: number;
    }
  | {
      kind: 'replace-component';
      clipId: string;
      componentId: string;
      props?: Record<string, unknown>;
    };

export interface ApplyMotionTimelineRevisionInput {
  id: string;
  requestedAt: number;
  updatedAt?: number;
  operations: MotionTimelineRevisionOperation[];
}

interface ClipEdit {
  props?: Record<string, unknown>;
  startFrame?: number;
  durationFrames?: number;
  componentId?: string;
}

export function applyMotionTimelineRevision(
  project: MotionProject,
  input: ApplyMotionTimelineRevisionInput
): MotionProject {
  validateMotionTimelineRevision(project, input);

  const refs = revisionProvenance(input.id);
  const clipEdits = clipEditsForOperations(input.operations);
  const revisionNode = buildRevisionNode(input, refs);

  return {
    ...project,
    story: applyStoryOperations(project.story, input.operations, refs),
    tracks: applyClipEdits(project.tracks, clipEdits, refs),
    drafts: project.drafts.map((draft) => ({
      ...draft,
      story: applyStoryOperations(draft.story, input.operations, refs),
      tracks: applyClipEdits(draft.tracks, clipEdits, refs),
    })),
    graphNodes: upsertRevisionNode(project.graphNodes, revisionNode),
    updatedAt: input.updatedAt ?? project.updatedAt,
  };
}

function validateMotionTimelineRevision(
  project: MotionProject,
  input: ApplyMotionTimelineRevisionInput
): void {
  if (input.operations.length === 0) {
    throw new Error(`Motion timeline revision has no operations: ${input.id}`);
  }

  const beatIds = new Set([
    ...project.story.map((beat) => beat.id),
    ...project.drafts.flatMap((draft) => draft.story.map((beat) => beat.id)),
  ]);
  const clipIds = new Set(
    allTrackSets(project)
      .flatMap((tracks) => tracks.flatMap((track) => track.clips))
      .map((clip) => clip.id)
  );

  input.operations.forEach((operation) => {
    if (operation.kind === 'update-story-beat') {
      if (!beatIds.has(operation.beatId)) {
        throw new Error(`Motion story beat not found: ${operation.beatId}`);
      }
      if (operation.targetSeconds !== undefined && operation.targetSeconds <= 0) {
        throw new Error(`Motion story beat duration must be positive: ${operation.beatId}`);
      }
    }

    if (
      operation.kind === 'update-clip-props' ||
      operation.kind === 'retime-clip' ||
      operation.kind === 'replace-component'
    ) {
      if (!clipIds.has(operation.clipId)) {
        throw new Error(`Motion timeline clip not found: ${operation.clipId}`);
      }
    }

    if (operation.kind === 'retime-clip') {
      if (operation.startFrame !== undefined && operation.startFrame < 0) {
        throw new Error(`Motion clip start frame must be non-negative: ${operation.clipId}`);
      }
      if (operation.durationFrames !== undefined && operation.durationFrames <= 0) {
        throw new Error(`Motion clip duration must be positive: ${operation.clipId}`);
      }
    }

    if (operation.kind === 'replace-component' && !getMotionComponent(operation.componentId)) {
      throw new Error(`Motion component is not registered: ${operation.componentId}`);
    }
  });

  validateRetimingDoesNotOverlap(project, clipEditsForOperations(input.operations));
}

function validateRetimingDoesNotOverlap(
  project: MotionProject,
  clipEdits: Map<string, ClipEdit>
): void {
  allTrackSets(project).forEach((tracks) => {
    tracks.forEach((track) => {
      const candidateClips = track.clips.map((clip) => applyTimingEdit(clip, clipEdits));

      candidateClips.forEach((clip, index) => {
        if (!hasTimingEdit(clip.id, clipEdits)) return;

        const overlapping = candidateClips.find(
          (candidate, candidateIndex) =>
            candidateIndex !== index &&
            candidate.startFrame < clip.startFrame + clip.durationFrames &&
            candidate.startFrame + candidate.durationFrames > clip.startFrame
        );

        if (overlapping) {
          throw new Error(`${clip.id} would overlap ${overlapping.id} on ${track.id}`);
        }
      });
    });
  });
}

function applyStoryOperations(
  story: StoryBeat[],
  operations: MotionTimelineRevisionOperation[],
  provenance: MotionProvenanceRef[]
): StoryBeat[] {
  const updates = operations.filter((operation) => operation.kind === 'update-story-beat');
  if (updates.length === 0) return story;

  return story.map((beat) => {
    const operation = updates.find((candidate) => candidate.beatId === beat.id);
    if (!operation) return beat;

    return {
      ...beat,
      ...(operation.narration === undefined ? {} : { narration: operation.narration }),
      ...(operation.targetSeconds === undefined
        ? {}
        : { targetSeconds: operation.targetSeconds }),
      provenance: uniqueProvenance([...beat.provenance, ...provenance]),
    };
  });
}

function clipEditsForOperations(
  operations: MotionTimelineRevisionOperation[]
): Map<string, ClipEdit> {
  const edits = new Map<string, ClipEdit>();

  operations.forEach((operation) => {
    if (operation.kind === 'update-story-beat') return;

    const current = edits.get(operation.clipId) ?? {};
    if (operation.kind === 'update-clip-props') {
      edits.set(operation.clipId, {
        ...current,
        props: {
          ...(current.props ?? {}),
          ...operation.props,
        },
      });
      return;
    }

    if (operation.kind === 'retime-clip') {
      edits.set(operation.clipId, {
        ...current,
        ...(operation.startFrame === undefined ? {} : { startFrame: operation.startFrame }),
        ...(operation.durationFrames === undefined
          ? {}
          : { durationFrames: operation.durationFrames }),
      });
      return;
    }

    edits.set(operation.clipId, {
      ...current,
      componentId: operation.componentId,
      props: {
        ...(current.props ?? {}),
        ...(operation.props ?? {}),
      },
    });
  });

  return edits;
}

function applyClipEdits(
  tracks: TimelineTrack[],
  clipEdits: Map<string, ClipEdit>,
  provenance: MotionProvenanceRef[]
): TimelineTrack[] {
  if (clipEdits.size === 0) return tracks;

  return tracks.map((track) => ({
    ...track,
    clips: track.clips.map((clip) => applyClipEdit(clip, clipEdits, provenance)),
  }));
}

function applyClipEdit(
  clip: TimelineClip,
  clipEdits: Map<string, ClipEdit>,
  provenance: MotionProvenanceRef[]
): TimelineClip {
  const edit = clipEdits.get(clip.id);
  if (!edit) return clip;

  return {
    ...clip,
    ...(edit.startFrame === undefined ? {} : { startFrame: edit.startFrame }),
    ...(edit.durationFrames === undefined ? {} : { durationFrames: edit.durationFrames }),
    ...(edit.componentId === undefined ? {} : { componentId: edit.componentId }),
    props: {
      ...clip.props,
      ...(edit.props ?? {}),
    },
    provenance: uniqueProvenance([...clip.provenance, ...provenance]),
  };
}

function applyTimingEdit(clip: TimelineClip, clipEdits: Map<string, ClipEdit>): TimelineClip {
  const edit = clipEdits.get(clip.id);
  if (!edit) return clip;

  return {
    ...clip,
    ...(edit.startFrame === undefined ? {} : { startFrame: edit.startFrame }),
    ...(edit.durationFrames === undefined ? {} : { durationFrames: edit.durationFrames }),
  };
}

function hasTimingEdit(clipId: string, clipEdits: Map<string, ClipEdit>): boolean {
  const edit = clipEdits.get(clipId);
  return edit?.startFrame !== undefined || edit?.durationFrames !== undefined;
}

function buildRevisionNode(
  input: ApplyMotionTimelineRevisionInput,
  provenance: MotionProvenanceRef[]
): MotionGraphNode {
  const operationRefs = input.operations.map(operationRef);

  return {
    id: `node-revision-${input.id}`,
    kind: 'revision',
    inputRefs: operationRefs,
    outputRefs: operationRefs,
    status: 'done',
    provenance,
  };
}

function upsertRevisionNode(
  nodes: MotionGraphNode[],
  nextNode: MotionGraphNode
): MotionGraphNode[] {
  const existingIndex = nodes.findIndex((node) => node.id === nextNode.id);
  if (existingIndex === -1) return [...nodes, nextNode];

  return nodes.map((node, index) =>
    index === existingIndex
      ? {
          ...nextNode,
          inputRefs: [...node.inputRefs, ...nextNode.inputRefs],
          outputRefs: [...node.outputRefs, ...nextNode.outputRefs],
          provenance: uniqueProvenance([...node.provenance, ...nextNode.provenance]),
        }
      : node
  );
}

function operationRef(operation: MotionTimelineRevisionOperation): string {
  if (operation.kind === 'update-story-beat') return operation.beatId;
  return operation.clipId;
}

function revisionProvenance(id: string): MotionProvenanceRef[] {
  return [
    { kind: 'manual', ref: id },
    { kind: 'revision', ref: id },
  ];
}

function allTrackSets(project: MotionProject): TimelineTrack[][] {
  return [
    project.tracks,
    ...project.drafts.flatMap((draft) => (draft.tracks.length > 0 ? [draft.tracks] : [])),
  ].filter((tracks) => tracks.length > 0);
}

function uniqueProvenance(refs: MotionProvenanceRef[]): MotionProvenanceRef[] {
  const seen = new Set<string>();
  return refs.filter((ref) => {
    const key = `${ref.kind}:${ref.ref}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
