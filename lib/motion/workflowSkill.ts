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
  MotionWorkflowSourceStatus,
} from './workflowPlan';
import type { MotionWorkflowExample } from './workflowExamples';
import {
  getMotionWorkflowSkillRecipe,
  type MotionWorkflowSkillComponentSlot,
  type MotionWorkflowSkillDraftVariation,
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
  researchSignalLabels: string[];
  regenerationLabels: string[];
  toolNames: string[];
  verificationLabels: string[];
  sampleCopyLines: string[];
  launchKit: MotionWorkflowLaunchKit;
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
      launchKit,
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
    researchSignalLabels,
    regenerationLabels,
    toolNames,
    verificationLabels,
    sampleCopyLines,
    launchKit,
  };
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
    ...platformTargets.map(teaserTargetReviewObject),
    ...platformTargets.map(exportPackReviewObject),
  ]);
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
  launchKit,
}: {
  plan: MotionWorkflowSkillPlanInput;
  toolNames: string[];
  startShorthands: string[];
  reviewPolicyLabels: string[];
  recipe: MotionWorkflowSkillRecipe | null;
  regenerationLabels: string[];
  verificationLabels: string[];
  sampleCopyLines: string[];
  launchKit: MotionWorkflowLaunchKit;
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
