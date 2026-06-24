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

function applyArtifactToClip(
  clip: TimelineClip,
  providerId: string,
  artifact: MotionGeneratedVideoClip
): TimelineClip {
  const previousAssetId = clip.assetId ?? stringProp(clip.props.assetId);

  return {
    ...clip,
    assetId: artifact.id,
    props: {
      ...clip.props,
      assetId: artifact.id,
      assetUrl: artifact.assetUrl,
      generatedVideoAssetId: artifact.id,
      generatedVideoUrl: artifact.assetUrl,
      imageToVideoProviderId: providerId,
      sourceAssetId: artifact.sourceAssetId,
      ...(previousAssetId ? { sourceVisualAssetId: previousAssetId } : {}),
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
