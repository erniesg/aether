import { NextResponse } from 'next/server';
import {
  listWorkflowRegistryEntries,
  type WorkflowEngine,
  type WorkflowRegistryEntry,
  type WorkflowRunMode,
  type WorkflowSourceKind,
} from '@/lib/workflow/registry';
import {
  listMotionWorkflowExamples,
  type MotionWorkflowExample,
} from '@/lib/motion/workflowExamples';
import {
  buildAgentMotionWorkflowPlan,
  type MotionWorkflowPlanSourceRef,
} from '@/lib/motion/workflowPlan';
import {
  getMotionWorkflowSkillRecipe,
  type MotionWorkflowSkillRecipe,
} from '@/lib/motion/workflowSkillCatalog';
import type { MotionWorkflowSkillDraft } from '@/lib/motion/workflowSkill';
import {
  listMotionReferenceCorpusForWorkflow,
  type MotionReferenceCorpusEntry,
} from '@/lib/motion/referenceCorpus';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID_SOURCE_KINDS = new Set<WorkflowSourceKind>([
  'repo',
  'pr',
  'site',
  'capture',
  'upload',
  'reference',
  'remotion',
  'hyperframes',
]);
const VALID_ENGINES = new Set<WorkflowEngine>(['remotion', 'hyperframes', 'provider']);
const VALID_MODES = new Set<WorkflowRunMode>(['review', 'full-auto']);

interface MotionWorkflowDiscoveryFilters {
  sourceKind?: WorkflowSourceKind;
  engine?: WorkflowEngine;
  mode?: WorkflowRunMode;
}

interface MotionWorkflowSkillResponse {
  kind: 'motion-workflow-skill';
  id: string;
  version: number;
  artifactKind: string;
  label: string;
  summary?: string;
  toolIds: string[];
  sourceKinds: WorkflowSourceKind[];
  engines: WorkflowEngine[];
  reviewGates: string[];
  skillContract: WorkflowRegistryEntry['skillContract'];
  startHints: {
    acceptedShorthands: string[];
    defaultMode: WorkflowRunMode;
  };
  workflowRecipe: MotionWorkflowSkillRecipe | null;
  installableSkillDraft: MotionWorkflowSkillDraft;
  examples: MotionWorkflowExampleResponse[];
  referenceCorpus: MotionReferenceCorpusResponse[];
  status: WorkflowRegistryEntry['status'];
}

interface MotionWorkflowExampleResponse {
  id: string;
  label: string;
  summary: string;
  sourceKinds: WorkflowSourceKind[];
  suggestedMode: WorkflowRunMode;
  platformTargets: string[];
  storyRoles: string[];
  beatPrompts: string[];
  reusableComponentIds: string[];
  editSurfaces: string[];
  sampleCopyLines: string[];
}

interface MotionReferenceCorpusResponse {
  id: string;
  title: string;
  sourceUrl: string;
  platform: MotionReferenceCorpusEntry['platform'];
  sourceKind: MotionReferenceCorpusEntry['sourceKind'];
  proofBoundary: MotionReferenceCorpusEntry['proofBoundary'];
  observedFormat: MotionReferenceCorpusEntry['observedFormat'];
  observedPrimitives: string[];
  shotNotes: string[];
  styleTags: MotionReferenceCorpusEntry['styleTags'];
  componentIds: string[];
  workflowIds: string[];
  tags: MotionReferenceCorpusEntry['tags'];
  aetherImplication: string;
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const parsed = parseFilters(url.searchParams);
  if ('invalidFilters' in parsed) {
    return NextResponse.json(
      {
        ok: false,
        error: 'unsupported workflow discovery filter',
        invalidFilters: parsed.invalidFilters,
      },
      { status: 400 }
    );
  }

  const workflows = listWorkflowRegistryEntries()
    .filter(isMotionWorkflowSkill)
    .filter((workflow) => matchesFilters(workflow, parsed))
    .map(toMotionWorkflowSkillResponse);

  return NextResponse.json({
    ok: true,
    filters: parsed,
    workflowCount: workflows.length,
    workflows,
  });
}

function parseFilters(
  params: URLSearchParams
): MotionWorkflowDiscoveryFilters | { invalidFilters: string[] } {
  const invalidFilters: string[] = [];
  const sourceKind = params.get('sourceKind');
  const engine = params.get('engine');
  const mode = params.get('mode');

  if (sourceKind && !VALID_SOURCE_KINDS.has(sourceKind as WorkflowSourceKind)) {
    invalidFilters.push('sourceKind');
  }
  if (engine && !VALID_ENGINES.has(engine as WorkflowEngine)) {
    invalidFilters.push('engine');
  }
  if (mode && !VALID_MODES.has(mode as WorkflowRunMode)) {
    invalidFilters.push('mode');
  }
  if (invalidFilters.length > 0) return { invalidFilters };

  return {
    sourceKind: sourceKind ? (sourceKind as WorkflowSourceKind) : undefined,
    engine: engine ? (engine as WorkflowEngine) : undefined,
    mode: mode ? (mode as WorkflowRunMode) : undefined,
  };
}

function isMotionWorkflowSkill(workflow: WorkflowRegistryEntry): boolean {
  return workflow.artifactKind === 'video' && workflow.status !== 'archived';
}

function matchesFilters(
  workflow: WorkflowRegistryEntry,
  filters: MotionWorkflowDiscoveryFilters
): boolean {
  if (filters.sourceKind && !(workflow.sourceKinds ?? []).includes(filters.sourceKind)) {
    return false;
  }
  if (filters.engine && !(workflow.engines ?? []).includes(filters.engine)) {
    return false;
  }
  if (filters.mode && !(workflow.skillContract?.runModes ?? []).includes(filters.mode)) {
    return false;
  }
  return true;
}

function toMotionWorkflowSkillResponse(
  workflow: WorkflowRegistryEntry
): MotionWorkflowSkillResponse {
  return {
    kind: 'motion-workflow-skill',
    id: workflow.id,
    version: workflow.version,
    artifactKind: workflow.artifactKind,
    label: workflow.label,
    summary: workflow.summary,
    toolIds: [...workflow.toolIds],
    sourceKinds: [...(workflow.sourceKinds ?? [])],
    engines: [...(workflow.engines ?? [])],
    reviewGates: [...(workflow.reviewGates ?? [])],
    skillContract: workflow.skillContract,
    startHints: {
      acceptedShorthands: acceptedShorthandsFor(workflow.sourceKinds ?? []),
      defaultMode: 'review',
    },
    workflowRecipe: getMotionWorkflowSkillRecipe(workflow.id),
    installableSkillDraft: buildDiscoverySkillDraft(workflow),
    examples: listMotionWorkflowExamples(workflow.id).map(toMotionWorkflowExampleResponse),
    referenceCorpus: listMotionReferenceCorpusForWorkflow(workflow.id).map(
      toMotionReferenceCorpusResponse
    ),
    status: workflow.status,
  };
}

function buildDiscoverySkillDraft(workflow: WorkflowRegistryEntry): MotionWorkflowSkillDraft {
  const sourceRefs = placeholderSourceRefs(workflow);
  return buildAgentMotionWorkflowPlan({
    workflowId: workflow.id,
    mode: 'review',
    sourceRefs,
    requestedEngines: workflow.engines,
    createdAt: 0,
  }).skillDraft;
}

function placeholderSourceRefs(workflow: WorkflowRegistryEntry): MotionWorkflowPlanSourceRef[] {
  const sourceKind = workflow.sourceKinds?.[0];
  if (!sourceKind) return [];

  return [
    {
      kind: sourceKind,
      ref: `workflow:${workflow.id}:${sourceKind}`,
      label: `${workflow.label} source`,
    },
  ];
}

function toMotionWorkflowExampleResponse(
  example: MotionWorkflowExample
): MotionWorkflowExampleResponse {
  return {
    id: example.id,
    label: example.label,
    summary: example.summary,
    sourceKinds: [...example.sourceKinds],
    suggestedMode: example.suggestedMode,
    platformTargets: [...example.platformTargets],
    storyRoles: [...example.storyRoles],
    beatPrompts: [...example.beatPrompts],
    reusableComponentIds: [...example.reusableComponentIds],
    editSurfaces: [...example.editSurfaces],
    sampleCopyLines: [...example.sampleCopyLines],
  };
}

function toMotionReferenceCorpusResponse(
  entry: MotionReferenceCorpusEntry
): MotionReferenceCorpusResponse {
  return {
    id: entry.id,
    title: entry.title,
    sourceUrl: entry.sourceUrl,
    platform: entry.platform,
    sourceKind: entry.sourceKind,
    proofBoundary: entry.proofBoundary,
    observedFormat: entry.observedFormat,
    observedPrimitives: [...entry.observedPrimitives],
    shotNotes: [...entry.shotNotes],
    styleTags: [...entry.styleTags],
    componentIds: [...entry.componentIds],
    workflowIds: [...entry.workflowIds],
    tags: [...entry.tags],
    aetherImplication: entry.aetherImplication,
  };
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
