import type {
  VoiceArtifact,
  VoiceSynthesisRequest,
} from '@/lib/providers/voice/types';
import {
  DEFAULT_MOTION_FPS,
  motionSeconds,
  type MotionGraphNode,
  type MotionProject,
  type MotionProvenanceRef,
  type TimelineClip,
  type TimelineTrack,
} from './project';

export type MotionVoicePlanStatus = 'ready' | 'needs-timeline';

export interface MotionVoicePlanBlocker {
  id: 'voice-track-required';
  label: string;
}

export interface BuildMotionVoicePlanOptions {
  draftId?: string;
  fps?: number;
  requestedAt: number;
  voiceId?: string;
}

export interface MotionVoicePlanRequest extends VoiceSynthesisRequest {
  targetSeconds: number;
}

export interface MotionVoicePlan {
  id: string;
  projectId: string;
  draftId: string;
  status: MotionVoicePlanStatus;
  providerRequirements: string[];
  requests: MotionVoicePlanRequest[];
  voiceNode: MotionGraphNode | null;
  blockers: MotionVoicePlanBlocker[];
  requestedAt: number;
  provenance: MotionProvenanceRef[];
}

export function buildMotionVoicePlan(
  project: MotionProject,
  options: BuildMotionVoicePlanOptions
): MotionVoicePlan {
  const draftId = options.draftId ?? project.currentDraftId;
  const fps = options.fps ?? DEFAULT_MOTION_FPS;
  const voiceTracks = selectTracks(project, draftId).filter((track) => track.kind === 'voice');
  const voiceClips = voiceTracks.flatMap((track) =>
    track.clips.map((clip) => ({ track, clip }))
  );
  const id = `voice-plan-${project.id}-${draftId}`;

  if (voiceClips.length === 0) {
    return {
      id,
      projectId: project.id,
      draftId,
      status: 'needs-timeline',
      providerRequirements: [],
      requests: [],
      voiceNode: null,
      blockers: [
        {
          id: 'voice-track-required',
          label: 'Materialize voice timeline before synthesis',
        },
      ],
      requestedAt: options.requestedAt,
      provenance: project.sourceRefs,
    };
  }

  const requests = voiceClips.map(({ track, clip }) =>
    buildRequest({
      projectId: project.id,
      draftId,
      track,
      clip,
      fps,
      voiceId: options.voiceId,
    })
  );
  const provenance = uniqueProvenance([
    ...project.sourceRefs,
    ...voiceTracks.map((track) => ({ kind: 'timeline' as const, ref: track.id })),
    ...requests.flatMap((request) => request.provenance),
  ]);

  return {
    id,
    projectId: project.id,
    draftId,
    status: 'ready',
    providerRequirements: ['voice-synthesis', 'word-timing-alignment'],
    requests,
    voiceNode: {
      id: 'node-voice-plan',
      kind: 'voice',
      inputRefs: requests.map((request) => request.clipId),
      outputRefs: requests.flatMap((request) =>
        request.expectedArtifacts.map((artifact) => artifact.id)
      ),
      status: 'planned',
      provenance,
    },
    blockers: [],
    requestedAt: options.requestedAt,
    provenance,
  };
}

function selectTracks(project: MotionProject, draftId: string): TimelineTrack[] {
  const draft = project.drafts.find((candidate) => candidate.id === draftId);
  if (draft?.tracks.length) return draft.tracks;
  if (draftId === project.currentDraftId) return project.tracks;
  return [];
}

function buildRequest(input: {
  projectId: string;
  draftId: string;
  track: TimelineTrack;
  clip: TimelineClip;
  fps: number;
  voiceId?: string;
}): MotionVoicePlanRequest {
  const provenance = uniqueProvenance([
    { kind: 'timeline' as const, ref: input.track.id },
    { kind: 'timeline' as const, ref: input.clip.id },
    ...input.clip.provenance,
  ]);

  return {
    id: `voice-${input.clip.id}`,
    projectId: input.projectId,
    draftId: input.draftId,
    clipId: input.clip.id,
    trackId: input.track.id,
    text: textForClip(input.clip),
    voiceId: input.voiceId,
    startFrame: input.clip.startFrame,
    durationFrames: input.clip.durationFrames,
    targetSeconds: motionSeconds(input.clip.durationFrames, input.fps),
    fps: input.fps,
    expectedArtifacts: expectedArtifacts({
      projectId: input.projectId,
      draftId: input.draftId,
      clipId: input.clip.id,
      provenance,
    }),
    provenance,
  };
}

function textForClip(clip: TimelineClip): string {
  const text = clip.props.text;
  return typeof text === 'string' ? text : '';
}

function expectedArtifacts(input: {
  projectId: string;
  draftId: string;
  clipId: string;
  provenance: MotionProvenanceRef[];
}): VoiceArtifact[] {
  const basePath = `voice/${input.projectId}/${input.draftId}/${input.clipId}`;
  const base = {
    provenance: input.provenance,
  };

  return [
    {
      ...base,
      id: `voice-${input.clipId}-audio`,
      kind: 'audio',
      mimeType: 'audio/mpeg',
      path: `${basePath}.mp3`,
    },
    {
      ...base,
      id: `voice-${input.clipId}-word-timings`,
      kind: 'word-timings',
      mimeType: 'application/json',
      path: `${basePath}.words.json`,
    },
    {
      ...base,
      id: `voice-${input.clipId}-transcript`,
      kind: 'transcript',
      mimeType: 'text/plain',
      path: `${basePath}.txt`,
    },
  ];
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
