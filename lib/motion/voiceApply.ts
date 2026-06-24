import type {
  VoiceArtifact,
  VoiceSynthesisResult,
} from '@/lib/providers/voice/types';
import type {
  MotionGraphNode,
  MotionProject,
  MotionProvenanceRef,
  TimelineClip,
  TimelineTrack,
} from './project';
import { appendVoiceExecutionHistory } from './executionHistory';

export interface ApplyVoiceSynthesisResultToMotionProjectOptions {
  clipId: string;
  updatedAt?: number;
}

interface VoiceArtifactsByKind {
  audio?: VoiceArtifact;
  wordTimings?: VoiceArtifact;
  transcript?: VoiceArtifact;
}

export function applyVoiceSynthesisResultToMotionProject(
  project: MotionProject,
  result: VoiceSynthesisResult,
  options: ApplyVoiceSynthesisResultToMotionProjectOptions
): MotionProject {
  const artifacts = artifactsByKind(result.artifacts);
  const voiceRefs = result.artifacts.map(voiceArtifactRef);
  const provenance = uniqueProvenance([
    ...result.provenance,
    ...result.artifacts.flatMap((artifact) => artifact.provenance),
    ...voiceRefs,
  ]);
  const tracks = applyVoiceToTracks(project.tracks, options.clipId, result.providerId, artifacts);

  return {
    ...project,
    tracks,
    drafts: project.drafts.map((draft) => ({
      ...draft,
      tracks:
        draft.tracks.length > 0
          ? applyVoiceToTracks(draft.tracks, options.clipId, result.providerId, artifacts)
          : draft.tracks,
    })),
    graphNodes: upsertVoiceNode(project.graphNodes, {
      clipId: options.clipId,
      providerId: result.providerId,
      outputRefs: result.artifacts.map((artifact) => artifact.id),
      provenance,
    }),
    executionHistory: appendVoiceExecutionHistory(
      project.executionHistory,
      result,
      options.clipId,
      options.updatedAt ?? project.updatedAt
    ),
    updatedAt: options.updatedAt ?? project.updatedAt,
  };
}

function artifactsByKind(artifacts: VoiceArtifact[]): VoiceArtifactsByKind {
  return {
    audio: artifacts.find((artifact) => artifact.kind === 'audio'),
    wordTimings: artifacts.find((artifact) => artifact.kind === 'word-timings'),
    transcript: artifacts.find((artifact) => artifact.kind === 'transcript'),
  };
}

function applyVoiceToTracks(
  tracks: TimelineTrack[],
  voiceClipId: string,
  providerId: string,
  artifacts: VoiceArtifactsByKind
): TimelineTrack[] {
  return tracks.map((track) => ({
    ...track,
    clips: track.clips.map((clip) => {
      if (clip.id === voiceClipId && track.kind === 'voice') {
        return applyVoiceToClip(clip, providerId, artifacts);
      }

      if (track.kind === 'caption' && clip.id === captionClipIdForVoiceClip(voiceClipId)) {
        return applyVoiceToCaptionClip(clip, voiceClipId, artifacts);
      }

      return clip;
    }),
  }));
}

function applyVoiceToClip(
  clip: TimelineClip,
  providerId: string,
  artifacts: VoiceArtifactsByKind
): TimelineClip {
  return {
    ...clip,
    ...(artifacts.audio ? { assetId: artifacts.audio.id } : {}),
    props: {
      ...clip.props,
      status: 'ready',
      voiceProviderId: providerId,
      ...(artifacts.audio
        ? {
            audioAssetId: artifacts.audio.id,
            audioUrl: artifacts.audio.assetUrl,
            durationMs: artifacts.audio.durationMs,
          }
        : {}),
      ...(artifacts.wordTimings
        ? {
            wordTimingsAssetId: artifacts.wordTimings.id,
            wordTimingsUrl: artifacts.wordTimings.assetUrl,
          }
        : {}),
      ...(artifacts.transcript
        ? {
            transcriptAssetId: artifacts.transcript.id,
            transcriptUrl: artifacts.transcript.assetUrl,
          }
        : {}),
    },
    provenance: uniqueProvenance([
      ...clip.provenance,
      ...Object.values(artifacts).flatMap((artifact) =>
        artifact ? [...artifact.provenance, voiceArtifactRef(artifact)] : []
      ),
    ]),
  };
}

function applyVoiceToCaptionClip(
  clip: TimelineClip,
  voiceClipId: string,
  artifacts: VoiceArtifactsByKind
): TimelineClip {
  return {
    ...clip,
    props: {
      ...clip.props,
      voiceClipId,
      ...(artifacts.wordTimings
        ? {
            wordTimingsAssetId: artifacts.wordTimings.id,
            wordTimingsUrl: artifacts.wordTimings.assetUrl,
          }
        : {}),
      ...(artifacts.transcript
        ? {
            transcriptAssetId: artifacts.transcript.id,
            transcriptUrl: artifacts.transcript.assetUrl,
          }
        : {}),
    },
    provenance: uniqueProvenance([
      ...clip.provenance,
      ...[artifacts.wordTimings, artifacts.transcript].flatMap((artifact) =>
        artifact ? [...artifact.provenance, voiceArtifactRef(artifact)] : []
      ),
    ]),
  };
}

function captionClipIdForVoiceClip(voiceClipId: string): string {
  return voiceClipId.replace(/-voice$/, '-caption');
}

function upsertVoiceNode(
  nodes: MotionGraphNode[],
  input: {
    clipId: string;
    providerId: string;
    outputRefs: string[];
    provenance: MotionProvenanceRef[];
  }
): MotionGraphNode[] {
  const nextNode: MotionGraphNode = {
    id: 'node-voice-plan',
    kind: 'voice',
    inputRefs: [input.clipId],
    outputRefs: input.outputRefs,
    providerId: input.providerId,
    status: 'done',
    provenance: input.provenance,
  };

  const existingIndex = nodes.findIndex((node) => node.id === nextNode.id);
  if (existingIndex === -1) return [...nodes, nextNode];

  return nodes.map((node, index) =>
    index === existingIndex
      ? {
          ...node,
          inputRefs: uniqueStrings([...node.inputRefs, ...nextNode.inputRefs]),
          outputRefs: uniqueStrings([...node.outputRefs, ...nextNode.outputRefs]),
          providerId: nextNode.providerId,
          status: nextNode.status,
          provenance: uniqueProvenance([...node.provenance, ...nextNode.provenance]),
        }
      : node
  );
}

function voiceArtifactRef(artifact: VoiceArtifact): MotionProvenanceRef {
  return { kind: 'voice', ref: artifact.id };
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
  return Array.from(new Set(values));
}
