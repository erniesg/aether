import { getMotionComponent } from './componentRegistry';
import type {
  MotionInteractiveMarker,
  MotionInteractiveMarkerInput,
  MotionInteractiveMarkerKind,
  MotionGraphNode,
  MotionProject,
  MotionProvenanceRef,
  StoryBeat,
  TimelineClip,
  TimelineTrack,
} from './project';

export interface MotionSourceKeyframe {
  atFrame: number;
  crop?: string;
  zoom?: number;
  cursorPath?: string;
  label?: string;
}

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
      kind: 'replace-clip-props';
      clipId: string;
      props: Record<string, unknown>;
    }
  | {
      kind: 'replace-clip-asset';
      clipId: string;
      assetId: string;
      assetUrl?: string;
      captureArtifactKind?: string;
      mimeType?: string;
      crop?: string;
      zoom?: number;
      cursorPath?: string;
      sourceAssetId?: string;
    }
  | {
      kind: 'update-clip-source-keyframes';
      clipId: string;
      keyframes: MotionSourceKeyframe[];
    }
  | {
      kind: 'upsert-interactive-marker';
      marker: MotionInteractiveMarkerInput;
    }
  | {
      kind: 'remove-interactive-marker';
      markerId: string;
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
  assetId?: string;
  props?: Record<string, unknown>;
  replaceProps?: Record<string, unknown>;
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
  const interactiveMarkers = applyInteractiveMarkerOperations(
    project.interactiveMarkers,
    input.operations,
    refs
  );

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
    ...(interactiveMarkers === undefined ? {} : { interactiveMarkers }),
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
  const clipsById = new Map(
    allTrackSets(project)
      .flatMap((tracks) => tracks.flatMap((track) => track.clips))
      .map((clip) => [clip.id, clip] as const)
  );
  const draftIds = new Set(project.drafts.map((draft) => draft.id));
  const markerIds = new Set((project.interactiveMarkers ?? []).map((marker) => marker.id));

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
      operation.kind === 'replace-clip-props' ||
      operation.kind === 'replace-clip-asset' ||
      operation.kind === 'update-clip-source-keyframes' ||
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

    if (operation.kind === 'replace-clip-asset') {
      if (operation.assetId.trim().length === 0) {
        throw new Error(`Motion clip asset id is required: ${operation.clipId}`);
      }
      if (operation.zoom !== undefined && operation.zoom <= 0) {
        throw new Error(`Motion clip zoom must be positive: ${operation.clipId}`);
      }
    }

    if (operation.kind === 'update-clip-source-keyframes') {
      validateSourceKeyframes(operation, clipsById.get(operation.clipId));
    }

    if (operation.kind === 'upsert-interactive-marker') {
      validateInteractiveMarker(operation.marker, { beatIds, clipIds, draftIds });
    }

    if (operation.kind === 'remove-interactive-marker') {
      if (operation.markerId.trim().length === 0) {
        throw new Error('Motion interactive marker id is required');
      }
      if (!markerIds.has(operation.markerId)) {
        throw new Error(`Motion interactive marker not found: ${operation.markerId}`);
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
    if (
      operation.kind === 'upsert-interactive-marker' ||
      operation.kind === 'remove-interactive-marker'
    ) {
      return;
    }

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

    if (operation.kind === 'replace-clip-props') {
      edits.set(operation.clipId, {
        ...current,
        replaceProps: operation.props,
      });
      return;
    }

    if (operation.kind === 'replace-clip-asset') {
      edits.set(operation.clipId, {
        ...current,
        assetId: operation.assetId,
        props: {
          ...(current.props ?? {}),
          ...assetReplacementProps(operation),
        },
      });
      return;
    }

    if (operation.kind === 'update-clip-source-keyframes') {
      edits.set(operation.clipId, {
        ...current,
        props: {
          ...(current.props ?? {}),
          ...sourceKeyframeProps(operation.keyframes),
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

function assetReplacementProps(
  operation: Extract<MotionTimelineRevisionOperation, { kind: 'replace-clip-asset' }>
): Record<string, unknown> {
  return {
    assetId: operation.assetId,
    ...(operation.assetUrl === undefined ? {} : { assetUrl: operation.assetUrl }),
    ...(operation.captureArtifactKind === undefined
      ? {}
      : { captureArtifactKind: operation.captureArtifactKind }),
    ...(operation.mimeType === undefined ? {} : { mimeType: operation.mimeType }),
    ...(operation.crop === undefined ? {} : { crop: operation.crop }),
    ...(operation.zoom === undefined ? {} : { zoom: operation.zoom }),
    ...(operation.cursorPath === undefined ? {} : { cursorPath: operation.cursorPath }),
    ...(operation.sourceAssetId === undefined ? {} : { sourceAssetId: operation.sourceAssetId }),
  };
}

function sourceKeyframeProps(keyframes: MotionSourceKeyframe[]): Record<string, unknown> {
  const normalized = normalizeSourceKeyframes(keyframes);
  const first = normalized[0];

  return {
    sourceKeyframes: normalized,
    ...(first.crop === undefined ? {} : { crop: first.crop }),
    ...(first.zoom === undefined ? {} : { zoom: first.zoom }),
    ...(first.cursorPath === undefined ? {} : { cursorPath: first.cursorPath }),
  };
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
    ...(edit.assetId === undefined ? {} : { assetId: edit.assetId }),
    ...(edit.startFrame === undefined ? {} : { startFrame: edit.startFrame }),
    ...(edit.durationFrames === undefined ? {} : { durationFrames: edit.durationFrames }),
    ...(edit.componentId === undefined ? {} : { componentId: edit.componentId }),
    props:
      edit.replaceProps === undefined
        ? {
            ...clip.props,
            ...(edit.props ?? {}),
          }
        : {
            ...edit.replaceProps,
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
  if (operation.kind === 'upsert-interactive-marker') return operation.marker.id;
  if (operation.kind === 'remove-interactive-marker') return operation.markerId;
  return operation.clipId;
}

const INTERACTIVE_MARKER_KINDS = new Set<MotionInteractiveMarkerKind>([
  'chapter',
  'hotspot',
  'callout',
  'branch',
  'link',
  'analytics',
]);

function applyInteractiveMarkerOperations(
  markers: MotionInteractiveMarker[] | undefined,
  operations: MotionTimelineRevisionOperation[],
  provenance: MotionProvenanceRef[]
): MotionInteractiveMarker[] | undefined {
  const markerOperations = operations.filter(
    (operation) =>
      operation.kind === 'upsert-interactive-marker' ||
      operation.kind === 'remove-interactive-marker'
  );
  if (markerOperations.length === 0) return markers;

  let next = [...(markers ?? [])];
  markerOperations.forEach((operation) => {
    if (operation.kind === 'remove-interactive-marker') {
      next = next.filter((marker) => marker.id !== operation.markerId);
      return;
    }

    const existing = next.find((marker) => marker.id === operation.marker.id);
    const marker = normalizeInteractiveMarker(operation.marker, [
      ...(existing?.provenance ?? []),
      ...(operation.marker.provenance ?? []),
      ...provenance,
    ]);
    const existingIndex = next.findIndex((candidate) => candidate.id === marker.id);
    if (existingIndex === -1) {
      next.push(marker);
    } else {
      next = next.map((candidate, index) => (index === existingIndex ? marker : candidate));
    }
  });

  return next;
}

function validateInteractiveMarker(
  marker: MotionInteractiveMarkerInput,
  refs: { beatIds: Set<string>; clipIds: Set<string>; draftIds: Set<string> }
): void {
  if (marker.id.trim().length === 0) {
    throw new Error('Motion interactive marker id is required');
  }
  if (!INTERACTIVE_MARKER_KINDS.has(marker.kind)) {
    throw new Error(`Motion interactive marker kind is invalid: ${marker.id}`);
  }
  if (marker.label.trim().length === 0) {
    throw new Error(`Motion interactive marker label is required: ${marker.id}`);
  }
  if (!Number.isFinite(marker.timeSeconds) || marker.timeSeconds < 0) {
    throw new Error(`Motion interactive marker time must be non-negative: ${marker.id}`);
  }
  if (!Number.isFinite(marker.durationSeconds) || marker.durationSeconds < 0) {
    throw new Error(`Motion interactive marker duration must be non-negative: ${marker.id}`);
  }
  if (marker.beatId && !refs.beatIds.has(marker.beatId)) {
    throw new Error(`Motion interactive marker beat not found: ${marker.beatId}`);
  }
  if (marker.clipId && !refs.clipIds.has(marker.clipId)) {
    throw new Error(`Motion interactive marker clip not found: ${marker.clipId}`);
  }
  if (marker.targetDraftId && !refs.draftIds.has(marker.targetDraftId)) {
    throw new Error(`Motion interactive marker draft not found: ${marker.targetDraftId}`);
  }
  if (marker.kind === 'link' && !marker.href?.trim()) {
    throw new Error(`Motion interactive marker link href is required: ${marker.id}`);
  }
  marker.metadataLabels.forEach((label) => {
    if (label.trim().length === 0) {
      throw new Error(`Motion interactive marker metadata label must not be blank: ${marker.id}`);
    }
  });
}

function normalizeInteractiveMarker(
  marker: MotionInteractiveMarkerInput,
  provenance: MotionProvenanceRef[]
): MotionInteractiveMarker {
  return {
    id: marker.id.trim(),
    kind: marker.kind,
    label: marker.label.trim(),
    timeSeconds: marker.timeSeconds,
    durationSeconds: marker.durationSeconds,
    ...(marker.beatId === undefined ? {} : { beatId: marker.beatId.trim() }),
    ...(marker.clipId === undefined ? {} : { clipId: marker.clipId.trim() }),
    ...(marker.componentLabel === undefined ? {} : { componentLabel: marker.componentLabel.trim() }),
    ...(marker.targetLabel === undefined ? {} : { targetLabel: marker.targetLabel.trim() }),
    ...(marker.targetDraftId === undefined ? {} : { targetDraftId: marker.targetDraftId.trim() }),
    ...(marker.targetFormat === undefined ? {} : { targetFormat: marker.targetFormat.trim() }),
    ...(marker.href === undefined ? {} : { href: marker.href.trim() }),
    metadataLabels: uniqueStrings(marker.metadataLabels.map((label) => label.trim())),
    provenance: uniqueProvenance(provenance),
  };
}

function validateSourceKeyframes(
  operation: Extract<MotionTimelineRevisionOperation, { kind: 'update-clip-source-keyframes' }>,
  clip: TimelineClip | undefined
): void {
  if (operation.keyframes.length === 0) {
    throw new Error(`Motion clip source keyframes are required: ${operation.clipId}`);
  }

  const seenFrames = new Set<number>();
  operation.keyframes.forEach((keyframe) => {
    if (!Number.isFinite(keyframe.atFrame) || keyframe.atFrame < 0) {
      throw new Error(`Motion clip source keyframe frame must be non-negative: ${operation.clipId}`);
    }
    if (clip && keyframe.atFrame > clip.durationFrames) {
      throw new Error(`Motion clip source keyframe frame exceeds duration: ${operation.clipId}`);
    }
    if (seenFrames.has(keyframe.atFrame)) {
      throw new Error(`Motion clip source keyframe frames must be unique: ${operation.clipId}`);
    }
    seenFrames.add(keyframe.atFrame);
    if (keyframe.zoom !== undefined && keyframe.zoom <= 0) {
      throw new Error(`Motion clip source keyframe zoom must be positive: ${operation.clipId}`);
    }
    if (keyframe.crop !== undefined && keyframe.crop.trim().length === 0) {
      throw new Error(`Motion clip source keyframe crop must not be blank: ${operation.clipId}`);
    }
    if (keyframe.cursorPath !== undefined && keyframe.cursorPath.trim().length === 0) {
      throw new Error(`Motion clip source keyframe cursor path must not be blank: ${operation.clipId}`);
    }
  });
}

function normalizeSourceKeyframes(keyframes: MotionSourceKeyframe[]): MotionSourceKeyframe[] {
  return [...keyframes]
    .sort((left, right) => left.atFrame - right.atFrame)
    .map((keyframe) => ({
      atFrame: keyframe.atFrame,
      ...(keyframe.crop === undefined ? {} : { crop: keyframe.crop.trim() }),
      ...(keyframe.zoom === undefined ? {} : { zoom: keyframe.zoom }),
      ...(keyframe.cursorPath === undefined ? {} : { cursorPath: keyframe.cursorPath.trim() }),
      ...(keyframe.label === undefined ? {} : { label: keyframe.label.trim() }),
    }));
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

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))];
}
