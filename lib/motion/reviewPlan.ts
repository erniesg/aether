import {
  getMotionComponent,
  type MotionEditControl,
  type MotionRegenerateScope,
} from './componentRegistry';
import type {
  MotionDraft,
  MotionPlatformTarget,
  MotionProject,
  MotionProvenanceRef,
  MotionTrackKind,
  MotionWorkflowMode,
  StoryBeat,
  TimelineClip,
  TimelineTrack,
} from './project';

export type MotionReviewPrimaryAction = 'request-review' | 'queue-render';
export type MotionReviewActionId =
  | 'review-story'
  | 'review-drafts'
  | 'regenerate-component'
  | 'approve-render'
  | 'generate-visuals'
  | 'generate-voice'
  | 'sync-effects'
  | 'queue-render';

export interface MotionReviewSummary {
  appName: string;
  projectKind: MotionProject['brief']['projectKind'];
  totalSeconds: number;
  targetPlatforms: string[];
}

export interface MotionReviewStoryBeat {
  beatId: string;
  role: StoryBeat['role'];
  narration: string;
  targetSeconds: number;
  componentId?: string;
  sourceRefs: MotionProvenanceRef[];
}

export interface MotionReviewDraftCard {
  draftId: string;
  label: string;
  angle: string;
  status: MotionDraft['status'];
  isCurrent: boolean;
  durationSeconds: number;
  roles: StoryBeat['role'][];
  needsTimeline: boolean;
}

export interface MotionReviewComponentSlot {
  trackId: string;
  trackKind: MotionTrackKind;
  clipId: string;
  componentId: string;
  componentLabel: string;
  startFrame: number;
  durationFrames: number;
  props: TimelineClip['props'];
  editControls: MotionEditControl[];
  regenerateScopes: MotionRegenerateScope[];
  provenance: MotionProvenanceRef[];
}

export interface MotionReviewAction {
  id: MotionReviewActionId;
  label: string;
}

export interface MotionReviewPlan {
  projectId: string;
  title: string;
  workflowMode: MotionWorkflowMode;
  primaryAction: MotionReviewPrimaryAction;
  summary: MotionReviewSummary;
  storyBeats: MotionReviewStoryBeat[];
  drafts: MotionReviewDraftCard[];
  componentSlots: MotionReviewComponentSlot[];
  nextActions: MotionReviewAction[];
}

export interface MotionComponentRegenerationRequest {
  id: string;
  projectId: string;
  draftId: string;
  clipId: string;
  componentId: string;
  scope: MotionRegenerateScope;
  prompt: string;
  inputRefs: string[];
  status: 'planned';
  provenance: MotionProvenanceRef[];
  requestedAt: number;
}

export interface CreateMotionComponentRegenerationRequestInput {
  clipId: string;
  scope: MotionRegenerateScope;
  prompt: string;
  requestedAt: number;
}

export function buildMotionReviewPlan(project: MotionProject): MotionReviewPlan {
  const currentDraft = findCurrentDraft(project);
  const story = currentDraft?.story ?? project.story;
  const tracks = selectEditableTracks(project);

  return {
    projectId: project.id,
    title: project.title,
    workflowMode: project.workflowMode,
    primaryAction: primaryActionForMode(project.workflowMode),
    summary: {
      appName: project.brief.appProfile.name,
      projectKind: project.brief.projectKind,
      totalSeconds: storyDurationSeconds(story),
      targetPlatforms: project.brief.platformTargets.map(formatPlatformTarget),
    },
    storyBeats: story.map((beat) => ({
      beatId: beat.id,
      role: beat.role,
      narration: beat.narration,
      targetSeconds: beat.targetSeconds,
      componentId: beat.templateId,
      sourceRefs: beat.provenance,
    })),
    drafts: project.drafts.map((draft) => ({
      draftId: draft.id,
      label: draft.label,
      angle: draft.angle,
      status: draft.status,
      isCurrent: draft.id === project.currentDraftId,
      durationSeconds: storyDurationSeconds(draft.story),
      roles: draft.story.map((beat) => beat.role),
      needsTimeline: draftTracks(project, draft).length === 0,
    })),
    componentSlots: buildComponentSlots(tracks),
    nextActions: actionsForMode(project.workflowMode),
  };
}

export function createMotionComponentRegenerationRequest(
  project: MotionProject,
  input: CreateMotionComponentRegenerationRequestInput
): MotionComponentRegenerationRequest {
  const located = findClip(project, input.clipId);
  if (!located?.clip.componentId) {
    throw new Error(`Motion clip not found or not component-backed: ${input.clipId}`);
  }

  const component = getMotionComponent(located.clip.componentId);
  if (!component) {
    throw new Error(`Motion component is not registered: ${located.clip.componentId}`);
  }
  if (!component.regenerateScopes.includes(input.scope)) {
    throw new Error(`${component.label} does not support ${input.scope} regeneration`);
  }

  const storyRefs = located.clip.provenance
    .filter((ref) => ref.kind === 'story-beat')
    .map((ref) => ref.ref);
  const inputRefs = Array.from(new Set([located.clip.id, ...storyRefs]));

  return {
    id: `regen-${located.clip.id}-${input.scope}-${input.requestedAt}`,
    projectId: project.id,
    draftId: project.currentDraftId,
    clipId: located.clip.id,
    componentId: component.id,
    scope: input.scope,
    prompt: input.prompt,
    inputRefs,
    status: 'planned',
    provenance: [{ kind: 'timeline', ref: located.clip.id }, ...located.clip.provenance],
    requestedAt: input.requestedAt,
  };
}

function findCurrentDraft(project: MotionProject): MotionDraft | undefined {
  return project.drafts.find((draft) => draft.id === project.currentDraftId);
}

function storyDurationSeconds(story: StoryBeat[]): number {
  return story.reduce((total, beat) => total + beat.targetSeconds, 0);
}

function formatPlatformTarget(target: MotionPlatformTarget): string {
  return `${target.platform} ${target.aspectRatio} ${target.seconds}s`;
}

function primaryActionForMode(mode: MotionWorkflowMode): MotionReviewPrimaryAction {
  return mode === 'full-auto' ? 'queue-render' : 'request-review';
}

function actionsForMode(mode: MotionWorkflowMode): MotionReviewAction[] {
  if (mode === 'full-auto') {
    return [
      { id: 'generate-visuals', label: 'Generate visuals' },
      { id: 'generate-voice', label: 'Generate voice' },
      { id: 'sync-effects', label: 'Sync effects' },
      { id: 'queue-render', label: 'Queue render' },
    ];
  }

  return [
    { id: 'review-story', label: 'Review story' },
    { id: 'review-drafts', label: 'Review drafts' },
    { id: 'regenerate-component', label: 'Regenerate component' },
    { id: 'approve-render', label: 'Approve render' },
  ];
}

function draftTracks(project: MotionProject, draft: MotionDraft): TimelineTrack[] {
  if (draft.tracks.length > 0) return draft.tracks;
  if (draft.id === project.currentDraftId) return project.tracks;
  return [];
}

function selectEditableTracks(project: MotionProject): TimelineTrack[] {
  const currentDraft = findCurrentDraft(project);
  if (currentDraft) return draftTracks(project, currentDraft);
  return project.tracks;
}

function buildComponentSlots(tracks: TimelineTrack[]): MotionReviewComponentSlot[] {
  return tracks.flatMap((track) =>
    track.clips.flatMap((clip) => {
      if (!clip.componentId) return [];

      const component = getMotionComponent(clip.componentId);
      return [
        {
          trackId: track.id,
          trackKind: track.kind,
          clipId: clip.id,
          componentId: clip.componentId,
          componentLabel: component?.label ?? clip.componentId,
          startFrame: clip.startFrame,
          durationFrames: clip.durationFrames,
          props: clip.props,
          editControls: component?.editControls ?? [],
          regenerateScopes: component?.regenerateScopes ?? [],
          provenance: clip.provenance,
        },
      ];
    })
  );
}

function findClip(
  project: MotionProject,
  clipId: string
): { track: TimelineTrack; clip: TimelineClip } | null {
  for (const track of selectEditableTracks(project)) {
    const clip = track.clips.find((candidate) => candidate.id === clipId);
    if (clip) return { track, clip };
  }

  return null;
}
