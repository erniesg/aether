import type { CaptureArtifact, CaptureResult } from '@/lib/providers/capture/types';
import type {
  MotionBeatRole,
  MotionGraphNode,
  MotionProject,
  MotionProvenanceRef,
  StoryBeat,
  TimelineClip,
  TimelineTrack,
} from './project';
import { appendCaptureExecutionHistory } from './executionHistory';

export interface ApplyCaptureResultToMotionProjectOptions {
  targetBeatRole?: MotionBeatRole;
  updatedAt?: number;
}

export function applyCaptureResultToMotionProject(
  project: MotionProject,
  captureResult: CaptureResult,
  options: ApplyCaptureResultToMotionProjectOptions = {}
): MotionProject {
  const targetBeatRole = options.targetBeatRole ?? 'demo';
  const visualArtifact = selectPrimaryVisualArtifact(captureResult.artifacts);
  const targetBeatIds = beatIdsForRole(project.story, targetBeatRole);
  const captureRefs = captureResult.artifacts.map(captureArtifactRef);
  const captureProvenance = uniqueProvenance([
    ...captureResult.provenance,
    ...captureResult.artifacts.flatMap((artifact) => artifact.provenance),
    ...captureRefs,
  ]);

  const story = visualArtifact
    ? applyCaptureToStory(project.story, targetBeatRole, visualArtifact, captureProvenance)
    : project.story;
  const tracks = visualArtifact
    ? applyCaptureToTracks(project.tracks, targetBeatIds, captureResult.providerId, visualArtifact)
    : project.tracks;

  return {
    ...project,
    story,
    tracks,
    drafts: project.drafts.map((draft) => ({
      ...draft,
      story: visualArtifact
        ? applyCaptureToStory(draft.story, targetBeatRole, visualArtifact, captureProvenance)
        : draft.story,
      tracks:
        visualArtifact && draft.tracks.length > 0
          ? applyCaptureToTracks(
              draft.tracks,
              targetBeatIds,
              captureResult.providerId,
              visualArtifact
            )
          : draft.tracks,
    })),
    graphNodes: upsertCaptureNode(project.graphNodes, captureResult, captureRefs, captureProvenance),
    executionHistory: appendCaptureExecutionHistory(
      project.executionHistory,
      captureResult,
      options.updatedAt ?? project.updatedAt
    ),
    updatedAt: options.updatedAt ?? project.updatedAt,
  };
}

function selectPrimaryVisualArtifact(artifacts: CaptureArtifact[]): CaptureArtifact | undefined {
  return (
    artifacts.find((artifact) => artifact.kind === 'screenshot') ??
    artifacts.find((artifact) => artifact.kind === 'recording')
  );
}

function beatIdsForRole(story: StoryBeat[], role: MotionBeatRole): Set<string> {
  return new Set(story.filter((beat) => beat.role === role).map((beat) => beat.id));
}

function applyCaptureToStory(
  story: StoryBeat[],
  role: MotionBeatRole,
  artifact: CaptureArtifact,
  captureProvenance: MotionProvenanceRef[]
): StoryBeat[] {
  return story.map((beat) => {
    if (beat.role !== role) return beat;

    return {
      ...beat,
      selectedAssetIds: uniqueStrings([...beat.selectedAssetIds, artifact.id]),
      provenance: uniqueProvenance([...beat.provenance, ...captureProvenance]),
    };
  });
}

function applyCaptureToTracks(
  tracks: TimelineTrack[],
  targetBeatIds: Set<string>,
  providerId: string,
  artifact: CaptureArtifact
): TimelineTrack[] {
  return tracks.map((track) => ({
    ...track,
    clips: track.clips.map((clip) =>
      isTargetAppFrameClip(clip, targetBeatIds)
        ? applyCaptureToClip(clip, providerId, artifact)
        : clip
    ),
  }));
}

function isTargetAppFrameClip(clip: TimelineClip, targetBeatIds: Set<string>): boolean {
  if (clip.componentId !== 'app-frame') return false;
  if (targetBeatIds.size === 0) return false;

  return clip.provenance.some((ref) => ref.kind === 'story-beat' && targetBeatIds.has(ref.ref));
}

function applyCaptureToClip(
  clip: TimelineClip,
  providerId: string,
  artifact: CaptureArtifact
): TimelineClip {
  return {
    ...clip,
    assetId: artifact.id,
    props: {
      ...clip.props,
      assetId: artifact.id,
      assetUrl: artifact.assetUrl,
      captureArtifactKind: artifact.kind,
      captureProviderId: providerId,
      width: artifact.width,
      height: artifact.height,
      mimeType: artifact.mimeType,
      viewport: artifact.viewport,
      cursorTargets: artifact.cursorTargets,
      ...(artifact.redactions?.length ? { redactions: artifact.redactions } : {}),
      ...(artifact.durationMs === undefined ? {} : { durationMs: artifact.durationMs }),
    },
    provenance: uniqueProvenance([
      ...clip.provenance,
      ...artifact.provenance,
      captureArtifactRef(artifact),
    ]),
  };
}

function completeCaptureNode(
  node: MotionGraphNode,
  captureResult: CaptureResult,
  captureRefs: MotionProvenanceRef[],
  captureProvenance: MotionProvenanceRef[]
): MotionGraphNode {
  return {
    ...node,
    outputRefs: captureResult.artifacts.map((artifact) => artifact.id),
    providerId: captureResult.providerId,
    status: 'done',
    provenance: uniqueProvenance([...node.provenance, ...captureProvenance, ...captureRefs]),
  };
}

function upsertCaptureNode(
  nodes: MotionGraphNode[],
  captureResult: CaptureResult,
  captureRefs: MotionProvenanceRef[],
  captureProvenance: MotionProvenanceRef[]
): MotionGraphNode[] {
  const existingIndex = nodes.findIndex((node) => node.kind === 'capture');
  if (existingIndex !== -1) {
    return nodes.map((node, index) =>
      index === existingIndex
        ? completeCaptureNode(node, captureResult, captureRefs, captureProvenance)
        : node
    );
  }

  return [
    ...nodes,
    completeCaptureNode(
      {
        id: `node-capture-${captureResult.providerId}`,
        kind: 'capture',
        inputRefs: uniqueStrings(captureResult.provenance.map((ref) => ref.ref)),
        outputRefs: [],
        providerId: captureResult.providerId,
        status: 'running',
        provenance: captureResult.provenance,
      },
      captureResult,
      captureRefs,
      captureProvenance
    ),
  ];
}

function captureArtifactRef(artifact: CaptureArtifact): MotionProvenanceRef {
  return { kind: 'capture', ref: artifact.id };
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
