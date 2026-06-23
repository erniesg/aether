import {
  DEFAULT_MOTION_FPS,
  motionSeconds,
  type MotionBeatRole,
  type MotionGraphNode,
  type MotionProject,
  type MotionProvenanceRef,
  type TimelineClip,
  type TimelineTrack,
} from './project';

export type MotionSyncPlanStatus = 'ready' | 'needs-timeline' | 'needs-voice';
export type MotionVoiceSyncStatus = 'planned' | 'ready';
export type MotionCaptionTimingSource = 'timeline' | 'word-timings' | 'transcript';

export interface MotionSyncPlanBlocker {
  id: 'timeline-required' | 'voice-receipts-required';
  label: string;
}

export interface BuildMotionSyncPlanOptions {
  draftId?: string;
  fps?: number;
  requestedAt: number;
}

export interface MotionSyncBeatMarker {
  id: string;
  beatId: string;
  role: MotionBeatRole;
  textClipId: string;
  captionClipId: string | null;
  voiceClipId: string | null;
  startFrame: number;
  durationFrames: number;
  startSeconds: number;
  durationSeconds: number;
  voiceStatus: MotionVoiceSyncStatus;
  captionTimingSource: MotionCaptionTimingSource;
  audioAssetId?: string;
  wordTimingsAssetId?: string;
  transcriptAssetId?: string;
  provenance: MotionProvenanceRef[];
}

export interface MotionSyncCaptionLink {
  id: string;
  captionClipId: string;
  voiceClipId: string | null;
  timingSource: MotionCaptionTimingSource;
  startSeconds: number;
  durationSeconds: number;
  text: string;
  provenance: MotionProvenanceRef[];
}

export interface MotionSyncTransitionCue {
  id: string;
  clipId: string;
  fromBeatId: string | null;
  toBeatId: string | null;
  startFrame: number;
  durationFrames: number;
  startSeconds: number;
  durationSeconds: number;
  provenance: MotionProvenanceRef[];
}

export interface MotionSyncSoundCue {
  id: string;
  kind: 'transition' | 'emphasis' | 'cta';
  startSeconds: number;
  durationSeconds: number;
  label: string;
  provenance: MotionProvenanceRef[];
}

export interface MotionSyncPlan {
  id: string;
  projectId: string;
  draftId: string;
  status: MotionSyncPlanStatus;
  providerRequirements: string[];
  beatMarkers: MotionSyncBeatMarker[];
  captionLinks: MotionSyncCaptionLink[];
  transitionCues: MotionSyncTransitionCue[];
  soundCues: MotionSyncSoundCue[];
  syncNode: MotionGraphNode | null;
  blockers: MotionSyncPlanBlocker[];
  requestedAt: number;
  provenance: MotionProvenanceRef[];
}

interface TrackSelection {
  tracks: TimelineTrack[];
  textTrack?: TimelineTrack;
  captionTrack?: TimelineTrack;
  voiceTrack?: TimelineTrack;
  transitionTrack?: TimelineTrack;
}

export function buildMotionSyncPlan(
  project: MotionProject,
  options: BuildMotionSyncPlanOptions
): MotionSyncPlan {
  const draftId = options.draftId ?? project.currentDraftId;
  const fps = options.fps ?? DEFAULT_MOTION_FPS;
  const selection = selectTracks(project, draftId);
  const id = `sync-plan-${project.id}-${draftId}`;

  if (!selection.textTrack || selection.textTrack.clips.length === 0) {
    return {
      id,
      projectId: project.id,
      draftId,
      status: 'needs-timeline',
      providerRequirements: [],
      beatMarkers: [],
      captionLinks: [],
      transitionCues: [],
      soundCues: [],
      syncNode: null,
      blockers: [
        {
          id: 'timeline-required',
          label: 'Materialize timeline before sync planning',
        },
      ],
      requestedAt: options.requestedAt,
      provenance: project.sourceRefs,
    };
  }

  const beatMarkers = buildBeatMarkers(selection, fps);
  const captionLinks = buildCaptionLinks(selection, fps);
  const transitionCues = buildTransitionCues(selection, fps);
  const soundCues = buildSoundCues(beatMarkers, transitionCues);
  const allVoicesReady =
    beatMarkers.length > 0 && beatMarkers.every((marker) => marker.voiceStatus === 'ready');
  const status: MotionSyncPlanStatus = allVoicesReady ? 'ready' : 'needs-voice';
  const provenance = uniqueProvenance([
    ...project.sourceRefs,
    ...selection.tracks.map((track) => ({ kind: 'timeline' as const, ref: track.id })),
    ...beatMarkers.flatMap((marker) => marker.provenance),
    ...captionLinks.flatMap((link) => link.provenance),
    ...transitionCues.flatMap((cue) => cue.provenance),
  ]);

  return {
    id,
    projectId: project.id,
    draftId,
    status,
    providerRequirements: allVoicesReady ? [] : ['voice-synthesis', 'word-timing-alignment'],
    beatMarkers,
    captionLinks,
    transitionCues,
    soundCues,
    syncNode: {
      id: 'node-sync-plan',
      kind: 'sync',
      inputRefs: selection.tracks.map((track) => track.id),
      outputRefs: [
        ...beatMarkers.map((marker) => marker.id),
        ...captionLinks.map((link) => link.id),
        ...transitionCues.map((cue) => cue.id),
        ...soundCues.map((cue) => cue.id),
      ],
      status: 'planned',
      provenance,
    },
    blockers: allVoicesReady
      ? []
      : [
          {
            id: 'voice-receipts-required',
            label: 'Generate voice and word timings before final sync',
          },
        ],
    requestedAt: options.requestedAt,
    provenance,
  };
}

function selectTracks(project: MotionProject, draftId: string): TrackSelection {
  const draft = project.drafts.find((candidate) => candidate.id === draftId);
  const tracks = draft?.tracks.length ? draft.tracks : draftId === project.currentDraftId ? project.tracks : [];

  return {
    tracks,
    textTrack: tracks.find((track) => track.kind === 'text'),
    captionTrack: tracks.find((track) => track.kind === 'caption'),
    voiceTrack: tracks.find((track) => track.kind === 'voice'),
    transitionTrack: tracks.find((track) => track.kind === 'transition'),
  };
}

function buildBeatMarkers(selection: TrackSelection, fps: number): MotionSyncBeatMarker[] {
  return (selection.textTrack?.clips ?? []).map((textClip) => {
    const beatId = storyBeatId(textClip);
    const captionClip = findByBeat(selection.captionTrack, beatId);
    const voiceClip = findByBeat(selection.voiceTrack, beatId);
    const voiceStatus = voiceClip && isVoiceReady(voiceClip) ? 'ready' : 'planned';
    const timingSource = captionTimingSource(captionClip, voiceClip);

    return {
      id: `sync-marker-${beatId ?? textClip.id}`,
      beatId: beatId ?? textClip.id,
      role: roleForClip(textClip),
      textClipId: textClip.id,
      captionClipId: captionClip?.id ?? null,
      voiceClipId: voiceClip?.id ?? null,
      startFrame: textClip.startFrame,
      durationFrames: textClip.durationFrames,
      startSeconds: roundSeconds(textClip.startFrame, fps),
      durationSeconds: roundSeconds(textClip.durationFrames, fps),
      voiceStatus,
      captionTimingSource: timingSource,
      ...voiceAssetProps(voiceClip),
      provenance: uniqueProvenance([
        { kind: 'timeline', ref: textClip.id },
        ...(captionClip ? [{ kind: 'timeline' as const, ref: captionClip.id }] : []),
        ...(voiceClip ? [{ kind: 'timeline' as const, ref: voiceClip.id }] : []),
        ...textClip.provenance,
        ...(captionClip?.provenance ?? []),
        ...(voiceClip?.provenance ?? []),
      ]),
    };
  });
}

function buildCaptionLinks(selection: TrackSelection, fps: number): MotionSyncCaptionLink[] {
  return (selection.captionTrack?.clips ?? []).map((captionClip) => {
    const beatId = storyBeatId(captionClip);
    const voiceClip = findByBeat(selection.voiceTrack, beatId);

    return {
      id: `caption-link-${captionClip.id}`,
      captionClipId: captionClip.id,
      voiceClipId: voiceClip?.id ?? null,
      timingSource: captionTimingSource(captionClip, voiceClip),
      startSeconds: roundSeconds(captionClip.startFrame, fps),
      durationSeconds: roundSeconds(captionClip.durationFrames, fps),
      text: stringProp(captionClip, 'text'),
      provenance: uniqueProvenance([
        { kind: 'timeline', ref: captionClip.id },
        ...(voiceClip ? [{ kind: 'timeline' as const, ref: voiceClip.id }] : []),
        ...captionClip.provenance,
        ...(voiceClip?.provenance ?? []),
      ]),
    };
  });
}

function buildTransitionCues(selection: TrackSelection, fps: number): MotionSyncTransitionCue[] {
  return (selection.transitionTrack?.clips ?? []).map((clip) => ({
    id: `transition-cue-${clip.id}`,
    clipId: clip.id,
    fromBeatId: stringProp(clip, 'fromBeatId') || null,
    toBeatId: stringProp(clip, 'toBeatId') || null,
    startFrame: clip.startFrame,
    durationFrames: clip.durationFrames,
    startSeconds: roundSeconds(clip.startFrame, fps),
    durationSeconds: roundSeconds(clip.durationFrames, fps),
    provenance: uniqueProvenance([{ kind: 'timeline', ref: clip.id }, ...clip.provenance]),
  }));
}

function buildSoundCues(
  beatMarkers: MotionSyncBeatMarker[],
  transitionCues: MotionSyncTransitionCue[]
): MotionSyncSoundCue[] {
  const transitionSoundCues = transitionCues.map((cue) => ({
    id: `sfx-${cue.clipId}`,
    kind: 'transition' as const,
    startSeconds: cue.startSeconds,
    durationSeconds: cue.durationSeconds,
    label: 'Soft transition accent',
    provenance: cue.provenance,
  }));

  const cta = beatMarkers.find((marker) => marker.role === 'cta');
  return [
    ...transitionSoundCues,
    ...(cta
      ? [
          {
            id: `sfx-${cta.beatId}-cta`,
            kind: 'cta' as const,
            startSeconds: Math.max(0, cta.startSeconds + cta.durationSeconds - 0.45),
            durationSeconds: 0.45,
            label: 'CTA confirmation accent',
            provenance: cta.provenance,
          },
        ]
      : []),
  ];
}

function storyBeatId(clip?: TimelineClip): string | null {
  return clip?.provenance.find((ref) => ref.kind === 'story-beat')?.ref ?? null;
}

function findByBeat(track: TimelineTrack | undefined, beatId: string | null): TimelineClip | undefined {
  if (!beatId) return undefined;
  return track?.clips.find((clip) =>
    clip.provenance.some((ref) => ref.kind === 'story-beat' && ref.ref === beatId)
  );
}

function roleForClip(clip: TimelineClip): MotionBeatRole {
  const role = clip.props.role;
  return typeof role === 'string' ? (role as MotionBeatRole) : 'demo';
}

function isVoiceReady(clip: TimelineClip): boolean {
  return Boolean(
    clip.assetId &&
      typeof clip.props.audioAssetId === 'string' &&
      typeof clip.props.wordTimingsAssetId === 'string'
  );
}

function captionTimingSource(
  captionClip: TimelineClip | undefined,
  voiceClip: TimelineClip | undefined
): MotionCaptionTimingSource {
  if (voiceClip && typeof voiceClip.props.wordTimingsAssetId === 'string') return 'word-timings';
  if (captionClip && typeof captionClip.props.transcriptAssetId === 'string') return 'transcript';
  return 'timeline';
}

function voiceAssetProps(voiceClip: TimelineClip | undefined): {
  audioAssetId?: string;
  wordTimingsAssetId?: string;
  transcriptAssetId?: string;
} {
  return {
    ...(typeof voiceClip?.props.audioAssetId === 'string'
      ? { audioAssetId: voiceClip.props.audioAssetId }
      : {}),
    ...(typeof voiceClip?.props.wordTimingsAssetId === 'string'
      ? { wordTimingsAssetId: voiceClip.props.wordTimingsAssetId }
      : {}),
    ...(typeof voiceClip?.props.transcriptAssetId === 'string'
      ? { transcriptAssetId: voiceClip.props.transcriptAssetId }
      : {}),
  };
}

function stringProp(clip: TimelineClip, key: string): string {
  const value = clip.props[key];
  return typeof value === 'string' ? value : '';
}

function roundSeconds(frames: number, fps: number): number {
  return Number(motionSeconds(frames, fps).toFixed(3));
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
