import type { SkillManifest } from '@/lib/agent/skills/types';
import type {
  WorkflowEngine,
  WorkflowRegenerationTarget,
  WorkflowReviewArtifact,
  WorkflowRunMode,
  WorkflowSkillContract,
  WorkflowSourceKind,
  WorkflowVerificationArtifact,
} from '@/lib/workflow/registry';
import type {
  AgentMotionWorkflowRunPlan,
  MotionWorkflowPlanSourceRef,
  MotionWorkflowPrimaryAction,
  MotionWorkflowRunStepGate,
  MotionWorkflowSourceStatus,
} from './workflowPlan';
import type { MotionWorkflowExample } from './workflowExamples';
import {
  getMotionWorkflowSkillRecipe,
  type MotionWorkflowSkillComponentSlot,
  type MotionWorkflowSkillDraftVariation,
  type MotionWorkflowSkillPackRequirement,
  type MotionWorkflowSkillRecipe,
} from './workflowSkillCatalog';

export interface MotionWorkflowSkillPlanInput {
  workflowId: string;
  label: string;
  mode: WorkflowRunMode;
  primaryAction: MotionWorkflowPrimaryAction;
  sourceStatus: MotionWorkflowSourceStatus;
  supportedSourceKinds: WorkflowSourceKind[];
  acceptedSources: MotionWorkflowPlanSourceRef[];
  missingSourceKinds: WorkflowSourceKind[];
  engines: WorkflowEngine[];
  skillContract: WorkflowSkillContract | null;
  runPlan: AgentMotionWorkflowRunPlan;
}

export interface MotionWorkflowSkillDraft {
  kind: 'motion-workflow-skill-draft';
  label: string;
  trigger: string;
  manifestPathRelative: string;
  manifest: SkillManifest;
  recipe: MotionWorkflowSkillRecipe | null;
  startShorthands: string[];
  reviewPolicyLabels: string[];
  agentTaskLabels: string[];
  draftVariationLabels: string[];
  componentSlotLabels: string[];
  referencePatternLabels: string[];
  skillPackLabels: string[];
  skillPackRequirements: MotionWorkflowSkillPackRequirement[];
  researchSignalLabels: string[];
  regenerationLabels: string[];
  toolNames: string[];
  verificationLabels: string[];
  sampleCopyLines: string[];
  timelineContract: MotionWorkflowTimelineContract;
  launchKit: MotionWorkflowLaunchKit;
  capabilityPlan: MotionWorkflowCapabilityPlan;
}

export interface MotionWorkflowTimelineContract {
  kind: 'motion-workflow-timeline-contract';
  primitive: 'timeline-and-node-graph';
  laneLabels: string[];
  editableObjectLabels: string[];
  syncCueLabels: string[];
  nodeOutputLabels: string[];
  sourceEditRouteLabels: string[];
  reviewGateLabels: string[];
  reviewModeInstruction: string;
  fullAutoInstruction: string;
}

export interface MotionWorkflowLaunchKit {
  kind: 'motion-workflow-launch-kit';
  label: string;
  primaryFormat: string | null;
  installCommand: string | null;
  postLines: string[];
  platformTargets: string[];
  componentSlotLabels: string[];
  reviewArtifactLabels: string[];
  editSurfaceLabels: string[];
  reviewObjects: MotionWorkflowLaunchKitReviewObject[];
}

export type MotionWorkflowLaunchKitReviewObjectKind =
  | 'source-evidence'
  | 'draft-variation'
  | 'component-regeneration'
  | 'timeline-contract'
  | 'teaser-target'
  | 'export-pack';

export interface MotionWorkflowLaunchKitReviewObject {
  id: string;
  kind: MotionWorkflowLaunchKitReviewObjectKind;
  label: string;
  description: string;
  artifactLabels: string[];
  sourceKind?: WorkflowSourceKind;
  sourceRef?: string;
  componentId?: string;
  targetFormat?: string;
  regenerationScopes?: string[];
}

export interface MotionWorkflowCapabilityPlan {
  kind: 'motion-workflow-capability-plan';
  mode: WorkflowRunMode;
  primaryAction: MotionWorkflowPrimaryAction;
  canRunFullAuto: boolean;
  fullAutoTemplateHints: string[];
  reviewTemplateHints: string[];
  steps: MotionWorkflowCapabilityStep[];
}

export interface MotionWorkflowCapabilityStep {
  id: string;
  gateId: MotionWorkflowRunStepGate;
  label: string;
  reviewRequired: boolean;
  autoAdvance: boolean;
  toolNames: string[];
  apiRoutes: string[];
  expectedArtifacts: string[];
  reviewObjectIds: string[];
  reviewObjectLabels: string[];
  agentTemplateHints: string[];
  editSurfaceLabels: string[];
  verificationLabels: string[];
}

const ROUTE_TOOL_NAMES: Record<string, string> = {
  '/api/motion/start': 'motion_start',
  '/api/motion/agent-handoff': 'motion_agent_handoff',
  '/api/motion/regenerate': 'motion_regenerate',
  '/api/motion/capture': 'motion_capture',
  '/api/motion/visuals': 'motion_visuals',
  '/api/motion/voice': 'motion_voice',
  '/api/motion/sync': 'motion_sync',
  '/api/motion/revise': 'motion_revise',
  '/api/motion/preview-source': 'motion_preview_source',
  '/api/motion/source-author': 'motion_source_author',
  '/api/motion/source-edit': 'motion_source_edit',
  '/api/motion/render': 'motion_render',
  '/api/motion/export-pack': 'motion_export_pack',
};

export function buildMotionWorkflowSkillDraft(
  plan: MotionWorkflowSkillPlanInput,
  examples: MotionWorkflowExample[] = []
): MotionWorkflowSkillDraft {
  const recipe = getMotionWorkflowSkillRecipe(plan.workflowId);
  const toolNames = toolNamesFor(plan);
  const reviewPolicyLabels = reviewPolicyLabelsFor(plan);
  const verificationLabels = verificationLabelsFor(plan.skillContract);
  const sampleCopyLines = uniqueStrings(examples.flatMap((example) => example.sampleCopyLines));
  const researchSignalLabels = recipe ? researchSignalLabelsFor(recipe) : [];
  const startShorthands = acceptedShorthandsFor(plan.supportedSourceKinds);
  const regenerationLabels = uniqueStrings([
    ...(plan.skillContract?.regenerationTargets.map(labelRegenerationTarget) ?? []),
    ...(recipe?.componentSlots.flatMap((slot) =>
      slot.regenerateScopes.map((scope) => `${slot.label}: ${scope}`)
    ) ?? []),
  ]);
  const launchKit = buildLaunchKit({
    plan,
    examples,
    recipe,
    sampleCopyLines,
  });
  const timelineContract = buildTimelineContract(plan, recipe);
  const capabilityPlan = buildCapabilityPlan({
    plan,
    recipe,
    launchKit,
    verificationLabels,
  });
  const manifest: SkillManifest = {
    name: safeSkillName(plan.workflowId),
    version: 1,
    description: `${plan.label} skill for editable, provenance-rich motion videos.`,
    tools: toolNames,
    referenceFiles: [],
    instructions: buildSkillInstructions({
      plan,
      toolNames,
      startShorthands,
      reviewPolicyLabels,
      recipe,
      regenerationLabels,
      verificationLabels,
      sampleCopyLines,
      timelineContract,
      launchKit,
      capabilityPlan,
    }),
  };

  return {
    kind: 'motion-workflow-skill-draft',
    label: plan.label,
    trigger: triggerFor(plan),
    manifestPathRelative: `lib/agent/skills/${manifest.name}/SKILL.md`,
    manifest,
    recipe,
    startShorthands,
    reviewPolicyLabels,
    agentTaskLabels: recipe?.agentTaskLabels ?? [],
    draftVariationLabels: recipe?.draftVariations.map((variation) => variation.label) ?? [],
    componentSlotLabels: recipe?.componentSlots.map((slot) => slot.label) ?? [],
    referencePatternLabels: recipe?.referencePatterns.map((pattern) => pattern.label) ?? [],
    skillPackLabels: recipe?.skillPacks.map((pack) => pack.label) ?? [],
    skillPackRequirements: recipe?.skillPacks ?? [],
    researchSignalLabels,
    regenerationLabels,
    toolNames,
    verificationLabels,
    sampleCopyLines,
    timelineContract,
    launchKit,
    capabilityPlan,
  };
}

function buildCapabilityPlan({
  plan,
  recipe,
  launchKit,
  verificationLabels,
}: {
  plan: MotionWorkflowSkillPlanInput;
  recipe: MotionWorkflowSkillRecipe | null;
  launchKit: MotionWorkflowLaunchKit;
  verificationLabels: string[];
}): MotionWorkflowCapabilityPlan {
  const canRunFullAuto = plan.skillContract?.runModes.includes('full-auto') ?? false;
  const steps = plan.runPlan.steps.map((step): MotionWorkflowCapabilityStep => {
    const reviewObjects = reviewObjectsForGate(step.gateId, launchKit.reviewObjects);

    return {
      id: `capability-step-${step.gateId}`,
      gateId: step.gateId,
      label: step.label,
      reviewRequired: step.reviewRequired,
      autoAdvance: step.autoAdvance,
      toolNames: step.apiRoutes.map((route) => ROUTE_TOOL_NAMES[route] ?? routeToToolName(route)),
      apiRoutes: [...step.apiRoutes],
      expectedArtifacts: [...step.expectedArtifacts],
      reviewObjectIds: reviewObjects.map((object) => object.id),
      reviewObjectLabels: reviewObjects.map((object) => object.label),
      agentTemplateHints: agentTemplateHintsForGate(step.gateId, recipe),
      editSurfaceLabels: editSurfaceLabelsForGate(step.gateId),
      verificationLabels: verificationLabelsForGate(step.gateId, verificationLabels),
    };
  });

  return {
    kind: 'motion-workflow-capability-plan',
    mode: plan.mode,
    primaryAction: plan.primaryAction,
    canRunFullAuto,
    fullAutoTemplateHints: canRunFullAuto ? fullAutoTemplateHintsFor(plan, recipe) : [],
    reviewTemplateHints: uniqueStrings(steps.flatMap((step) => step.agentTemplateHints)),
    steps,
  };
}

function reviewObjectsForGate(
  gateId: MotionWorkflowRunStepGate,
  reviewObjects: MotionWorkflowLaunchKitReviewObject[]
): MotionWorkflowLaunchKitReviewObject[] {
  switch (gateId) {
    case 'source':
    case 'plan':
      return reviewObjects.filter((object) => object.kind === 'source-evidence');
    case 'drafts':
      return reviewObjects.filter((object) => object.kind === 'draft-variation');
    case 'capture':
      return reviewObjects.filter(
        (object) =>
          object.kind === 'component-regeneration' &&
          object.regenerationScopes?.some((scope) => scope === 'capture')
      );
    case 'visuals':
      return reviewObjects.filter(
        (object) =>
          object.kind === 'component-regeneration' &&
          object.regenerationScopes?.some((scope) =>
            ['asset', 'proof', 'code', 'diagram'].includes(scope)
          )
      );
    case 'voice':
      return reviewObjects.filter(
        (object) =>
          object.kind === 'component-regeneration' &&
          object.regenerationScopes?.some((scope) => ['caption', 'copy'].includes(scope))
      );
    case 'timeline':
      return reviewObjects.filter(
        (object) =>
          object.kind === 'timeline-contract' ||
          (object.kind === 'component-regeneration' &&
            object.regenerationScopes?.some((scope) => ['timing', 'effect'].includes(scope)))
      );
    case 'render':
      return reviewObjects.filter((object) => object.kind === 'teaser-target');
    case 'export':
      return reviewObjects.filter((object) => object.kind === 'export-pack');
  }
}

function agentTemplateHintsForGate(
  gateId: MotionWorkflowRunStepGate,
  recipe: MotionWorkflowSkillRecipe | null
): string[] {
  switch (gateId) {
    case 'source':
    case 'plan':
      return ['motion-start'];
    case 'drafts':
      return ['select-draft-*', 'regenerate-component-*'];
    case 'capture':
      return recipe?.generationLanes.includes('capture')
        ? ['review-capture', 'review-computer-use-capture', 'record-product-flow']
        : [];
    case 'visuals':
      return ['generate-visuals', 'apply-generated-video-take', 'reference-signal-*'];
    case 'voice':
      return ['generate-voice'];
    case 'timeline':
      return [
        'sync-timeline',
        'apply-timeline-revision',
        'prepare-preview-source',
        'author-source',
        'edit-source',
      ];
    case 'render':
      return ['render-proof'];
    case 'export':
      return ['export-pack'];
  }
}

function editSurfaceLabelsForGate(gateId: MotionWorkflowRunStepGate): string[] {
  switch (gateId) {
    case 'source':
      return ['source'];
    case 'plan':
      return ['script', 'brief', 'proof'];
    case 'drafts':
      return ['script', 'story beats', 'component'];
    case 'capture':
      return ['capture', 'recording', 'crop', 'cursor path'];
    case 'visuals':
      return ['visual', 'image-to-video', 'component'];
    case 'voice':
      return ['voice', 'caption', 'word timing'];
    case 'timeline':
      return ['timing', 'effect', 'transition', 'source edit'];
    case 'render':
      return ['render', 'contact sheet', 'poster'];
    case 'export':
      return ['export', 'pack manifest'];
  }
}

function verificationLabelsForGate(
  gateId: MotionWorkflowRunStepGate,
  verificationLabels: string[]
): string[] {
  switch (gateId) {
    case 'render':
      return verificationLabels.filter((label) =>
        ['contact sheet', 'mp4 probe', 'poster'].includes(label)
      );
    case 'export':
      return verificationLabels.filter((label) =>
        ['subtitles', 'transcript', 'provenance manifest'].includes(label)
      );
    case 'timeline':
      return verificationLabels.filter((label) => ['subtitles', 'transcript'].includes(label));
    default:
      return [];
  }
}

function fullAutoTemplateHintsFor(
  plan: MotionWorkflowSkillPlanInput,
  recipe: MotionWorkflowSkillRecipe | null
): string[] {
  return uniqueStrings([
    'full-auto-run',
    ...(plan.runPlan.steps.some((step) => step.gateId === 'capture') ||
    recipe?.generationLanes.includes('capture')
      ? ['full-auto-computer-use-run']
      : []),
  ]);
}

function buildTimelineContract(
  plan: MotionWorkflowSkillPlanInput,
  recipe: MotionWorkflowSkillRecipe | null
): MotionWorkflowTimelineContract {
  const routeLabels = uniqueStrings(
    plan.runPlan.steps.flatMap((step) =>
      step.apiRoutes.filter((route) =>
        ['/api/motion/preview-source', '/api/motion/source-author', '/api/motion/source-edit'].includes(route)
      )
    )
  );

  return {
    kind: 'motion-workflow-timeline-contract',
    primitive: 'timeline-and-node-graph',
    laneLabels: recipe
      ? recipe.generationLanes.map(readableLabel)
      : plan.runPlan.steps.map((step) => step.label),
    editableObjectLabels: editableTimelineObjectsFor(plan, recipe),
    syncCueLabels: [
      'beat markers',
      'caption links',
      'voice clips',
      'word timings',
      'transition cues',
      'audio cues',
      'effect cues',
    ],
    nodeOutputLabels: nodeOutputLabelsFor(plan, recipe),
    sourceEditRouteLabels: routeLabels,
    reviewGateLabels: plan.runPlan.steps
      .filter((step) => step.reviewRequired)
      .map((step) => step.label),
    reviewModeInstruction:
      'Show the timeline, draft variations, source bundle, sync cues, and render proof before export.',
    fullAutoInstruction:
      'Auto-advance only after timeline, sync cues, source edits, render proof, and provenance receipts are saved.',
  };
}

function editableTimelineObjectsFor(
  plan: MotionWorkflowSkillPlanInput,
  recipe: MotionWorkflowSkillRecipe | null
): string[] {
  const gateIds = new Set(plan.runPlan.steps.map((step) => step.gateId));

  return uniqueStrings([
    'story beats',
    'draft variations',
    ...(recipe?.componentSlots.map((slot) => slot.label) ?? ['component slots']),
    ...(gateIds.has('capture') ? ['app captures', 'cursor paths', 'crop targets'] : []),
    ...(gateIds.has('visuals') ? ['visual source picks', 'image-to-video inserts'] : []),
    ...(gateIds.has('voice') ? ['voice lines', 'caption clips'] : []),
    'timeline tracks',
    'effect presets',
    'render source files',
    'export pack targets',
  ]);
}

function nodeOutputLabelsFor(
  plan: MotionWorkflowSkillPlanInput,
  recipe: MotionWorkflowSkillRecipe | null
): string[] {
  const laneLabels = recipe?.generationLanes.map(readableLabel) ?? [];

  return uniqueStrings([
    ...laneLabels,
    ...plan.runPlan.steps.flatMap((step) => step.expectedArtifacts),
  ]);
}

function buildLaunchKit({
  plan,
  examples,
  recipe,
  sampleCopyLines,
}: {
  plan: MotionWorkflowSkillPlanInput;
  examples: MotionWorkflowExample[];
  recipe: MotionWorkflowSkillRecipe | null;
  sampleCopyLines: string[];
}): MotionWorkflowLaunchKit {
  const platformTargets = uniqueStrings(examples.flatMap((example) => example.platformTargets));
  const editSurfaceLabels = uniqueStrings(
    examples.flatMap((example) => example.editSurfaces.map(readableLabel))
  );
  const reviewArtifactLabels = recipe?.reviewSurfaces.length
    ? recipe.reviewSurfaces.map((surface) => surface.label)
    : plan.skillContract?.reviewArtifacts.map((artifact) => titleCase(labelReviewArtifact(artifact))) ?? [];

  return {
    kind: 'motion-workflow-launch-kit',
    label: `${plan.label} launch kit`,
    primaryFormat: platformTargets[0] ?? null,
    installCommand: sampleCopyLines.find((line) => /^npx\s+/i.test(line.trim())) ?? null,
    postLines: sampleCopyLines,
    platformTargets,
    componentSlotLabels: recipe?.componentSlots.map((slot) => slot.label) ?? [],
    reviewArtifactLabels,
    editSurfaceLabels,
    reviewObjects: buildLaunchKitReviewObjects({
      plan,
      recipe,
      platformTargets,
    }),
  };
}

function buildLaunchKitReviewObjects({
  plan,
  recipe,
  platformTargets,
}: {
  plan: MotionWorkflowSkillPlanInput;
  recipe: MotionWorkflowSkillRecipe | null;
  platformTargets: string[];
}): MotionWorkflowLaunchKitReviewObject[] {
  return uniqueReviewObjects([
    ...plan.acceptedSources.map((source, index) => sourceEvidenceReviewObject(source, index)),
    ...(recipe?.draftVariations.map(draftVariationReviewObject) ?? []),
    ...(recipe?.componentSlots.map(componentRegenerationReviewObject) ?? []),
    timelineContractReviewObject(plan),
    ...platformTargets.map(teaserTargetReviewObject),
    ...platformTargets.map(exportPackReviewObject),
  ]);
}

function timelineContractReviewObject(
  plan: MotionWorkflowSkillPlanInput
): MotionWorkflowLaunchKitReviewObject {
  const hasSourceEdit = plan.runPlan.steps.some((step) =>
    step.apiRoutes.includes('/api/motion/source-edit')
  );

  return {
    id: 'timeline-contract',
    kind: 'timeline-contract',
    label: 'Timeline sync and source edits',
    description: hasSourceEdit
      ? 'Review sync cues, generated source bundles, and source edits before render.'
      : 'Review sync cues and timeline timing before render.',
    artifactLabels: [
      'Beat markers',
      'Caption links',
      'Transition cues',
      'Audio cues',
      'Effect cues',
      ...(hasSourceEdit ? ['Edited source files'] : []),
    ],
  };
}

function sourceEvidenceReviewObject(
  source: MotionWorkflowPlanSourceRef,
  index: number
): MotionWorkflowLaunchKitReviewObject {
  const label = source.label ?? `${titleCase(source.kind)} source`;

  return {
    id: `source-evidence-${index}`,
    kind: 'source-evidence',
    label,
    description: `Use ${label} as source evidence before drafting video claims.`,
    sourceKind: source.kind,
    sourceRef: source.ref,
    artifactLabels: evidenceArtifactLabelsFor(source.kind),
  };
}

function draftVariationReviewObject(
  variation: MotionWorkflowSkillDraftVariation
): MotionWorkflowLaunchKitReviewObject {
  return {
    id: `draft-${slugId(variation.id)}`,
    kind: 'draft-variation',
    label: variation.label,
    description: `${variation.angle} Review: ${variation.reviewPrompt}`,
    artifactLabels: variation.storyRoles,
  };
}

function componentRegenerationReviewObject(
  slot: MotionWorkflowSkillComponentSlot
): MotionWorkflowLaunchKitReviewObject {
  return {
    id: `regen-${slugId(slot.componentId)}`,
    kind: 'component-regeneration',
    label: `Regenerate ${slot.label}`,
    description: slot.reason,
    artifactLabels: [slot.role],
    componentId: slot.componentId,
    regenerationScopes: [...slot.regenerateScopes],
  };
}

function teaserTargetReviewObject(target: string): MotionWorkflowLaunchKitReviewObject {
  return {
    id: `teaser-${slugId(target)}`,
    kind: 'teaser-target',
    label: target,
    description: `Review teaser copy, crop, caption density, and first-frame hook for ${target}.`,
    targetFormat: target,
    artifactLabels: ['Video plan', 'Draft variation', 'Safe crop'],
  };
}

function exportPackReviewObject(target: string): MotionWorkflowLaunchKitReviewObject {
  return {
    id: `export-${slugId(target)}`,
    kind: 'export-pack',
    label: `${target} export pack`,
    description: `Confirm final rendered assets and sidecars for ${target}.`,
    targetFormat: target,
    artifactLabels: ['MP4', 'Poster', 'Subtitles', 'Transcript', 'Manifest'],
  };
}

function evidenceArtifactLabelsFor(kind: WorkflowSourceKind): string[] {
  if (kind === 'pr') {
    return ['PR metadata', 'Changed files', 'Diff hunks', 'Commits', 'Reviews', 'CI status'];
  }
  if (kind === 'repo') {
    return ['Repo facts', 'README claims', 'Package metadata', 'App routes'];
  }
  if (kind === 'site') {
    return ['Visible page copy', 'Screenshot', 'DOM snapshot', 'Route metadata'];
  }
  if (kind === 'capture') {
    return ['Screenshot', 'Recording', 'Cursor targets', 'Viewport receipt'];
  }
  if (kind === 'upload') {
    return ['Uploaded media', 'Transcript', 'Metadata'];
  }
  if (kind === 'reference') {
    return ['Reference brief', 'Moodboard note', 'Source URL'];
  }
  if (kind === 'remotion' || kind === 'hyperframes') {
    return ['Source bundle', 'Timeline source', 'Render manifest'];
  }
  return ['Source receipt'];
}

function toolNamesFor(plan: MotionWorkflowSkillPlanInput): string[] {
  const routeTools = uniqueStrings(
    plan.runPlan.steps.flatMap((step) =>
      step.apiRoutes.map((route) => ROUTE_TOOL_NAMES[route] ?? routeToToolName(route))
    )
  );

  if (plan.runPlan.status !== 'ready') {
    return routeTools;
  }

  return insertAfter(routeTools, 'motion_start', ROUTE_TOOL_NAMES['/api/motion/agent-handoff']);
}

function insertAfter(values: string[], after: string, value: string): string[] {
  if (values.includes(value)) {
    return values;
  }

  const index = values.indexOf(after);
  if (index === -1) {
    return [...values, value];
  }

  return [...values.slice(0, index + 1), value, ...values.slice(index + 1)];
}

function routeToToolName(route: string): string {
  return route
    .replace(/^\/api\//, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

function reviewPolicyLabelsFor(plan: MotionWorkflowSkillPlanInput): string[] {
  if (plan.sourceStatus !== 'ready') {
    return ['Ask for the missing source before drafting scenes'];
  }

  return plan.runPlan.steps.map((step) =>
    step.reviewRequired
      ? `Review ${step.label.toLowerCase()} before continuing`
      : `Auto-advance ${step.label.toLowerCase()} after saving artifacts`
  );
}

function verificationLabelsFor(contract: WorkflowSkillContract | null): string[] {
  return (contract?.verificationArtifacts ?? []).map(labelVerificationArtifact);
}

function triggerFor(plan: MotionWorkflowSkillPlanInput): string {
  const sourceLabel = plan.supportedSourceKinds.join(', ') || 'source';
  return `Create a ${plan.label.toLowerCase()} from ${sourceLabel}`;
}

function safeSkillName(id: string): string {
  return id
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/--+/g, '-');
}

function acceptedShorthandsFor(sourceKinds: WorkflowSourceKind[]): string[] {
  const sourceSet = new Set(sourceKinds);
  return [
    ...(sourceSet.has('repo') ? ['repoPath', 'repoUrl'] : []),
    ...(sourceSet.has('site') ? ['siteUrl'] : []),
    ...(sourceSet.has('pr') ? ['prRef'] : []),
    'sourceRefs',
  ];
}

function buildSkillInstructions({
  plan,
  toolNames,
  startShorthands,
  reviewPolicyLabels,
  recipe,
  regenerationLabels,
  verificationLabels,
  sampleCopyLines,
  timelineContract,
  launchKit,
  capabilityPlan,
}: {
  plan: MotionWorkflowSkillPlanInput;
  toolNames: string[];
  startShorthands: string[];
  reviewPolicyLabels: string[];
  recipe: MotionWorkflowSkillRecipe | null;
  regenerationLabels: string[];
  verificationLabels: string[];
  sampleCopyLines: string[];
  timelineContract: MotionWorkflowTimelineContract;
  launchKit: MotionWorkflowLaunchKit;
  capabilityPlan: MotionWorkflowCapabilityPlan;
}): string {
  const hasCaptureStep = plan.runPlan.steps.some((step) =>
    step.apiRoutes.includes('/api/motion/capture')
  );

  return [
    `# ${plan.label}`,
    '',
    `Use this skill to create editable ${plan.label.toLowerCase()} outputs inside aether's timeline canvas.`,
    '',
    '## Input shape',
    '',
    '```json',
    JSON.stringify(
      {
        mode: 'review | full-auto',
        repoPath: startShorthands.includes('repoPath') ? '/absolute/local/repo/path' : undefined,
        repoUrl: startShorthands.includes('repoUrl') ? 'https://github.com/owner/repo' : undefined,
        siteUrl: startShorthands.includes('siteUrl') ? 'https://app.example.com/route' : undefined,
        prRef: startShorthands.includes('prRef') ? 'owner/repo#123' : undefined,
        sourceRefs: [{ kind: plan.supportedSourceKinds[0] ?? 'repo', ref: '...' }],
        audience: 'who this video is for',
        tone: 'copy and motion tone',
        platformTargets: [{ platform: 'x', aspectRatio: '9:16', seconds: 30 }],
        requestedEngines: plan.engines,
      },
      null,
      2
    ),
    '```',
    '',
    '## Workflow',
    '',
    ...plan.runPlan.steps.map((step, index) =>
      [
        `${index + 1}. ${step.label}`,
        `   - Call: ${step.apiRoutes.join(' + ')}`,
        `   - Use tools: ${step.toolIds.join(', ') || toolNames.join(', ') || 'source input'}`,
        `   - Inputs: ${step.inputSummary.join(', ')}`,
        `   - Produce: ${step.expectedArtifacts.join(', ')}`,
        step.reviewRequired
          ? '   - Pause for creator review before continuing.'
          : '   - Continue only after saving the artifacts and blockers.',
      ].join('\n')
    ),
    '',
    hasCaptureStep ? '## Capture Runbook' : '',
    hasCaptureStep ? 'Read capturePlan.agentRunbook before capturing app media.' : '',
    hasCaptureStep
      ? 'Use capturePlan.requests[].agentInstructions for setup, browser capture, screen recording, and artifact receipts.'
      : '',
    hasCaptureStep
      ? 'Use browser capture first, then computer-use capture when auth, native UI, simulator, or gesture state blocks the browser.'
      : '',
    hasCaptureStep
      ? 'Apply successful artifacts through /api/motion/capture so screenshots, recordings, DOM snapshots, traces, cursor targets, and provenance rejoin the timeline.'
      : '',
    hasCaptureStep ? '' : '',
    '## Agent Handoff',
    '',
    'After /api/motion/start returns a ready project, keep `agentHandoff` with the project.',
    'For full-auto or selected saved gates, call /api/motion/agent-handoff with `{ agentHandoff, project, templateIds, input }`.',
    'Use `input.imageToVideoProviderId`, `input.voiceProviderId`, `input.renderProviderId`, and `input.editedSourceFiles` to resolve placeholders before execution.',
    'If the handoff response is blocked, show the missing placeholders or provider setup receipts as review blockers.',
    '',
    recipe ? '## Agent Tasks' : '',
    ...(recipe?.agentTaskLabels.map((label) => `- ${label}.`) ?? []),
    recipe ? '' : '',
    recipe ? '## Draft Variations' : '',
    ...(recipe?.draftVariations.map(
      (variation) =>
        `- ${variation.label}: ${variation.angle} Review: ${variation.reviewPrompt}`
    ) ?? []),
    recipe ? '' : '',
    '## Launch Kit',
    '',
    `Primary format: ${launchKit.primaryFormat ?? 'choose format'}.`,
    launchKit.installCommand ? `Install command: ${launchKit.installCommand}.` : '',
    `Launch copy: ${formatList(launchKit.postLines)}.`,
    `Launch components: ${formatList(launchKit.componentSlotLabels)}.`,
    `Review artifacts: ${formatList(launchKit.reviewArtifactLabels)}.`,
    '',
    '## Timeline Contract',
    '',
    `Primitive: ${timelineContract.primitive}.`,
    `Lanes: ${formatList(timelineContract.laneLabels)}.`,
    `Editable objects: ${formatList(timelineContract.editableObjectLabels)}.`,
    `Sync cues: ${formatList(timelineContract.syncCueLabels)}.`,
    `Node outputs: ${formatList(timelineContract.nodeOutputLabels)}.`,
    `Source edit routes: ${formatList(timelineContract.sourceEditRouteLabels)}.`,
    `Review gates: ${formatList(timelineContract.reviewGateLabels)}.`,
    `Review mode: ${timelineContract.reviewModeInstruction}`,
    `Full auto: ${timelineContract.fullAutoInstruction}`,
    '',
    '## Capability Plan',
    '',
    `Mode: ${capabilityPlan.mode}.`,
    `Primary action: ${capabilityPlan.primaryAction}.`,
    `Full-auto templates: ${formatList(capabilityPlan.fullAutoTemplateHints)}.`,
    `Review templates: ${formatList(capabilityPlan.reviewTemplateHints)}.`,
    ...capabilityPlan.steps.map(formatCapabilityStep),
    '',
    recipe && recipe.skillPacks.length > 0 ? '## Skill Packs' : '',
    ...(recipe?.skillPacks.map(formatSkillPackRequirement) ?? []),
    recipe && recipe.skillPacks.length > 0 ? '' : '',
    '## Launch Kit Review Objects',
    '',
    ...launchKit.reviewObjects.map(formatLaunchKitReviewObject),
    launchKit.reviewObjects.length > 0 ? '' : '',
    recipe ? '## Component Regeneration' : '',
    ...(recipe?.componentSlots.map(
      (slot) =>
        `- ${slot.label}: ${slot.reason} Regenerate: ${slot.regenerateScopes.join(', ')}.`
    ) ?? []),
    recipe ? '' : '',
    recipe ? '## Reference Patterns' : '',
    ...(recipe?.referencePatterns.map(
      (pattern) =>
        `- ${pattern.label}: ${pattern.purpose} Edit: ${pattern.editSurfaces.join(', ')}. Verify: ${pattern.verificationLabels.join(', ')}.`
    ) ?? []),
    recipe ? '' : '',
    recipe ? '## Research Signals' : '',
    ...(recipe ? researchSignalLabelsFor(recipe).map((label) => `- ${label}.`) : []),
    recipe ? '' : '',
    recipe ? '## Review Surfaces' : '',
    ...(recipe?.reviewSurfaces.map(
      (surface) => `- ${surface.label}: ${surface.purpose}`
    ) ?? []),
    recipe ? `Review mode: ${recipe.reviewPolicy}` : '',
    recipe ? `Full auto: ${recipe.fullAutoPolicy}` : '',
    '',
    '## Review Policy',
    '',
    ...reviewPolicyLabels.map((label) => `- ${label}.`),
    '',
    '## Editable Outputs',
    '',
    `Review artifacts: ${formatList(plan.skillContract?.reviewArtifacts.map(labelReviewArtifact) ?? [])}.`,
    `Regeneration targets: ${formatList(regenerationLabels)}.`,
    '',
    '## Verification',
    '',
    `Required proof: ${formatList(verificationLabels)}.`,
    'Do not mark the video done until render proof, subtitles, transcript, and provenance manifest are present or listed as blockers.',
    '',
    sampleCopyLines.length > 0 ? '## Example Copy' : '',
    ...sampleCopyLines.map((line) => `- ${line}`),
    sampleCopyLines.length > 0 ? '' : '',
    '## Output format',
    '',
    '```json',
    JSON.stringify(
      {
        ok: true,
        result: {
          mode: 'review | full-auto',
          status: 'ready | needs-source | needs-evidence | blocked',
          workflowId: plan.workflowId,
          timelineContract: {
            primitive: timelineContract.primitive,
            syncCues: timelineContract.syncCueLabels,
            editableObjects: timelineContract.editableObjectLabels,
          },
          capabilityPlan: {
            mode: capabilityPlan.mode,
            primaryAction: capabilityPlan.primaryAction,
            steps: capabilityPlan.steps.map((step) => ({
              id: step.id,
              gateId: step.gateId,
              label: step.label,
              reviewObjects: step.reviewObjectLabels,
              templates: step.agentTemplateHints,
            })),
          },
          motionStartRequest: {
            workspaceId: 'workspace',
            sourceRefs: [],
            platformTargets: [],
          },
          reviewArtifacts: ['video-plan', 'draft-variations', 'timeline', 'render-proof'],
          regenerationActions: [{ target: 'component', label: 'Regenerate scene component' }],
          verification: { required: verificationLabels },
          nextAction:
            plan.mode === 'full-auto'
              ? 'continue-through-saved-gates'
              : 'show-review-artifacts',
        },
      },
      null,
      2
    ),
    '```',
    '',
    'On error return `{ "ok": false, "result": null, "error": "message" }`.',
  ].filter((line) => line !== '').join('\n');
}

function labelReviewArtifact(artifact: WorkflowReviewArtifact): string {
  return artifact.replace(/-/g, ' ');
}

function labelRegenerationTarget(target: WorkflowRegenerationTarget): string {
  return target.replace(/-/g, ' ');
}

function labelVerificationArtifact(artifact: WorkflowVerificationArtifact): string {
  return artifact.replace(/-/g, ' ');
}

function readableLabel(value: string): string {
  return value.replace(/[-_]/g, ' ');
}

function titleCase(value: string): string {
  return value.replace(/[-_]/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function slugId(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function formatLaunchKitReviewObject(object: MotionWorkflowLaunchKitReviewObject): string {
  const details = [
    object.sourceRef ? `source: ${object.sourceRef}` : '',
    object.componentId ? `component: ${object.componentId}` : '',
    object.targetFormat ? `target: ${object.targetFormat}` : '',
    object.regenerationScopes?.length
      ? `regenerate: ${object.regenerationScopes.join(', ')}`
      : '',
    object.artifactLabels.length ? `artifacts: ${object.artifactLabels.join(', ')}` : '',
  ].filter((detail) => detail.length > 0);

  return `- ${object.label} (${object.kind}): ${object.description}${
    details.length > 0 ? ` ${details.join('; ')}.` : ''
  }`;
}

function formatSkillPackRequirement(pack: MotionWorkflowSkillPackRequirement): string {
  return [
    `- ${pack.label}: ${pack.purpose}`,
    `  Install: ${pack.installCommand}.`,
    `  Source: ${pack.sourceUrl}.`,
    `  Verify: ${pack.verificationLabels.join(', ')}.`,
  ].join('\n');
}

function formatCapabilityStep(step: MotionWorkflowCapabilityStep): string {
  return [
    `- ${step.label}: ${step.reviewRequired ? 'review gate' : 'auto gate'}`,
    `  Routes: ${formatList(step.apiRoutes)}.`,
    `  Templates: ${formatList(step.agentTemplateHints)}.`,
    `  Review objects: ${formatList(step.reviewObjectLabels)}.`,
    `  Edit: ${formatList(step.editSurfaceLabels)}.`,
    `  Verify: ${formatList(step.verificationLabels)}.`,
  ].join('\n');
}

function researchSignalLabelsFor(recipe: MotionWorkflowSkillRecipe): string[] {
  const seen = new Set<string>();
  return recipe.referencePatterns
    .flatMap((pattern) => pattern.researchSources)
    .filter((source) => {
      if (seen.has(source.id)) return false;
      seen.add(source.id);
      return true;
    })
    .map((source) => `${source.label}: ${source.observedPattern} (${source.url})`);
}

function formatList(values: string[]): string {
  return values.length > 0 ? values.join(', ') : 'none';
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}

function uniqueReviewObjects(
  objects: MotionWorkflowLaunchKitReviewObject[]
): MotionWorkflowLaunchKitReviewObject[] {
  const seen = new Set<string>();
  return objects.filter((object) => {
    if (seen.has(object.id)) return false;
    seen.add(object.id);
    return true;
  });
}
