import type {
  MotionRenderEngine,
  MotionRenderOutput,
} from '@/lib/providers/video/types';
import {
  DEFAULT_MOTION_FPS,
  motionSeconds,
  type MotionAspectRatio,
  type MotionExport,
  type MotionGraphNode,
  type MotionProject,
  type MotionProvenanceRef,
  type TimelineTrack,
} from './project';

export type MotionRenderPlanStatus = 'ready' | 'needs-timeline';

export interface MotionRenderPlanBlocker {
  id: 'timeline-required';
  label: string;
}

export interface BuildMotionRenderPlanOptions {
  engine: MotionRenderEngine;
  draftId?: string;
  fps?: number;
  requestedAt: number;
}

export interface MotionRenderPlan {
  id: string;
  projectId: string;
  draftId: string;
  engine: MotionRenderEngine;
  status: MotionRenderPlanStatus;
  compositionId: string;
  fps: number;
  durationFrames: number;
  durationSeconds: number;
  timelineTrackIds: string[];
  componentIds: string[];
  outputs: MotionRenderOutput[];
  renderNode: MotionGraphNode | null;
  blockers: MotionRenderPlanBlocker[];
  requestedAt: number;
  provenance: MotionProvenanceRef[];
}

export function buildMotionRenderPlan(
  project: MotionProject,
  options: BuildMotionRenderPlanOptions
): MotionRenderPlan {
  const draftId = options.draftId ?? project.currentDraftId;
  const tracks = selectTracks(project, draftId);
  const fps = options.fps ?? DEFAULT_MOTION_FPS;
  const compositionId = `${project.id}-${draftId}`;
  const id = `render-plan-${compositionId}-${options.engine}`;

  if (tracks.length === 0) {
    return {
      id,
      projectId: project.id,
      draftId,
      engine: options.engine,
      status: 'needs-timeline',
      compositionId,
      fps,
      durationFrames: 0,
      durationSeconds: 0,
      timelineTrackIds: [],
      componentIds: [],
      outputs: [],
      renderNode: null,
      blockers: [
        {
          id: 'timeline-required',
          label: 'Materialize timeline before render',
        },
      ],
      requestedAt: options.requestedAt,
      provenance: project.sourceRefs,
    };
  }

  const timelineTrackIds = tracks.map((track) => track.id);
  const exports = project.exports.length > 0 ? project.exports : exportsFromTargets(project);
  const provenance = uniqueProvenance([
    ...project.sourceRefs,
    ...timelineTrackIds.map((trackId) => ({ kind: 'timeline' as const, ref: trackId })),
    ...exports.flatMap((candidate) => candidate.provenance),
  ]);
  const outputs = exports.flatMap((candidate) =>
    outputRequestsForExport(project.id, candidate, provenance)
  );
  const durationFrames = timelineDurationFrames(tracks);

  return {
    id,
    projectId: project.id,
    draftId,
    engine: options.engine,
    status: 'ready',
    compositionId,
    fps,
    durationFrames,
    durationSeconds: motionSeconds(durationFrames, fps),
    timelineTrackIds,
    componentIds: componentIdsForTracks(tracks),
    outputs,
    renderNode: {
      id: `node-render-plan-${options.engine}`,
      kind: 'render',
      inputRefs: [...timelineTrackIds, ...exports.map((candidate) => candidate.id)],
      outputRefs: outputs.map((output) => output.id),
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

function exportsFromTargets(project: MotionProject): MotionExport[] {
  return project.brief.platformTargets.map((target) => ({
    id: `export-${target.platform}-${target.aspectRatio.replace(':', 'x')}`,
    platform: target.platform,
    aspectRatio: target.aspectRatio,
    status: 'planned',
    provenance: project.sourceRefs,
  }));
}

function timelineDurationFrames(tracks: TimelineTrack[]): number {
  return tracks.reduce((maxFrames, track) => {
    const trackEnd = track.clips.reduce(
      (trackMax, clip) => Math.max(trackMax, clip.startFrame + clip.durationFrames),
      0
    );
    return Math.max(maxFrames, trackEnd);
  }, 0);
}

function componentIdsForTracks(tracks: TimelineTrack[]): string[] {
  return uniqueStrings(
    tracks.flatMap((track) =>
      track.clips.flatMap((clip) => (clip.componentId ? [clip.componentId] : []))
    )
  );
}

function outputRequestsForExport(
  projectId: string,
  motionExport: MotionExport,
  provenance: MotionProvenanceRef[]
): MotionRenderOutput[] {
  const dimensions = dimensionsForAspectRatio(motionExport.aspectRatio);
  const basePath = `renders/${projectId}/${motionExport.id}`;
  const base = {
    exportId: motionExport.id,
    platform: motionExport.platform,
    aspectRatio: motionExport.aspectRatio,
    width: dimensions.width,
    height: dimensions.height,
    provenance: uniqueProvenance([...motionExport.provenance, ...provenance]),
  };

  return [
    {
      ...base,
      id: `render-${motionExport.id}-video`,
      kind: 'video',
      mimeType: 'video/mp4',
      path: `${basePath}/video.mp4`,
    },
    {
      ...base,
      id: `render-${motionExport.id}-poster`,
      kind: 'poster',
      mimeType: 'image/png',
      path: `${basePath}/poster.png`,
    },
    {
      ...base,
      id: `render-${motionExport.id}-subtitle`,
      kind: 'subtitle',
      mimeType: 'text/vtt',
      path: `${basePath}/subtitles.vtt`,
    },
    {
      ...base,
      id: `render-${motionExport.id}-transcript`,
      kind: 'transcript',
      mimeType: 'text/plain',
      path: `${basePath}/transcript.txt`,
    },
    {
      ...base,
      id: `render-${motionExport.id}-manifest`,
      kind: 'manifest',
      mimeType: 'application/json',
      path: `${basePath}/manifest.json`,
    },
  ];
}

function dimensionsForAspectRatio(aspectRatio: MotionAspectRatio): {
  width: number;
  height: number;
} {
  if (aspectRatio === '9:16') return { width: 1080, height: 1920 };
  if (aspectRatio === '1:1') return { width: 1080, height: 1080 };
  if (aspectRatio === '4:5') return { width: 1080, height: 1350 };
  return { width: 1920, height: 1080 };
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
