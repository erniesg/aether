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
}

const ROUTE_TOOL_NAMES: Record<string, string> = {
  '/api/motion/start': 'motion_start',
  '/api/motion/regenerate': 'motion_regenerate',
  '/api/motion/capture': 'motion_capture',
  '/api/motion/visuals': 'motion_visuals',
  '/api/motion/voice': 'motion_voice',
  '/api/motion/sync': 'motion_sync',
  '/api/motion/revise': 'motion_revise',
  '/api/motion/source-edit': 'motion_source_edit',
  '/api/motion/render': 'motion_render',
  '/api/motion/export-pack': 'motion_export_pack',
};

export function buildMotionWorkflowSkillDraft(
  plan: MotionWorkflowSkillPlanInput,
  examples: MotionWorkflowExample[] = []
): MotionWorkflowSkillDraft {
  const recipe = getMotionWorkflowSkillRecipe(plan.workflowId);
  const toolNames = toolNamesFor(plan.runPlan);
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
  };
}

function toolNamesFor(runPlan: AgentMotionWorkflowRunPlan): string[] {
  return uniqueStrings(
    runPlan.steps.flatMap((step) =>
      step.apiRoutes.map((route) => ROUTE_TOOL_NAMES[route] ?? routeToToolName(route))
    )
  );
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
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
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
