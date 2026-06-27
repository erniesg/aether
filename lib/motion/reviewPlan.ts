import {
  getMotionComponent,
  type MotionEditControl,
  type MotionRegenerateScope,
} from './componentRegistry';
import { listMotionReferenceCorpus } from './referenceCorpus';
import { listMotionTasteCorpus, type MotionTasteShot } from './tasteCorpus';
import type {
  MotionDraft,
  MotionGraphNode,
  MotionPlatformTarget,
  MotionProject,
  MotionProvenanceRef,
  MotionTrackKind,
  MotionWorkflowMode,
  StoryBeat,
  TimelineClip,
  TimelineTrack,
} from './project';
import { materializeMotionTimeline } from './timeline';

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

export interface MotionReferenceSignalRegenerationRequest {
  id: string;
  projectId: string;
  draftId: string;
  referenceSignalId: string;
  referenceTitle: string;
  sourceUrl: string;
  scope: MotionRegenerateScope;
  componentIds: string[];
  componentLabels: string[];
  prompt: string;
  inputRefs: string[];
  status: 'planned';
  provenance: MotionProvenanceRef[];
  requestedAt: number;
}

export interface MotionTasteReferenceRegenerationShot {
  id: string;
  startSeconds: number;
  endSeconds: number;
  label: string;
  visual: string;
  componentIds: string[];
  effectTags: string[];
  editTargets: MotionRegenerateScope[];
  captionStyle: MotionTasteShot['captionStyle'];
  transitionOut?: MotionTasteShot['transitionOut'];
}

export interface MotionTasteReferenceRegenerationRequest {
  id: string;
  projectId: string;
  draftId: string;
  tasteReferenceId: string;
  tasteReferenceTitle: string;
  sourceEntryId: string;
  sourceUrl: string;
  scope: MotionRegenerateScope;
  componentIds: string[];
  componentLabels: string[];
  timestampedShotPlan: MotionTasteReferenceRegenerationShot[];
  prompt: string;
  inputRefs: string[];
  status: 'planned';
  provenance: MotionProvenanceRef[];
  requestedAt: number;
}

export interface MotionDraftVariationRequest {
  id: string;
  projectId: string;
  draftId: string;
  draftLabel: string;
  angle: string;
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

export interface CreateMotionReferenceSignalRegenerationRequestInput {
  referenceSignalId: string;
  sourceUrl?: string;
  scope: MotionRegenerateScope;
  componentIds: string[];
  prompt: string;
  requestedAt: number;
}

export interface CreateMotionTasteReferenceRegenerationRequestInput {
  tasteReferenceId: string;
  sourceEntryId?: string;
  sourceUrl?: string;
  scope: MotionRegenerateScope;
  componentIds: string[];
  prompt: string;
  requestedAt: number;
}

export interface CreateMotionDraftVariationRequestInput {
  draftId: string;
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

export function stageMotionComponentRegeneration(
  project: MotionProject,
  request: MotionComponentRegenerationRequest
): MotionProject {
  const node = regenerationRequestToGraphNode(request);

  return {
    ...project,
    graphNodes: [
      ...project.graphNodes.filter((candidate) => candidate.id !== node.id),
      node,
    ],
    updatedAt: Math.max(project.updatedAt, request.requestedAt),
  };
}

export function createMotionReferenceSignalRegenerationRequest(
  project: MotionProject,
  input: CreateMotionReferenceSignalRegenerationRequestInput
): MotionReferenceSignalRegenerationRequest {
  const reference = listMotionReferenceCorpus().find(
    (entry) => entry.id === input.referenceSignalId
  );
  if (!reference) {
    throw new Error(`Motion reference signal not found: ${input.referenceSignalId}`);
  }

  const componentIds = uniqueStrings(input.componentIds);
  if (componentIds.length === 0) {
    throw new Error('At least one component id is required for reference regeneration');
  }

  const componentLabels = componentIds.map((componentId) => {
    const component = getMotionComponent(componentId);
    if (!component) {
      throw new Error(`Motion component is not registered: ${componentId}`);
    }
    return component.label;
  });

  const sourceUrl = input.sourceUrl ?? reference.sourceUrl;
  const inputRefs = uniqueStrings([
    reference.id,
    sourceUrl,
    ...componentIds,
  ]);

  return {
    id: `regen-reference-${reference.id}-${input.scope}-${input.requestedAt}`,
    projectId: project.id,
    draftId: project.currentDraftId,
    referenceSignalId: reference.id,
    referenceTitle: reference.title,
    sourceUrl,
    scope: input.scope,
    componentIds,
    componentLabels,
    prompt: input.prompt,
    inputRefs,
    status: 'planned',
    provenance: [
      { kind: 'reference', ref: sourceUrl, label: reference.title },
      { kind: 'revision', ref: `reference-signal:${reference.id}:${input.scope}` },
    ],
    requestedAt: input.requestedAt,
  };
}

export function stageMotionReferenceSignalRegeneration(
  project: MotionProject,
  request: MotionReferenceSignalRegenerationRequest
): MotionProject {
  const node = referenceSignalRegenerationRequestToGraphNode(request);

  return {
    ...project,
    graphNodes: [
      ...project.graphNodes.filter((candidate) => candidate.id !== node.id),
      node,
    ],
    updatedAt: Math.max(project.updatedAt, request.requestedAt),
  };
}

export function createMotionTasteReferenceRegenerationRequest(
  project: MotionProject,
  input: CreateMotionTasteReferenceRegenerationRequestInput
): MotionTasteReferenceRegenerationRequest {
  const tasteReference = listMotionTasteCorpus().find(
    (entry) => entry.id === input.tasteReferenceId
  );
  if (!tasteReference) {
    throw new Error(`Motion taste reference not found: ${input.tasteReferenceId}`);
  }
  if (!tasteReference.regenerateScopes.includes(input.scope)) {
    throw new Error(`${tasteReference.title} does not support ${input.scope} regeneration`);
  }
  if (input.sourceEntryId && input.sourceEntryId !== tasteReference.sourceEntryId) {
    throw new Error(`Motion taste reference source does not match: ${input.sourceEntryId}`);
  }

  const componentIds = uniqueStrings(input.componentIds);
  if (componentIds.length === 0) {
    throw new Error('At least one component id is required for taste reference regeneration');
  }

  const componentLabels = componentIds.map((componentId) => {
    const component = getMotionComponent(componentId);
    if (!component) {
      throw new Error(`Motion component is not registered: ${componentId}`);
    }
    return component.label;
  });

  const sourceUrl = input.sourceUrl ?? tasteReference.sourceUrl;
  const timestampedShotPlan = tasteReference.shotList.map(tasteShotToRegenerationShot);
  const inputRefs = uniqueStrings([
    tasteReference.id,
    tasteReference.sourceEntryId,
    sourceUrl,
    ...timestampedShotPlan.map((shot) => shot.id),
    ...componentIds,
  ]);

  return {
    id: `regen-taste-${tasteReference.id}-${input.scope}-${input.requestedAt}`,
    projectId: project.id,
    draftId: project.currentDraftId,
    tasteReferenceId: tasteReference.id,
    tasteReferenceTitle: tasteReference.title,
    sourceEntryId: tasteReference.sourceEntryId,
    sourceUrl,
    scope: input.scope,
    componentIds,
    componentLabels,
    timestampedShotPlan,
    prompt: input.prompt,
    inputRefs,
    status: 'planned',
    provenance: [
      { kind: 'reference', ref: sourceUrl, label: tasteReference.title },
      { kind: 'manual', ref: `taste-reference:${tasteReference.id}` },
      { kind: 'manual', ref: `taste-source:${tasteReference.sourceEntryId}` },
      { kind: 'revision', ref: `taste-reference:${tasteReference.id}:${input.scope}` },
    ],
    requestedAt: input.requestedAt,
  };
}

export function stageMotionTasteReferenceRegeneration(
  project: MotionProject,
  request: MotionTasteReferenceRegenerationRequest
): MotionProject {
  const node = tasteReferenceRegenerationRequestToGraphNode(request);

  return {
    ...project,
    graphNodes: [
      ...project.graphNodes.filter((candidate) => candidate.id !== node.id),
      node,
    ],
    updatedAt: Math.max(project.updatedAt, request.requestedAt),
  };
}

export function createMotionDraftVariationRequest(
  project: MotionProject,
  input: CreateMotionDraftVariationRequestInput
): MotionDraftVariationRequest {
  const draft = project.drafts.find((candidate) => candidate.id === input.draftId);
  if (!draft) {
    throw new Error(`Motion draft variation not found: ${input.draftId}`);
  }

  const storyRefs = draft.story.map((beat) => beat.id);
  const inputRefs = uniqueStrings([draft.id, ...storyRefs]);

  return {
    id: `regen-draft-${draft.id}-${input.requestedAt}`,
    projectId: project.id,
    draftId: draft.id,
    draftLabel: draft.label,
    angle: draft.angle,
    prompt: input.prompt,
    inputRefs,
    status: 'planned',
    provenance: uniqueProvenance([
      { kind: 'revision', ref: `draft-variation:${draft.id}` },
      ...draft.provenance,
      ...draft.story.map((beat) => ({ kind: 'story-beat' as const, ref: beat.id })),
      ...draft.story.flatMap((beat) => beat.provenance),
    ]),
    requestedAt: input.requestedAt,
  };
}

export function stageMotionDraftVariation(
  project: MotionProject,
  request: MotionDraftVariationRequest
): MotionProject {
  const node = draftVariationRequestToGraphNode(request);
  const materialized = materializeMotionTimeline(project, {
    draftId: request.draftId,
    updatedAt: Math.max(project.updatedAt, request.requestedAt),
  });

  return {
    ...materialized,
    graphNodes: [
      ...materialized.graphNodes.filter((candidate) => candidate.id !== node.id),
      node,
    ],
  };
}

function regenerationRequestToGraphNode(
  request: MotionComponentRegenerationRequest
): MotionGraphNode {
  return {
    id: `node-${request.id}`,
    kind: 'revision',
    inputRefs: uniqueStrings([request.clipId, ...request.inputRefs]),
    outputRefs: [request.id],
    status: 'planned',
    provenance: uniqueProvenance([
      { kind: 'revision', ref: request.id },
      ...request.provenance,
    ]),
  };
}

function referenceSignalRegenerationRequestToGraphNode(
  request: MotionReferenceSignalRegenerationRequest
): MotionGraphNode {
  return {
    id: `node-${request.id}`,
    kind: 'revision',
    inputRefs: [...request.inputRefs],
    outputRefs: [request.id],
    status: 'planned',
    provenance: uniqueProvenance([
      { kind: 'revision', ref: request.id },
      ...request.provenance,
    ]),
  };
}

function tasteReferenceRegenerationRequestToGraphNode(
  request: MotionTasteReferenceRegenerationRequest
): MotionGraphNode {
  return {
    id: `node-${request.id}`,
    kind: 'revision',
    inputRefs: [...request.inputRefs],
    outputRefs: [request.id],
    status: 'planned',
    provenance: uniqueProvenance([
      { kind: 'revision', ref: request.id },
      ...request.provenance,
    ]),
  };
}

function draftVariationRequestToGraphNode(request: MotionDraftVariationRequest): MotionGraphNode {
  return {
    id: `node-${request.id}`,
    kind: 'revision',
    inputRefs: [...request.inputRefs],
    outputRefs: [request.id],
    status: 'planned',
    provenance: uniqueProvenance([
      { kind: 'revision', ref: request.id },
      ...request.provenance,
    ]),
  };
}

function tasteShotToRegenerationShot(shot: MotionTasteShot): MotionTasteReferenceRegenerationShot {
  return {
    id: shot.id,
    startSeconds: shot.startSeconds,
    endSeconds: shot.endSeconds,
    label: shot.label,
    visual: shot.visual,
    componentIds: [...shot.componentIds],
    effectTags: [...shot.effectTags],
    editTargets: [...shot.editTargets],
    captionStyle: shot.captionStyle,
    ...(shot.transitionOut ? { transitionOut: shot.transitionOut } : {}),
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

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
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
