import type { WorkflowEngine } from '@/lib/workflow/registry';
import type {
  MotionRenderEngine,
  MotionRenderOutputKind,
  MotionRenderRequest,
  MotionRenderSourceFileKind,
} from '@/lib/providers/video/types';
import {
  buildMotionReviewPlan,
  type MotionReviewPlan,
} from './reviewPlan';
import {
  buildMotionExportPackPlan,
  type MotionExportPackAssetKind,
  type MotionExportPackStatus,
} from './exportPackPlan';
import {
  buildMotionRenderPlan,
  type MotionRenderPlanStatus,
} from './renderPlan';
import { buildMotionRenderSourceBundle } from './renderSource';
import {
  buildMotionSyncPlan,
  type MotionCaptionTimingSource,
  type MotionSyncPlanStatus,
  type MotionVoiceSyncStatus,
} from './syncPlan';
import { getMotionComponent } from './componentRegistry';
import { getMotionEffectPreset } from './effectPresets';
import {
  DEFAULT_MOTION_FPS,
  motionSeconds,
  type MotionDraft,
  type MotionProject,
  type MotionProvenanceRef,
  type MotionTrackKind,
  type TimelineClip,
  type TimelineTrack,
} from './project';

export type MotionPreviewEngineStatus = MotionRenderPlanStatus | 'provider-required';

export interface MotionPreviewSourceFile {
  kind: MotionRenderSourceFileKind;
  path: string;
  mimeType: string;
}

export interface MotionPreviewBlocker {
  id: string;
  label: string;
}

export interface MotionPreviewEnginePlan {
  engine: WorkflowEngine;
  status: MotionPreviewEngineStatus;
  compositionId: string | null;
  entryPoint: string | null;
  durationSeconds: number;
  outputKinds: MotionRenderOutputKind[];
  componentIds: string[];
  sourceFiles: MotionPreviewSourceFile[];
  blockers: MotionPreviewBlocker[];
}

export interface MotionPreviewStoryBeat {
  beatId: string;
  role: MotionReviewPlan['storyBeats'][number]['role'];
  narration: string;
  targetSeconds: number;
  componentId?: string;
  sourceRefs: MotionProvenanceRef[];
}

export interface MotionPreviewDraftOption {
  draftId: string;
  label: string;
  angle: string;
  status: MotionDraft['status'];
  isCurrent: boolean;
  durationSeconds: number;
  roles: MotionPreviewStoryBeat['role'][];
}

export interface MotionPreviewTimelineClip {
  clipId: string;
  componentId: string | null;
  componentLabel: string;
  startSeconds: number;
  durationSeconds: number;
  summary: string;
  linkedVariantScope: TimelineClip['linkedVariantScope'];
  editControlIds: string[];
  regenerateScopes: string[];
  effectPreset: string | null;
  effectLabel: string | null;
}

export interface MotionPreviewTimelineRow {
  trackId: string;
  trackKind: MotionTrackKind;
  durationSeconds: number;
  clips: MotionPreviewTimelineClip[];
}

export interface MotionPreviewEditableComponent {
  trackId: string;
  clipId: string;
  componentId: string;
  componentLabel: string;
  editControlIds: string[];
  regenerateScopes: string[];
}

export interface MotionPreviewRegenerationAction {
  id: string;
  clipId: string;
  componentId: string;
  componentLabel: string;
  scope: string;
  label: string;
}

export interface MotionPreviewSyncSummary {
  status: MotionSyncPlanStatus;
  beatCount: number;
  captionCount: number;
  transitionCount: number;
  soundCueCount: number;
  requirementLabels: string[];
  blockerLabels: string[];
}

export interface MotionPreviewSyncBeat {
  role: MotionReviewPlan['storyBeats'][number]['role'];
  startSeconds: number;
  durationSeconds: number;
  voiceStatus: MotionVoiceSyncStatus;
  captionTimingSource: MotionCaptionTimingSource;
}

export interface MotionPreviewSyncSoundCue {
  kind: 'transition' | 'emphasis' | 'cta';
  label: string;
  startSeconds: number;
  durationSeconds: number;
}

export interface MotionPreviewExportPackSummary {
  status: MotionExportPackStatus;
  readyCount: number;
  totalCount: number;
  targetLabels: string[];
  canvasDropCount: number;
  missingAssetKinds: MotionExportPackAssetKind[];
  blockerLabels: string[];
}

export interface MotionPreviewPlan {
  id: string;
  projectId: string;
  draftId: string;
  title: string;
  workflowMode: MotionProject['workflowMode'];
  primaryAction: MotionReviewPlan['primaryAction'];
  summary: MotionReviewPlan['summary'];
  storyboard: MotionPreviewStoryBeat[];
  draftOptions: MotionPreviewDraftOption[];
  timelineRows: MotionPreviewTimelineRow[];
  editableComponents: MotionPreviewEditableComponent[];
  regenerationActions: MotionPreviewRegenerationAction[];
  enginePreviews: MotionPreviewEnginePlan[];
  syncSummary: MotionPreviewSyncSummary;
  syncBeats: MotionPreviewSyncBeat[];
  syncSoundCues: MotionPreviewSyncSoundCue[];
  exportPackSummary: MotionPreviewExportPackSummary;
  provenance: MotionProvenanceRef[];
  requestedAt: number;
}

export interface BuildMotionPreviewPlanOptions {
  engines?: WorkflowEngine[];
  fps?: number;
  requestedAt: number;
}

const DEFAULT_PREVIEW_ENGINES: WorkflowEngine[] = ['remotion', 'hyperframes'];

export function buildMotionPreviewPlan(
  project: MotionProject,
  options: BuildMotionPreviewPlanOptions
): MotionPreviewPlan {
  const reviewPlan = buildMotionReviewPlan(project);
  const tracks = selectTracks(project, project.currentDraftId);
  const engines = options.engines?.length ? options.engines : DEFAULT_PREVIEW_ENGINES;
  const fps = options.fps ?? DEFAULT_MOTION_FPS;
  const syncPlan = buildMotionSyncPlan(project, {
    draftId: project.currentDraftId,
    fps,
    requestedAt: options.requestedAt,
  });
  const exportPackPlan = buildMotionExportPackPlan(project, {
    draftId: project.currentDraftId,
    requestedAt: options.requestedAt,
  });

  return {
    id: `preview-${project.id}-${project.currentDraftId}-${options.requestedAt}`,
    projectId: project.id,
    draftId: project.currentDraftId,
    title: project.title,
    workflowMode: project.workflowMode,
    primaryAction: reviewPlan.primaryAction,
    summary: reviewPlan.summary,
    storyboard: reviewPlan.storyBeats.map((beat) => ({
      beatId: beat.beatId,
      role: beat.role,
      narration: beat.narration,
      targetSeconds: beat.targetSeconds,
      componentId: beat.componentId,
      sourceRefs: beat.sourceRefs,
    })),
    draftOptions: reviewPlan.drafts.map((draft) => ({
      draftId: draft.draftId,
      label: draft.label,
      angle: draft.angle,
      status: draft.status,
      isCurrent: draft.isCurrent,
      durationSeconds: draft.durationSeconds,
      roles: draft.roles,
    })),
    timelineRows: buildTimelineRows(tracks),
    editableComponents: buildEditableComponents(tracks),
    regenerationActions: buildRegenerationActions(tracks),
    enginePreviews: engines.map((engine) =>
      buildEnginePreview(project, engine, {
        fps,
        requestedAt: options.requestedAt,
      })
    ),
    syncSummary: buildSyncSummary(syncPlan),
    syncBeats: buildSyncBeats(syncPlan),
    syncSoundCues: buildSyncSoundCues(syncPlan),
    exportPackSummary: buildExportPackSummary(exportPackPlan),
    provenance: uniqueProvenance([
      ...project.sourceRefs,
      ...tracks.map((track) => ({ kind: 'timeline' as const, ref: track.id })),
    ]),
    requestedAt: options.requestedAt,
  };
}

function buildSyncBeats(
  syncPlan: ReturnType<typeof buildMotionSyncPlan>
): MotionPreviewSyncBeat[] {
  return syncPlan.beatMarkers.map((marker) => ({
    role: marker.role,
    startSeconds: marker.startSeconds,
    durationSeconds: marker.durationSeconds,
    voiceStatus: marker.voiceStatus,
    captionTimingSource: marker.captionTimingSource,
  }));
}

function buildSyncSoundCues(
  syncPlan: ReturnType<typeof buildMotionSyncPlan>
): MotionPreviewSyncSoundCue[] {
  return syncPlan.soundCues.map((cue) => ({
    kind: cue.kind,
    label: cue.label,
    startSeconds: cue.startSeconds,
    durationSeconds: cue.durationSeconds,
  }));
}

function buildSyncSummary(
  syncPlan: ReturnType<typeof buildMotionSyncPlan>
): MotionPreviewSyncSummary {
  return {
    status: syncPlan.status,
    beatCount: syncPlan.beatMarkers.length,
    captionCount: syncPlan.captionLinks.length,
    transitionCount: syncPlan.transitionCues.length,
    soundCueCount: syncPlan.soundCues.length,
    requirementLabels: syncPlan.providerRequirements.map(syncRequirementLabel),
    blockerLabels: syncPlan.blockers.map((blocker) => blocker.label),
  };
}

function buildExportPackSummary(
  exportPackPlan: ReturnType<typeof buildMotionExportPackPlan>
): MotionPreviewExportPackSummary {
  return {
    status: exportPackPlan.status,
    readyCount: exportPackPlan.readyCount,
    totalCount: exportPackPlan.totalCount,
    targetLabels: exportPackPlan.items.map(
      (item) => `${item.platform} ${item.aspectRatio} ${item.status}`
    ),
    canvasDropCount: exportPackPlan.items.filter((item) => item.canvasDrop).length,
    missingAssetKinds: uniqueStrings(
      exportPackPlan.items.flatMap((item) => item.missingAssetKinds)
    ) as MotionExportPackAssetKind[],
    blockerLabels: exportPackPlan.blockers.map((blocker) => blocker.label),
  };
}

function syncRequirementLabel(requirement: string): string {
  if (requirement === 'voice-synthesis') return 'voice';
  if (requirement === 'word-timing-alignment') return 'word timings';
  return requirement.replace(/-/g, ' ');
}

function buildEnginePreview(
  project: MotionProject,
  engine: WorkflowEngine,
  options: { fps: number; requestedAt: number }
): MotionPreviewEnginePlan {
  if (!isMotionRenderEngine(engine)) {
    return {
      engine,
      status: 'provider-required',
      compositionId: null,
      entryPoint: null,
      durationSeconds: 0,
      outputKinds: [],
      componentIds: [],
      sourceFiles: [],
      blockers: [
        {
          id: 'provider-adapter-required',
          label: 'Choose a configured video generation provider before render',
        },
      ],
    };
  }

  const renderPlan = buildMotionRenderPlan(project, {
    engine,
    fps: options.fps,
    requestedAt: options.requestedAt,
  });
  if (renderPlan.status !== 'ready') {
    return {
      engine,
      status: renderPlan.status,
      compositionId: renderPlan.compositionId,
      entryPoint: null,
      durationSeconds: renderPlan.durationSeconds,
      outputKinds: [],
      componentIds: renderPlan.componentIds,
      sourceFiles: [],
      blockers: renderPlan.blockers,
    };
  }

  const sourceBundle = buildMotionRenderSourceBundle(
    project,
    renderRequestFromPlan(project, renderPlan, engine)
  );

  return {
    engine,
    status: renderPlan.status,
    compositionId: renderPlan.compositionId,
    entryPoint: sourceBundle.entryPoint,
    durationSeconds: renderPlan.durationSeconds,
    outputKinds: uniqueStrings(renderPlan.outputs.map((output) => output.kind)),
    componentIds: renderPlan.componentIds,
    sourceFiles: sourceBundle.files.map((file) => ({
      kind: file.kind,
      path: file.path,
      mimeType: file.mimeType,
    })),
    blockers: [],
  };
}

function renderRequestFromPlan(
  project: MotionProject,
  plan: ReturnType<typeof buildMotionRenderPlan>,
  engine: MotionRenderEngine
): MotionRenderRequest {
  return {
    id: plan.id,
    projectId: plan.projectId,
    draftId: plan.draftId,
    engine,
    compositionId: plan.compositionId,
    fps: plan.fps,
    durationFrames: plan.durationFrames,
    tracks: selectTracks(project, plan.draftId),
    outputs: plan.outputs,
    provenance: plan.provenance,
  };
}

function buildTimelineRows(tracks: TimelineTrack[]): MotionPreviewTimelineRow[] {
  return tracks.map((track) => ({
    trackId: track.id,
    trackKind: track.kind,
    durationSeconds: roundSeconds(trackDurationFrames(track)),
    clips: track.clips.map((clip) => {
      const component = clip.componentId ? getMotionComponent(clip.componentId) : null;
      const effectPreset = getMotionEffectPreset(clip.props.effectPreset);
      return {
        clipId: clip.id,
        componentId: clip.componentId ?? null,
        componentLabel: component?.label ?? clip.componentId ?? 'Clip',
        startSeconds: roundSeconds(clip.startFrame),
        durationSeconds: roundSeconds(clip.durationFrames),
        summary: clipSummary(clip),
        linkedVariantScope: clip.linkedVariantScope,
        editControlIds: component?.editControls.map((control) => control.id) ?? [],
        regenerateScopes: component?.regenerateScopes ?? [],
        effectPreset: effectPreset?.id ?? null,
        effectLabel: effectPreset?.label ?? null,
      };
    }),
  }));
}

function buildEditableComponents(tracks: TimelineTrack[]): MotionPreviewEditableComponent[] {
  return tracks.flatMap((track) =>
    track.clips.flatMap((clip) => {
      if (!clip.componentId) return [];
      const component = getMotionComponent(clip.componentId);
      return [
        {
          trackId: track.id,
          clipId: clip.id,
          componentId: clip.componentId,
          componentLabel: component?.label ?? clip.componentId,
          editControlIds: component?.editControls.map((control) => control.id) ?? [],
          regenerateScopes: component?.regenerateScopes ?? [],
        },
      ];
    })
  );
}

function buildRegenerationActions(tracks: TimelineTrack[]): MotionPreviewRegenerationAction[] {
  return buildEditableComponents(tracks).flatMap((component) =>
    component.regenerateScopes.map((scope) => ({
      id: `regen-option-${component.clipId}-${scope}`,
      clipId: component.clipId,
      componentId: component.componentId,
      componentLabel: component.componentLabel,
      scope,
      label: `Regenerate ${scope} for ${component.componentLabel}`,
    }))
  );
}

function selectTracks(project: MotionProject, draftId: string): TimelineTrack[] {
  const draft = project.drafts.find((candidate) => candidate.id === draftId);
  if (draft?.tracks.length) return draft.tracks;
  if (draftId === project.currentDraftId) return project.tracks;
  return [];
}

function trackDurationFrames(track: TimelineTrack): number {
  return track.clips.reduce(
    (maxFrames, clip) => Math.max(maxFrames, clip.startFrame + clip.durationFrames),
    0
  );
}

function roundSeconds(frames: number): number {
  return Number(motionSeconds(frames).toFixed(3));
}

function clipSummary(clip: TimelineClip): string {
  for (const key of [
    'headline',
    'caption',
    'text',
    'narration',
    'claim',
    'action',
    'sourceLabel',
    'status',
    'role',
  ]) {
    const value = clip.props[key];
    if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  }

  return '';
}

function isMotionRenderEngine(engine: WorkflowEngine): engine is MotionRenderEngine {
  return engine === 'remotion' || engine === 'hyperframes';
}

function uniqueStrings<T extends string>(values: T[]): T[] {
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
