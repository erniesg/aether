import {
  motionSeconds,
  type MotionProject,
  type MotionTrackKind,
  type TimelineClip,
  type TimelineTrack,
} from './project';
import type { MotionTimelineRevisionOperation } from './revise';

const SCENE_TRACK_KINDS = new Set<MotionTrackKind>([
  'screen',
  'broll',
  'text',
  'caption',
  'voice',
]);
const VISUAL_TRACK_KINDS = new Set<MotionTrackKind>(['screen', 'broll', 'text']);

interface ClipContext {
  clip: TimelineClip;
  track: TimelineTrack;
}

export function buildLinkedSceneCopyOperations(
  project: MotionProject,
  clipId: string,
  summary: string
): MotionTimelineRevisionOperation[] {
  const selected = findClip(project.tracks, clipId);
  if (!selected) return [];

  const linked = linkedSceneClips(project.tracks, selected);
  const operations: MotionTimelineRevisionOperation[] = linked.map(({ clip, track }) => ({
    kind: 'update-clip-props',
    clipId: clip.id,
    props: copyPropsForTrack(track.kind, summary),
  }));
  const beat = storyBeatForScene(project, selected);
  if (beat) {
    operations.unshift({ kind: 'update-story-beat', beatId: beat.id, narration: summary });
  }
  return operations;
}

export function buildLinkedSceneTimingOperations(
  project: MotionProject,
  clipId: string,
  startFrame: number,
  durationFrames: number
): MotionTimelineRevisionOperation[] {
  const selected = findClip(project.tracks, clipId);
  if (!selected) return [];

  if (!SCENE_TRACK_KINDS.has(selected.track.kind)) {
    return [{ kind: 'retime-clip', clipId, startFrame, durationFrames }];
  }

  const previousSceneEnd = previousVisualSceneEnd(project.tracks, selected.clip.startFrame);
  const safeStartFrame = Math.max(startFrame, previousSceneEnd);
  const oldEndFrame = selected.clip.startFrame + selected.clip.durationFrames;
  const newEndFrame = safeStartFrame + durationFrames;
  const rippleFrames = newEndFrame - oldEndFrame;
  const linked = linkedSceneClips(project.tracks, selected);
  const linkedIds = new Set(linked.map(({ clip }) => clip.id));
  const operations: MotionTimelineRevisionOperation[] = linked.map(({ clip }) => ({
    kind: 'retime-clip',
    clipId: clip.id,
    startFrame: safeStartFrame,
    durationFrames,
  }));
  if (rippleFrames !== 0) {
    operations.push(
      ...project.tracks.flatMap((track) =>
        track.clips
          .filter(
            (clip) =>
              !linkedIds.has(clip.id) &&
              ((SCENE_TRACK_KINDS.has(track.kind) && clip.startFrame >= oldEndFrame) ||
                (track.kind === 'transition' &&
                  clip.startFrame + clip.durationFrames >= oldEndFrame))
          )
          .map(
            (clip): MotionTimelineRevisionOperation => ({
              kind: 'retime-clip',
              clipId: clip.id,
              startFrame: clip.startFrame + rippleFrames,
              durationFrames: clip.durationFrames,
            })
          )
      )
    );
  }
  const beat = storyBeatForScene(project, selected);
  if (beat) {
    operations.unshift({
      kind: 'update-story-beat',
      beatId: beat.id,
      targetSeconds: motionSeconds(durationFrames),
    });
  }
  return operations;
}

function previousVisualSceneEnd(tracks: TimelineTrack[], selectedStartFrame: number): number {
  return Math.max(
    0,
    ...tracks
      .filter((track) => VISUAL_TRACK_KINDS.has(track.kind))
      .flatMap((track) => track.clips)
      .filter((clip) => clip.startFrame < selectedStartFrame)
      .map((clip) => clip.startFrame + clip.durationFrames)
  );
}

function linkedSceneClips(tracks: TimelineTrack[], selected: ClipContext): ClipContext[] {
  if (!SCENE_TRACK_KINDS.has(selected.track.kind)) return [selected];

  return tracks.flatMap((track) =>
    SCENE_TRACK_KINDS.has(track.kind)
      ? track.clips
          .filter((clip) => clip.startFrame === selected.clip.startFrame)
          .map((clip) => ({ clip, track }))
      : []
  );
}

function storyBeatForScene(project: MotionProject, selected: ClipContext) {
  const provenanceBeatId = selected.clip.provenance.find(
    (ref) => ref.kind === 'story-beat' && project.story.some((beat) => beat.id === ref.ref)
  )?.ref;
  if (provenanceBeatId) {
    return project.story.find((beat) => beat.id === provenanceBeatId) ?? null;
  }

  const visualStartFrames = Array.from(
    new Set(
      project.tracks
        .filter((track) => VISUAL_TRACK_KINDS.has(track.kind))
        .flatMap((track) => track.clips.map((clip) => clip.startFrame))
    )
  ).sort((left, right) => left - right);
  const sceneIndex = visualStartFrames.indexOf(selected.clip.startFrame);
  return sceneIndex >= 0 ? project.story[sceneIndex] ?? null : null;
}

function findClip(tracks: TimelineTrack[], clipId: string): ClipContext | null {
  for (const track of tracks) {
    const clip = track.clips.find((candidate) => candidate.id === clipId);
    if (clip) return { clip, track };
  }
  return null;
}

function copyPropsForTrack(
  trackKind: MotionTrackKind,
  summary: string
): Record<string, unknown> {
  if (trackKind === 'caption') return { caption: summary, text: summary };
  if (trackKind === 'voice') return { narration: summary, text: summary };
  return {
    text: summary,
    headline: summary,
    caption: summary,
    narration: summary,
  };
}
