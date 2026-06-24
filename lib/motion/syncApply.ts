import { appendSyncExecutionHistory } from './executionHistory';
import type {
  MotionGraphNode,
  MotionProject,
  MotionProvenanceRef,
  TimelineClip,
  TimelineTrack,
} from './project';
import type { MotionSyncPlan } from './syncPlan';

export interface ApplyMotionSyncPlanOptions {
  providerId?: string;
  updatedAt?: number;
}

export function applyMotionSyncPlanToMotionProject(
  project: MotionProject,
  plan: MotionSyncPlan,
  options: ApplyMotionSyncPlanOptions = {}
): MotionProject {
  if (plan.status !== 'ready' || !plan.syncNode) return project;

  const providerId = options.providerId ?? 'motion-sync';
  const savedAt = options.updatedAt ?? project.updatedAt;
  const tracks = markSyncTracks(project.tracks, plan);

  return {
    ...project,
    tracks: plan.draftId === project.currentDraftId ? tracks : project.tracks,
    drafts: project.drafts.map((draft) =>
      draft.id === plan.draftId
        ? {
            ...draft,
            tracks: markSyncTracks(draft.tracks, plan),
          }
        : draft
    ),
    graphNodes: upsertSyncNode(project.graphNodes, plan.syncNode, providerId),
    executionHistory: appendSyncExecutionHistory(
      project.executionHistory,
      plan,
      providerId,
      savedAt
    ),
    updatedAt: savedAt,
  };
}

function markSyncTracks(tracks: TimelineTrack[], plan: MotionSyncPlan): TimelineTrack[] {
  const markersByTextClipId = new Map(plan.beatMarkers.map((marker) => [marker.textClipId, marker]));
  const markersByVoiceClipId = new Map(
    plan.beatMarkers.flatMap((marker) =>
      marker.voiceClipId ? [[marker.voiceClipId, marker] as const] : []
    )
  );
  const captionsByClipId = new Map(plan.captionLinks.map((link) => [link.captionClipId, link]));
  const transitionsByClipId = new Map(plan.transitionCues.map((cue) => [cue.clipId, cue]));

  return tracks.map((track) => ({
    ...track,
    clips: track.clips.map((clip) => {
      if (track.kind === 'text') {
        const marker = markersByTextClipId.get(clip.id);
        if (marker) {
          return markClipSynced(clip, {
            syncPlanId: plan.id,
            syncMarkerId: marker.id,
            startSeconds: marker.startSeconds,
            durationSeconds: marker.durationSeconds,
          });
        }
      }

      if (track.kind === 'voice') {
        const marker = markersByVoiceClipId.get(clip.id);
        if (marker) {
          return markClipSynced(clip, {
            syncPlanId: plan.id,
            syncMarkerId: marker.id,
            startSeconds: marker.startSeconds,
            durationSeconds: marker.durationSeconds,
          });
        }
      }

      if (track.kind === 'caption') {
        const link = captionsByClipId.get(clip.id);
        if (link) {
          return markClipSynced(clip, {
            syncPlanId: plan.id,
            captionLinkId: link.id,
            timingSource: link.timingSource,
            startSeconds: link.startSeconds,
            durationSeconds: link.durationSeconds,
          });
        }
      }

      if (track.kind === 'transition') {
        const cue = transitionsByClipId.get(clip.id);
        if (cue) {
          return markClipSynced(clip, {
            syncPlanId: plan.id,
            transitionCueId: cue.id,
            startSeconds: cue.startSeconds,
            durationSeconds: cue.durationSeconds,
          });
        }
      }

      return clip;
    }),
  }));
}

function markClipSynced(
  clip: TimelineClip,
  props: Record<string, string | number>
): TimelineClip {
  return {
    ...clip,
    props: {
      ...clip.props,
      ...props,
      syncStatus: 'synced',
    },
  };
}

function upsertSyncNode(
  nodes: MotionGraphNode[],
  plannedNode: MotionGraphNode,
  providerId: string
): MotionGraphNode[] {
  const completedNode: MotionGraphNode = {
    ...plannedNode,
    providerId,
    status: 'done',
    provenance: uniqueProvenance([
      ...plannedNode.provenance,
      ...plannedNode.outputRefs.map((ref) => ({ kind: 'timeline' as const, ref })),
    ]),
  };
  const existingIndex = nodes.findIndex((node) => node.id === completedNode.id);

  if (existingIndex !== -1) {
    return nodes.map((node, index) => (index === existingIndex ? completedNode : node));
  }

  return [...nodes, completedNode];
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
