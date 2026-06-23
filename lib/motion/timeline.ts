import {
  DEFAULT_MOTION_FPS,
  motionFrames,
  type MotionGraphNode,
  type MotionProject,
  type StoryBeat,
  type TimelineClip,
  type TimelineTrack,
} from './project';

export interface CompileStoryToTimelineOptions {
  draftId?: string;
  fps?: number;
  transitionSeconds?: number;
}

export interface MaterializeMotionTimelineOptions extends CompileStoryToTimelineOptions {
  updatedAt?: number;
}

function selectStory(project: MotionProject, draftId?: string): StoryBeat[] {
  const selectedDraftId = draftId ?? project.currentDraftId;
  const draft = project.drafts.find((candidate) => candidate.id === selectedDraftId);

  if (draft) {
    return draft.story;
  }

  if (draftId) {
    throw new Error(`Motion draft not found: ${draftId}`);
  }

  return project.story;
}

function clipProvenance(beat: StoryBeat): TimelineClip['provenance'] {
  return [{ kind: 'story-beat', ref: beat.id }, ...beat.provenance];
}

export function compileStoryToTimeline(
  project: MotionProject,
  options: CompileStoryToTimelineOptions = {}
): TimelineTrack[] {
  const fps = options.fps ?? DEFAULT_MOTION_FPS;
  const transitionFrames = motionFrames(options.transitionSeconds ?? 0.35, fps);
  const story = selectStory(project, options.draftId);
  let cursor = 0;
  const textClips: TimelineClip[] = [];
  const captionClips: TimelineClip[] = [];
  const voiceClips: TimelineClip[] = [];
  const transitionClips: TimelineClip[] = [];

  story.forEach((beat, index) => {
    const durationFrames = motionFrames(beat.targetSeconds, fps);
    const provenance = clipProvenance(beat);

    textClips.push({
      id: `clip-${beat.id}-text`,
      assetId: beat.selectedAssetIds[0],
      componentId: beat.templateId,
      startFrame: cursor,
      durationFrames,
      props: { narration: beat.narration, role: beat.role },
      linkedVariantScope: 'global',
      provenance,
    });

    captionClips.push({
      id: `clip-${beat.id}-caption`,
      componentId: 'caption-line',
      startFrame: cursor,
      durationFrames,
      props: { text: beat.narration, role: beat.role },
      linkedVariantScope: 'global',
      provenance,
    });

    voiceClips.push({
      id: `clip-${beat.id}-voice`,
      componentId: 'voice-line',
      startFrame: cursor,
      durationFrames,
      props: { text: beat.narration, status: 'planned' },
      linkedVariantScope: 'global',
      provenance,
    });

    if (index > 0) {
      const previousBeat = story[index - 1];
      transitionClips.push({
        id: `clip-transition-${previousBeat.id}-to-${beat.id}`,
        componentId: 'soft-wipe',
        startFrame: Math.max(0, cursor - transitionFrames),
        durationFrames: transitionFrames,
        props: { fromBeatId: previousBeat.id, toBeatId: beat.id },
        linkedVariantScope: 'global',
        provenance: [{ kind: 'story-beat', ref: previousBeat.id }, ...provenance],
      });
    }

    cursor += durationFrames;
  });

  return [
    { id: 'track-text', kind: 'text', clips: textClips },
    { id: 'track-caption', kind: 'caption', clips: captionClips },
    { id: 'track-voice', kind: 'voice', clips: voiceClips },
    { id: 'track-transition', kind: 'transition', clips: transitionClips },
  ];
}

export function materializeMotionTimeline(
  project: MotionProject,
  options: MaterializeMotionTimelineOptions = {}
): MotionProject {
  const selectedDraftId = options.draftId ?? project.currentDraftId;
  const story = selectStory(project, options.draftId);
  const tracks = compileStoryToTimeline(project, options);
  const syncNode: MotionGraphNode = {
    id: 'node-sync-timeline',
    kind: 'sync',
    inputRefs: story.map((beat) => beat.id),
    outputRefs: tracks.map((track) => track.id),
    status: 'done',
    provenance: tracks.map((track) => ({ kind: 'timeline', ref: track.id })),
  };

  return {
    ...project,
    currentDraftId: selectedDraftId,
    tracks,
    drafts: project.drafts.map((draft) =>
      draft.id === selectedDraftId ? { ...draft, status: 'ready', tracks } : draft
    ),
    graphNodes: [
      ...project.graphNodes.filter((node) => node.id !== syncNode.id),
      syncNode,
    ],
    updatedAt: options.updatedAt ?? project.updatedAt,
  };
}
