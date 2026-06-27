import type {
  MotionGeneratedVideoClip,
  MotionImageToVideoResult,
} from '@/lib/providers/video/types';
import { appendImageToVideoExecutionHistory } from './executionHistory';
import type {
  MotionGraphNode,
  MotionProject,
  MotionProvenanceRef,
  TimelineClip,
  TimelineTrack,
} from './project';

export interface ApplyMotionImageToVideoResultToMotionProjectOptions {
  updatedAt?: number;
}

export interface MotionGeneratedVideoTake {
  id: string;
  assetId: string;
  requestId: string;
  assetUrl: string;
  providerId: string;
  sourceAssetId: string;
  sourceVisualAssetId?: string;
  durationMs?: number;
  width: number;
  height: number;
  mimeType: string;
  status: 'ready';
  provenance: MotionProvenanceRef[];
}

export interface ApplyStagedMotionImageToVideoTakeOptions {
  clipId: string;
  takeId: string;
  updatedAt?: number;
}

export function applyMotionImageToVideoResultToMotionProject(
  project: MotionProject,
  result: MotionImageToVideoResult,
  options: ApplyMotionImageToVideoResultToMotionProjectOptions = {}
): MotionProject {
  const artifactsByClipId = groupArtifactsByClipId(result.artifacts);
  const provenance = imageToVideoResultProvenance(result);

  return {
    ...project,
    tracks: applyArtifactsToTracks(project.tracks, result.providerId, artifactsByClipId),
    drafts: project.drafts.map((draft) => ({
      ...draft,
      tracks:
        draft.tracks.length > 0
          ? applyArtifactsToTracks(draft.tracks, result.providerId, artifactsByClipId)
          : draft.tracks,
    })),
    graphNodes: upsertImageToVideoNode(project.graphNodes, result, provenance),
    executionHistory: appendImageToVideoExecutionHistory(
      project.executionHistory,
      result,
      options.updatedAt ?? project.updatedAt
    ),
    updatedAt: options.updatedAt ?? project.updatedAt,
  };
}

export function applyStagedMotionImageToVideoTake(
  project: MotionProject,
  options: ApplyStagedMotionImageToVideoTakeOptions
): MotionProject | null {
  const take = findGeneratedVideoTake(project, options.clipId, options.takeId);
  if (!take) return null;

  return {
    ...project,
    tracks: applyGeneratedVideoTakeToTracks(project.tracks, options.clipId, take),
    drafts: project.drafts.map((draft) => ({
      ...draft,
      tracks:
        draft.tracks.length > 0
          ? applyGeneratedVideoTakeToTracks(draft.tracks, options.clipId, take)
          : draft.tracks,
    })),
    updatedAt: options.updatedAt ?? project.updatedAt,
  };
}

export function stageMotionImageToVideoResultForReview(
  project: MotionProject,
  result: MotionImageToVideoResult,
  options: ApplyMotionImageToVideoResultToMotionProjectOptions = {}
): MotionProject {
  const artifactsByClipId = groupArtifactsByClipId(result.artifacts);
  const provenance = imageToVideoResultProvenance(result);

  return {
    ...project,
    tracks: stageArtifactsOnTracks(project.tracks, result.providerId, artifactsByClipId),
    drafts: project.drafts.map((draft) => ({
      ...draft,
      tracks:
        draft.tracks.length > 0
          ? stageArtifactsOnTracks(draft.tracks, result.providerId, artifactsByClipId)
          : draft.tracks,
    })),
    graphNodes: upsertImageToVideoNode(project.graphNodes, result, provenance),
    executionHistory: appendImageToVideoExecutionHistory(
      project.executionHistory,
      result,
      options.updatedAt ?? project.updatedAt
    ),
    updatedAt: options.updatedAt ?? project.updatedAt,
  };
}

function groupArtifactsByClipId(
  artifacts: MotionGeneratedVideoClip[]
): Map<string, MotionGeneratedVideoClip> {
  return artifacts.reduce((grouped, artifact) => {
    grouped.set(artifact.clipId, artifact);
    return grouped;
  }, new Map<string, MotionGeneratedVideoClip>());
}

function applyArtifactsToTracks(
  tracks: TimelineTrack[],
  providerId: string,
  artifactsByClipId: Map<string, MotionGeneratedVideoClip>
): TimelineTrack[] {
  return tracks.map((track) => ({
    ...track,
    clips: track.clips.map((clip) => {
      const artifact = artifactsByClipId.get(clip.id);
      return artifact ? applyArtifactToClip(clip, providerId, artifact) : clip;
    }),
  }));
}

function applyGeneratedVideoTakeToTracks(
  tracks: TimelineTrack[],
  clipId: string,
  take: MotionGeneratedVideoTake
): TimelineTrack[] {
  return tracks.map((track) => ({
    ...track,
    clips: track.clips.map((clip) =>
      clip.id === clipId ? applyGeneratedVideoTakeToClip(clip, take) : clip
    ),
  }));
}

function stageArtifactsOnTracks(
  tracks: TimelineTrack[],
  providerId: string,
  artifactsByClipId: Map<string, MotionGeneratedVideoClip>
): TimelineTrack[] {
  return tracks.map((track) => ({
    ...track,
    clips: track.clips.map((clip) => {
      const artifact = artifactsByClipId.get(clip.id);
      return artifact ? stageArtifactOnClip(clip, providerId, artifact) : clip;
    }),
  }));
}

function applyArtifactToClip(
  clip: TimelineClip,
  providerId: string,
  artifact: MotionGeneratedVideoClip
): TimelineClip {
  const previousAssetId = clip.assetId ?? stringProp(clip.props.assetId);
  const selectedTake = generatedVideoTakeForArtifact(artifact, providerId, previousAssetId);
  const props = { ...clip.props };
  delete props.pendingGeneratedVideoTakeId;

  return {
    ...clip,
    assetId: artifact.id,
    props: {
      ...props,
      assetId: artifact.id,
      assetUrl: artifact.assetUrl,
      generatedVideoAssetId: artifact.id,
      generatedVideoUrl: artifact.assetUrl,
      imageToVideoProviderId: providerId,
      sourceAssetId: artifact.sourceAssetId,
      ...(previousAssetId ? { sourceVisualAssetId: previousAssetId } : {}),
      generatedVideoTakes: upsertGeneratedVideoTake(
        generatedVideoTakesFromProps(clip.props.generatedVideoTakes),
        selectedTake
      ),
      selectedGeneratedVideoTakeId: selectedTake.id,
      ...(artifact.durationMs === undefined ? {} : { durationMs: artifact.durationMs }),
      width: artifact.width,
      height: artifact.height,
      mimeType: artifact.mimeType,
      status: 'ready',
    },
    provenance: uniqueProvenance([
      ...clip.provenance,
      ...artifact.provenance,
      imageToVideoArtifactRef(artifact),
    ]),
  };
}

function applyGeneratedVideoTakeToClip(
  clip: TimelineClip,
  take: MotionGeneratedVideoTake
): TimelineClip {
  const props = { ...clip.props };
  delete props.pendingGeneratedVideoTakeId;

  return {
    ...clip,
    assetId: take.assetId,
    props: {
      ...props,
      assetId: take.assetId,
      assetUrl: take.assetUrl,
      generatedVideoAssetId: take.assetId,
      generatedVideoUrl: take.assetUrl,
      imageToVideoProviderId: take.providerId,
      sourceAssetId: take.sourceAssetId,
      ...(take.sourceVisualAssetId ? { sourceVisualAssetId: take.sourceVisualAssetId } : {}),
      ...(take.durationMs === undefined ? {} : { durationMs: take.durationMs }),
      width: take.width,
      height: take.height,
      mimeType: take.mimeType,
      selectedGeneratedVideoTakeId: take.id,
      status: 'ready',
    },
    provenance: uniqueProvenance([
      ...clip.provenance,
      ...take.provenance,
      imageToVideoTakeRef(take),
    ]),
  };
}

function stageArtifactOnClip(
  clip: TimelineClip,
  providerId: string,
  artifact: MotionGeneratedVideoClip
): TimelineClip {
  const previousAssetId = clip.assetId ?? stringProp(clip.props.assetId);
  const nextTake = generatedVideoTakeForArtifact(artifact, providerId, previousAssetId);

  return {
    ...clip,
    props: {
      ...clip.props,
      generatedVideoTakes: upsertGeneratedVideoTake(
        generatedVideoTakesFromProps(clip.props.generatedVideoTakes),
        nextTake
      ),
      pendingGeneratedVideoTakeId: nextTake.id,
    },
    provenance: uniqueProvenance([
      ...clip.provenance,
      ...artifact.provenance,
      imageToVideoArtifactRef(artifact),
    ]),
  };
}

function generatedVideoTakeForArtifact(
  artifact: MotionGeneratedVideoClip,
  providerId: string,
  sourceVisualAssetId?: string
): MotionGeneratedVideoTake {
  return {
    id: artifact.id,
    assetId: artifact.id,
    requestId: artifact.requestId,
    assetUrl: artifact.assetUrl,
    providerId,
    sourceAssetId: artifact.sourceAssetId,
    ...(sourceVisualAssetId ? { sourceVisualAssetId } : {}),
    ...(artifact.durationMs === undefined ? {} : { durationMs: artifact.durationMs }),
    width: artifact.width,
    height: artifact.height,
    mimeType: artifact.mimeType,
    status: 'ready',
    provenance: uniqueProvenance([...artifact.provenance, imageToVideoArtifactRef(artifact)]),
  };
}

function generatedVideoTakesFromProps(value: unknown): MotionGeneratedVideoTake[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isGeneratedVideoTake);
}

function isGeneratedVideoTake(value: unknown): value is MotionGeneratedVideoTake {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Partial<MotionGeneratedVideoTake>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.assetId === 'string' &&
    typeof candidate.assetUrl === 'string' &&
    typeof candidate.providerId === 'string' &&
    typeof candidate.requestId === 'string' &&
    typeof candidate.sourceAssetId === 'string' &&
    typeof candidate.width === 'number' &&
    typeof candidate.height === 'number' &&
    typeof candidate.mimeType === 'string' &&
    candidate.status === 'ready' &&
    Array.isArray(candidate.provenance)
  );
}

function upsertGeneratedVideoTake(
  takes: MotionGeneratedVideoTake[],
  nextTake: MotionGeneratedVideoTake
): MotionGeneratedVideoTake[] {
  return [...takes.filter((take) => take.id !== nextTake.id), nextTake];
}

function findGeneratedVideoTake(
  project: MotionProject,
  clipId: string,
  takeId: string
): MotionGeneratedVideoTake | null {
  for (const clip of allProjectClips(project)) {
    if (clip.id !== clipId) continue;
    const take = generatedVideoTakesFromProps(clip.props.generatedVideoTakes).find(
      (candidate) => candidate.id === takeId
    );
    if (take) return take;
  }
  return null;
}

function allProjectClips(project: MotionProject): TimelineClip[] {
  return [
    ...project.tracks.flatMap((track) => track.clips),
    ...project.drafts.flatMap((draft) => draft.tracks.flatMap((track) => track.clips)),
  ];
}

function upsertImageToVideoNode(
  nodes: MotionGraphNode[],
  result: MotionImageToVideoResult,
  provenance: MotionProvenanceRef[]
): MotionGraphNode[] {
  const nextNode: MotionGraphNode = {
    id: 'node-image-to-video-plan',
    kind: 'image-to-video',
    inputRefs: uniqueStrings(
      result.artifacts.flatMap((artifact) => [artifact.clipId, artifact.sourceAssetId])
    ),
    outputRefs: result.artifacts.map((artifact) => artifact.id),
    providerId: result.providerId,
    status: 'done',
    provenance,
  };
  const existingIndex = nodes.findIndex((node) => node.id === nextNode.id);
  if (existingIndex === -1) return [...nodes, nextNode];

  return nodes.map((node, index) =>
    index === existingIndex
      ? {
          ...node,
          inputRefs: uniqueStrings([...node.inputRefs, ...nextNode.inputRefs]),
          outputRefs: uniqueStrings([...node.outputRefs, ...nextNode.outputRefs]),
          providerId: result.providerId,
          status: 'done',
          provenance: uniqueProvenance([...node.provenance, ...nextNode.provenance]),
        }
      : node
  );
}

function imageToVideoResultProvenance(
  result: MotionImageToVideoResult
): MotionProvenanceRef[] {
  return uniqueProvenance([
    ...result.provenance,
    ...result.artifacts.flatMap((artifact) => [
      ...artifact.provenance,
      imageToVideoArtifactRef(artifact),
    ]),
  ]);
}

function imageToVideoArtifactRef(artifact: MotionGeneratedVideoClip): MotionProvenanceRef {
  return { kind: 'image-to-video', ref: artifact.id };
}

function imageToVideoTakeRef(take: MotionGeneratedVideoTake): MotionProvenanceRef {
  return { kind: 'image-to-video', ref: take.id };
}

function stringProp(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values));
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
