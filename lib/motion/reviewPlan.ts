import {
  getMotionComponent,
  type MotionEditControl,
  type MotionRegenerateScope,
} from './componentRegistry';
import type { ToolRegistryId } from '@/lib/tool/registry';
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
  hook: string;
  durationSeconds: number;
  roles: StoryBeat['role'][];
  componentIds: string[];
  componentLabels: string[];
  sourceRefs: MotionProvenanceRef[];
  regenerationAction: MotionDraftRegenerationAction;
  needsTimeline: boolean;
}

export interface MotionDraftRegenerationRequestTemplate {
  project: '$motionProject';
  draftId: string;
  prompt: string;
  requestedEngines: '$selectedEngines';
  requestedAt: '$now';
}

export interface MotionDraftRegenerationAction {
  id: string;
  label: string;
  route: '/api/motion/regenerate';
  method: 'POST';
  toolId: ToolRegistryId;
  requestTemplate: MotionDraftRegenerationRequestTemplate;
  expectedReceiptLabels: string[];
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
  sourcePatchPlan: MotionRegenerationSourcePatchPlan;
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
  sourcePatchPlan: MotionRegenerationSourcePatchPlan;
  inputRefs: string[];
  status: 'planned';
  provenance: MotionProvenanceRef[];
  requestedAt: number;
}

export type MotionRegenerationSourcePatchTargetKind =
  | 'timeline-json'
  | 'script'
  | 'storyboard'
  | 'edit-contract';

export type MotionRegenerationSourcePatchOperationKind =
  | 'attach-capture-or-asset'
  | 'sync-effect-cues'
  | 'retime-clips'
  | 'update-component-props'
  | 'update-script-copy'
  | 'update-storyboard-scene';

export interface MotionRegenerationSourcePatchTargetFile {
  path: string;
  kind: MotionRegenerationSourcePatchTargetKind;
  label: string;
  reason: string;
}

export interface MotionRegenerationSourcePatchInstruction {
  id: string;
  label: string;
  scope: MotionRegenerateScope;
  componentIds: string[];
  componentLabels: string[];
  targetPaths: string[];
  operationKinds: MotionRegenerationSourcePatchOperationKind[];
  guidanceRefs: string[];
  prompt: string;
}

export interface MotionRegenerationSourcePatchPlan {
  id: string;
  status: 'planned';
  route: '/api/motion/source-edit';
  method: 'POST';
  toolId: 'motion-source-edit';
  sourceEditId: string;
  targetFiles: MotionRegenerationSourcePatchTargetFile[];
  instructions: MotionRegenerationSourcePatchInstruction[];
  expectedReceiptLabels: string[];
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
  sourcePatchPlan: MotionRegenerationSourcePatchPlan;
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
    drafts: project.drafts.map((draft) => draftCardFor(project, draft)),
    componentSlots: buildComponentSlots(tracks),
    nextActions: actionsForMode(project.workflowMode),
  };
}

function draftCardFor(project: MotionProject, draft: MotionDraft): MotionReviewDraftCard {
  const componentIds = uniqueStrings(
    draft.story
      .map((beat) => beat.templateId)
      .filter((componentId): componentId is string => Boolean(componentId))
  );
  const componentLabels = componentIds.map(componentLabelFor);

  return {
    draftId: draft.id,
    label: draft.label,
    angle: draft.angle,
    status: draft.status,
    isCurrent: draft.id === project.currentDraftId,
    hook: draft.story[0]?.narration ?? draft.angle,
    durationSeconds: storyDurationSeconds(draft.story),
    roles: draft.story.map((beat) => beat.role),
    componentIds,
    componentLabels,
    sourceRefs: draftSourceRefs(draft),
    regenerationAction: draftRegenerationAction(draft),
    needsTimeline: draftTracks(project, draft).length === 0,
  };
}

function draftRegenerationAction(draft: MotionDraft): MotionDraftRegenerationAction {
  return {
    id: `regen-draft-option-${draft.id}`,
    label: `Regenerate ${draft.label}`,
    route: '/api/motion/regenerate',
    method: 'POST',
    toolId: 'motion-storyboard',
    requestTemplate: {
      project: '$motionProject',
      draftId: draft.id,
      prompt: `Regenerate ${draft.label} as an editable draft variation while preserving source-backed claims.`,
      requestedEngines: '$selectedEngines',
      requestedAt: '$now',
    },
    expectedReceiptLabels: ['draft variation', 'timeline revision', 'updated preview plan'],
  };
}

function componentLabelFor(componentId: string): string {
  return getMotionComponent(componentId)?.label ?? componentId;
}

function draftSourceRefs(draft: MotionDraft): MotionProvenanceRef[] {
  const sourceRefs = uniqueProvenance(draft.story.flatMap((beat) => beat.provenance)).filter(
    isReviewSourceRef
  );

  if (sourceRefs.length > 0) return sourceRefs;

  return uniqueProvenance(draft.provenance).filter(isReviewSourceRef);
}

function isReviewSourceRef(ref: MotionProvenanceRef): boolean {
  return (
    ref.kind === 'repo' ||
    ref.kind === 'code-change' ||
    ref.kind === 'site' ||
    ref.kind === 'upload' ||
    ref.kind === 'reference' ||
    ref.kind === 'capture' ||
    ref.kind === 'visual-source' ||
    ref.kind === 'image-to-video'
  );
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
  const requestId = `regen-${located.clip.id}-${input.scope}-${input.requestedAt}`;

  return {
    id: requestId,
    projectId: project.id,
    draftId: project.currentDraftId,
    clipId: located.clip.id,
    componentId: component.id,
    scope: input.scope,
    prompt: input.prompt,
    sourcePatchPlan: createSourcePatchPlan({
      requestId,
      draftId: project.currentDraftId,
      scope: input.scope,
      componentIds: [component.id],
      componentLabels: [component.label],
      label: `Regenerate ${input.scope} for ${component.label}`,
      prompt: input.prompt,
      guidanceRefs: inputRefs,
    }),
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
  const requestId = `regen-reference-${reference.id}-${input.scope}-${input.requestedAt}`;
  const label = `Apply ${input.scope} guidance to ${componentLabels.join(' / ')}`;

  return {
    id: requestId,
    projectId: project.id,
    draftId: project.currentDraftId,
    referenceSignalId: reference.id,
    referenceTitle: reference.title,
    sourceUrl,
    scope: input.scope,
    componentIds,
    componentLabels,
    prompt: input.prompt,
    sourcePatchPlan: createSourcePatchPlan({
      requestId,
      draftId: project.currentDraftId,
      scope: input.scope,
      componentIds,
      componentLabels,
      label,
      prompt: input.prompt,
      guidanceRefs: [reference.id, sourceUrl],
    }),
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
  const requestId = `regen-taste-${tasteReference.id}-${input.scope}-${input.requestedAt}`;
  const label = `Apply ${input.scope} guidance to ${componentLabels.join(' / ')}`;

  return {
    id: requestId,
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
    sourcePatchPlan: createSourcePatchPlan({
      requestId,
      draftId: project.currentDraftId,
      scope: input.scope,
      componentIds,
      componentLabels,
      label,
      prompt: input.prompt,
      guidanceRefs: [
        tasteReference.id,
        tasteReference.sourceEntryId,
        ...timestampedShotPlan.map((shot) => shot.id),
      ],
    }),
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

function createSourcePatchPlan(input: {
  requestId: string;
  draftId: string;
  scope: MotionRegenerateScope;
  componentIds: string[];
  componentLabels: string[];
  label: string;
  prompt: string;
  guidanceRefs: string[];
}): MotionRegenerationSourcePatchPlan {
  const targetFiles = sourcePatchTargetFiles(input.draftId, input.scope);
  return {
    id: `source-patch-${input.requestId}`,
    status: 'planned',
    route: '/api/motion/source-edit',
    method: 'POST',
    toolId: 'motion-source-edit',
    sourceEditId: `source-edit-${input.requestId}`,
    targetFiles,
    instructions: [
      {
        id: `source-patch-${input.requestId}-${input.scope}`,
        label: input.label,
        scope: input.scope,
        componentIds: [...input.componentIds],
        componentLabels: [...input.componentLabels],
        targetPaths: targetFiles.map((file) => file.path),
        operationKinds: sourcePatchOperationKinds(input.scope),
        guidanceRefs: uniqueStrings(input.guidanceRefs),
        prompt: input.prompt,
      },
    ],
    expectedReceiptLabels: ['Source files', 'Timeline revision', 'Updated preview plan'],
  };
}

function sourcePatchTargetFiles(
  draftId: string,
  scope: MotionRegenerateScope
): MotionRegenerationSourcePatchTargetFile[] {
  const timelinePath = `timeline/${draftId}.json`;
  if (scope === 'caption' || scope === 'copy' || scope === 'cta') {
    return [
      sourcePatchTargetFile('SCRIPT.md', 'script', 'Update narration, caption, or CTA copy.'),
      sourcePatchTargetFile(
        timelinePath,
        'timeline-json',
        'Propagate copy changes into clip props and synced captions.'
      ),
      sourcePatchTargetFile('EDIT.md', 'edit-contract', 'Review editable component controls.'),
    ];
  }

  return [
    sourcePatchTargetFile(
      timelinePath,
      'timeline-json',
      'Update clip props, timing, assets, and sync effect cues.'
    ),
    sourcePatchTargetFile('STORYBOARD.md', 'storyboard', 'Update scene intent and component notes.'),
    sourcePatchTargetFile('EDIT.md', 'edit-contract', 'Review editable component controls.'),
  ];
}

function sourcePatchTargetFile(
  path: string,
  kind: MotionRegenerationSourcePatchTargetKind,
  reason: string
): MotionRegenerationSourcePatchTargetFile {
  return {
    path,
    kind,
    label: sourcePatchTargetLabel(kind),
    reason,
  };
}

function sourcePatchTargetLabel(kind: MotionRegenerationSourcePatchTargetKind): string {
  switch (kind) {
    case 'timeline-json':
      return 'Timeline JSON';
    case 'script':
      return 'Script';
    case 'storyboard':
      return 'Storyboard';
    case 'edit-contract':
      return 'Edit contract';
  }
}

function sourcePatchOperationKinds(
  scope: MotionRegenerateScope
): MotionRegenerationSourcePatchOperationKind[] {
  switch (scope) {
    case 'capture':
    case 'asset':
      return ['attach-capture-or-asset', 'update-component-props', 'update-storyboard-scene'];
    case 'effect':
      return ['sync-effect-cues', 'update-component-props', 'update-storyboard-scene'];
    case 'timing':
      return ['retime-clips', 'sync-effect-cues', 'update-component-props'];
    case 'caption':
    case 'copy':
    case 'cta':
      return ['update-script-copy', 'update-component-props'];
    case 'proof':
    case 'code':
    case 'diagram':
      return ['update-component-props', 'update-storyboard-scene'];
  }
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
