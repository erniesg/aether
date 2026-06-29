import type { ToolRegistryId } from '@/lib/tool/registry';
import type { WorkflowEngine, WorkflowSourceKind } from '@/lib/workflow/registry';
import { CodeChangeProviderUnavailableError } from '@/lib/providers/code-change/registry';
import type { CodeChangeResult, CodeChangeSource } from '@/lib/providers/code-change/types';
import {
  buildAgentMotionCapturePlan,
  type AgentMotionCapturePlan,
} from './capturePlan';
import {
  buildMotionAgentExecutionHandoff,
  type MotionAgentExecutionHandoff,
} from './agentHandoff';
import {
  buildMotionPreviewPlan,
  type MotionPreviewPlan,
  type MotionPreviewRuntimeKind,
  type MotionPreviewSourcePackage,
} from './previewPlan';
import { buildMotionReviewPlan, type MotionReviewPlan } from './reviewPlan';
import {
  listMotionWorkflowExamples,
  type MotionWorkflowExample,
} from './workflowExamples';
import { buildCodeChangeMotionProject } from './storyboard';
import {
  buildRepoMotionProjectFromUrl,
  type BuildRepoMotionProjectFromUrlOptions,
  type RepoMotionProjectKind,
} from './repoMotion';
import type { BuildLocalRepoMotionProjectFromPathOptions } from './localRepoMotion';
import { buildSiteMotionProjectFromUrl } from './siteMotion';
import { materializeMotionTimeline } from './timeline';
import type {
  AppProfile,
  MotionPlatformTarget,
  MotionProject,
  MotionProvenanceRef,
  MotionSourceProfile,
  MotionWorkflowMode,
} from './project';
import {
  buildPrMotionProjectFromSource,
  type BuildPrMotionProjectFromSourceOptions,
} from './prMotion';
import { buildSourceSetMotionProject } from './sourceSetMotion';
import {
  routeAgentMotionWorkflow,
  type MotionWorkflowIntent,
  type RoutedAgentMotionWorkflow,
} from './workflowRouter';
import type { MotionWorkflowPlanSourceRef } from './workflowPlan';
import type {
  MotionRenderEngine,
  MotionRenderSourceFile,
} from '@/lib/providers/video/types';
import type {
  MotionSourcePatchDraft,
  MotionSourcePatchDraftOption,
} from './sourcePatchDraft';

export type AgentMotionStartStatus =
  | 'ready'
  | 'needs-source'
  | 'needs-evidence'
  | 'planned-only';

export type AgentMotionRequestedInput =
  | {
      kind: 'source';
      label: string;
      missingSourceKinds: WorkflowSourceKind[];
    }
  | {
      kind: 'code-change';
      label: string;
      sourceRef: MotionWorkflowPlanSourceRef;
      toolId: ToolRegistryId;
    }
  | {
      kind: 'project-builder';
      label: string;
      workflowId: string;
    };

export interface StartAgentMotionWorkflowInput {
  id: string;
  workspaceId: string;
  intent?: MotionWorkflowIntent;
  mode: MotionWorkflowMode;
  sourceRefs: MotionWorkflowPlanSourceRef[];
  audience: string;
  tone: string;
  platformTargets: MotionPlatformTarget[];
  requestedEngines?: WorkflowEngine[];
  createdAt: number;
  codeChange?: CodeChangeResult;
  codeChangeSource?: CodeChangeSource;
  appProfile?: AppProfile;
}

export interface StartAgentMotionWorkflowOptions
  extends BuildRepoMotionProjectFromUrlOptions,
    BuildPrMotionProjectFromSourceOptions,
    BuildLocalRepoMotionProjectFromPathOptions {}

export interface MotionPreparedPreviewSource {
  id: string;
  projectId: string;
  draftId: string;
  engine: MotionRenderEngine;
  runtimeKind: MotionPreviewRuntimeKind;
  label: string;
  mountLabel: string;
  compositionId: string;
  entryPoint: string;
  durationSeconds: number;
  fps: number;
  sourceHostRequirement: string;
  editLinkLabels: string[];
  runtimeHost: MotionPreparedPreviewRuntimeHost;
  sourcePackage?: MotionPreviewSourcePackage | null;
  sourceHost: {
    apiRoute: string;
    entryPath: string | null;
    timelinePath: string | null;
    manifestPath: string | null;
    sourceFileCount: number;
  };
  sourceFiles: MotionRenderSourceFile[];
}

export interface MotionPreparedPreviewRuntimeHost {
  status: 'needs-player-adapter' | 'embedded-preview' | 'source-ready';
  previewSurface: 'player' | 'iframe';
  dependencyLabels: string[];
  adapterRequirement: string | null;
}

export interface AgentMotionStartResult {
  status: AgentMotionStartStatus;
  workflow: RoutedAgentMotionWorkflow;
  project: MotionProject | null;
  reviewPlan: MotionReviewPlan | null;
  previewPlan: MotionPreviewPlan | null;
  preparedPreviewSource?: MotionPreparedPreviewSource | null;
  sourcePatchDraft?: MotionSourcePatchDraft | null;
  sourcePatchDraftOptions?: MotionSourcePatchDraftOption[];
  capturePlan: AgentMotionCapturePlan | null;
  agentHandoff: MotionAgentExecutionHandoff | null;
  examples: MotionWorkflowExample[];
  requestedInputs: AgentMotionRequestedInput[];
}

export async function startAgentMotionWorkflow(
  input: StartAgentMotionWorkflowInput,
  options: StartAgentMotionWorkflowOptions = {}
): Promise<AgentMotionStartResult> {
  const workflow = routeAgentMotionWorkflow({
    intent: input.intent,
    mode: input.mode,
    sourceRefs: input.sourceRefs,
    requestedEngines: input.requestedEngines,
    createdAt: input.createdAt,
  });

  if (workflow.plan.sourceStatus !== 'ready') {
    return {
      status: 'needs-source',
      workflow,
      project: null,
      reviewPlan: null,
      previewPlan: null,
      capturePlan: null,
      agentHandoff: null,
      examples: examplesFor(workflow),
      requestedInputs: [
        {
          kind: 'source',
          label: formatMissingSourceLabel(workflow.plan.missingSourceKinds),
          missingSourceKinds: workflow.plan.missingSourceKinds,
        },
      ],
    };
  }

  if (workflow.workflowId === 'pr-to-video') {
    return await startCodeChangeWorkflow(input, workflow, options);
  }

  if (
    workflow.workflowId === 'repo-launch-video' ||
    workflow.workflowId === 'feature-social-video'
  ) {
    const repoSource = findSource(input.sourceRefs, 'repo');
    if (repoSource) {
      const project = isLocalRepoRef(repoSource.ref)
        ? await buildLocalRepoStartProject(input, repoSource, options)
        : await buildRepoMotionProjectFromUrl(
            {
              id: input.id,
              workspaceId: input.workspaceId,
              repoUrl: repoSource.ref,
              projectKind: projectKindFor(input),
              workflowMode: input.mode,
              audience: input.audience,
              tone: input.tone,
              platformTargets: input.platformTargets,
              materializeTimeline: true,
              createdAt: input.createdAt,
            },
            options
          );
      return readyResult(
        workflow,
        withInputSourceSet(project, input.sourceRefs),
        input.createdAt
      );
    }

    const siteSource = findSource(input.sourceRefs, 'site');
    if (siteSource) {
      const project = await buildSiteStartProject(input, siteSource, options);
      return readyResult(
        workflow,
        withInputSourceSet(project, input.sourceRefs),
        input.createdAt
      );
    }
  }

  if (workflow.workflowId === 'website-to-video') {
    const siteSource = findSource(input.sourceRefs, 'site');
    if (siteSource) {
      const project = await buildSiteStartProject(input, siteSource, options);
      return readyResult(
        workflow,
        withInputSourceSet(project, input.sourceRefs),
        input.createdAt
      );
    }
  }

  if (
    workflow.workflowId === 'caption-overlay-video' ||
    workflow.workflowId === 'motion-graphic-video' ||
    workflow.workflowId === 'remotion-hyperframes-port'
  ) {
    const project = materializeMotionTimeline(
      buildSourceSetMotionProject({
        id: input.id,
        workspaceId: input.workspaceId,
        workflowId: workflow.workflowId,
        workflowMode: input.mode,
        sourceRefs: input.sourceRefs,
        audience: input.audience,
        tone: input.tone,
        platformTargets: input.platformTargets,
        createdAt: input.createdAt,
      }),
      { updatedAt: input.createdAt }
    );

    return readyResult(workflow, project, input.createdAt);
  }

  return {
    status: 'planned-only',
    workflow,
    project: null,
    reviewPlan: null,
    previewPlan: null,
    capturePlan: null,
    agentHandoff: null,
    examples: examplesFor(workflow),
    requestedInputs: [
      {
        kind: 'project-builder',
        label: `Create editable project builder for ${workflow.workflowId}`,
        workflowId: workflow.workflowId,
      },
    ],
  };
}

async function startCodeChangeWorkflow(
  input: StartAgentMotionWorkflowInput,
  workflow: RoutedAgentMotionWorkflow,
  options: StartAgentMotionWorkflowOptions
): Promise<AgentMotionStartResult> {
  const prSource = findSource(input.sourceRefs, 'pr');
  if (!prSource) {
    return needsCodeChangeEvidence(input, workflow, prSource);
  }

  if (!input.codeChange || !input.appProfile) {
    try {
      const project = await buildPrMotionProjectFromSource(
        {
          id: input.id,
          workspaceId: input.workspaceId,
          prRef: prSource.ref,
          workflowMode: input.mode,
          audience: input.audience,
          tone: input.tone,
          appProfile: input.appProfile,
          codeChange: input.codeChange,
          codeChangeSource: input.codeChangeSource,
          platformTargets: input.platformTargets,
          materializeTimeline: true,
          createdAt: input.createdAt,
        },
        options
      );

      return readyResult(workflow, project, input.createdAt);
    } catch (error) {
      if (!(error instanceof CodeChangeProviderUnavailableError)) throw error;
      return needsCodeChangeEvidence(input, workflow, prSource);
    }
  }

  const project = materializeMotionTimeline(
    buildCodeChangeMotionProject({
      id: input.id,
      workspaceId: input.workspaceId,
      sourceRef: input.codeChangeSource ?? { kind: 'github-pr', ref: prSource.ref },
      workflowMode: input.mode,
      audience: input.audience,
      tone: input.tone,
      appProfile: input.appProfile,
      codeChange: input.codeChange,
      platformTargets: input.platformTargets,
      createdAt: input.createdAt,
    }),
    { updatedAt: input.createdAt }
  );

  return readyResult(workflow, project, input.createdAt);
}

function needsCodeChangeEvidence(
  input: StartAgentMotionWorkflowInput,
  workflow: RoutedAgentMotionWorkflow,
  prSource: MotionWorkflowPlanSourceRef | undefined
): AgentMotionStartResult {
  return {
    status: 'needs-evidence',
    workflow,
    project: null,
    reviewPlan: null,
    previewPlan: null,
    capturePlan: null,
    agentHandoff: null,
    examples: examplesFor(workflow),
    requestedInputs: [
      {
        kind: 'code-change',
        label: 'Collect PR evidence',
        sourceRef: prSource ?? { kind: 'pr', ref: 'missing-pr-source' },
        toolId: 'motion-brief',
      },
    ],
  };
}

function readyResult(
  workflow: RoutedAgentMotionWorkflow,
  project: MotionProject,
  requestedAt: number
): AgentMotionStartResult {
  const capturePlan = capturePlanFor(project);

  return {
    status: 'ready',
    workflow,
    project,
    reviewPlan: buildMotionReviewPlan(project),
    previewPlan: buildMotionPreviewPlan(project, {
      engines: workflow.plan.engines,
      workflowRunPlan: workflow.plan.runPlan,
      requestedAt,
    }),
    capturePlan,
    agentHandoff: buildMotionAgentExecutionHandoff({
      workflow,
      project,
      capturePlan,
    }),
    examples: examplesFor(workflow),
    requestedInputs: [],
  };
}

function examplesFor(workflow: RoutedAgentMotionWorkflow): MotionWorkflowExample[] {
  return listMotionWorkflowExamples(workflow.workflowId);
}

function capturePlanFor(project: MotionProject): AgentMotionCapturePlan | null {
  const capturePlan = buildAgentMotionCapturePlan(project);
  if (capturePlan.status === 'not-needed') return null;
  if (
    capturePlan.status === 'needs-source' &&
    capturePlan.requests.length === 0 &&
    !hasCaptureCapableSource(project)
  ) {
    return null;
  }
  return capturePlan;
}

function hasCaptureCapableSource(project: MotionProject): boolean {
  return project.sourceRefs.some(
    (source) => source.kind === 'repo' || source.kind === 'site' || source.kind === 'capture'
  );
}

async function buildSiteStartProject(
  input: StartAgentMotionWorkflowInput,
  siteSource: MotionWorkflowPlanSourceRef,
  options: BuildRepoMotionProjectFromUrlOptions
): Promise<MotionProject> {
  return await buildSiteMotionProjectFromUrl(
    {
      id: input.id,
      workspaceId: input.workspaceId,
      siteUrl: siteSource.ref,
      siteLabel: siteSource.label,
      projectKind: projectKindFor(input),
      workflowMode: input.mode,
      audience: input.audience,
      tone: input.tone,
      platformTargets: input.platformTargets,
      materializeTimeline: true,
      createdAt: input.createdAt,
    },
    options
  );
}

async function buildLocalRepoStartProject(
  input: StartAgentMotionWorkflowInput,
  repoSource: MotionWorkflowPlanSourceRef,
  options: StartAgentMotionWorkflowOptions
): Promise<MotionProject> {
  const { buildLocalRepoMotionProjectFromPath } = await import('./localRepoMotion');
  return await buildLocalRepoMotionProjectFromPath(
    {
      id: input.id,
      workspaceId: input.workspaceId,
      repoPath: repoSource.ref,
      projectKind: projectKindFor(input),
      workflowMode: input.mode,
      audience: input.audience,
      tone: input.tone,
      platformTargets: input.platformTargets,
      materializeTimeline: true,
      createdAt: input.createdAt,
    },
    options
  );
}

function projectKindFor(input: StartAgentMotionWorkflowInput): RepoMotionProjectKind {
  if (input.intent === 'feature' || input.intent === 'social' || input.intent === 'demo') {
    return input.intent;
  }

  return 'launch';
}

function isLocalRepoRef(ref: string): boolean {
  const trimmed = ref.trim();
  return (
    trimmed.startsWith('/') ||
    trimmed.startsWith('./') ||
    trimmed.startsWith('../') ||
    trimmed.startsWith('~/') ||
    trimmed.startsWith('file://') ||
    /^[a-zA-Z]:[\\/]/.test(trimmed)
  );
}

function findSource(
  sourceRefs: MotionWorkflowPlanSourceRef[],
  kind: WorkflowSourceKind
): MotionWorkflowPlanSourceRef | undefined {
  return sourceRefs.find((source) => source.kind === kind);
}

function withInputSourceSet(
  project: MotionProject,
  sourceRefs: MotionWorkflowPlanSourceRef[]
): MotionProject {
  if (sourceRefs.length <= 1) return project;

  const inputRefs = sourceRefs.flatMap(workflowSourceToMotionProvenance);
  if (inputRefs.length === 0) return project;

  const sourceProfile = project.sourceProfile
    ? augmentSourceProfile(project.sourceProfile, inputRefs)
    : undefined;

  return {
    ...project,
    sourceRefs: mergeProvenanceRefs(project.sourceRefs, inputRefs),
    ...(sourceProfile ? { sourceProfile } : {}),
    graphNodes: project.graphNodes.map((node) =>
      node.id === 'node-repo-ingest'
        ? {
            ...node,
            inputRefs: uniqueStrings([...node.inputRefs, ...inputRefs.map((ref) => ref.ref)]),
            provenance: mergeProvenanceRefs(node.provenance, inputRefs),
          }
        : node
    ),
  };
}

function workflowSourceToMotionProvenance(
  source: MotionWorkflowPlanSourceRef
): MotionProvenanceRef[] {
  if (
    source.kind === 'repo' ||
    source.kind === 'site' ||
    source.kind === 'capture' ||
    source.kind === 'upload' ||
    source.kind === 'reference'
  ) {
    return [{ kind: source.kind, ref: source.ref, ...(source.label ? { label: source.label } : {}) }];
  }

  if (source.kind === 'pr') {
    return [
      {
        kind: 'code-change',
        ref: source.ref,
        label: source.label ?? 'Pull request',
      },
    ];
  }

  if (source.kind === 'remotion' || source.kind === 'hyperframes') {
    return [
      {
        kind: 'reference',
        ref: source.ref,
        label: source.label ?? `${source.kind} source`,
      },
    ];
  }

  return [];
}

function augmentSourceProfile(
  profile: MotionSourceProfile,
  inputRefs: MotionProvenanceRef[]
): MotionSourceProfile {
  const extraSiteRefs = inputRefs.filter((source) => source.kind === 'site');
  const referenceRefs = inputRefs.filter(
    (source) => source.kind === 'reference' || source.kind === 'upload'
  );

  return {
    ...profile,
    summary: sourceProfileSummaryWithInputSet(profile.summary, inputRefs),
    signals: [
      ...profile.signals,
      {
        id: 'signal-input-set',
        label: 'Input set',
        value: sourceSetValue(inputRefs),
        provenance: inputRefs,
      },
    ],
    captureCandidates: [
      ...profile.captureCandidates,
      ...extraSiteRefs.flatMap((source, index) => [
        {
          id: `capture-selected-site-${slugifyId(source.ref)}-${index}`,
          label: `Capture selected site ${sourceLabel(source)}`,
          mode: 'screenshot' as const,
          targetKind: 'url' as const,
          targetRef: source.ref,
          reason: 'Selected source set includes a live product URL.',
          provenance: [source],
        },
        {
          id: `record-selected-site-${slugifyId(source.ref)}-${index}`,
          label: `Record selected site ${sourceLabel(source)}`,
          mode: 'screen-recording' as const,
          targetKind: 'url' as const,
          targetRef: source.ref,
          reason: 'Selected source set includes a product flow source.',
          provenance: [source],
        },
      ]),
    ],
    storyboardHints: [
      ...profile.storyboardHints,
      ...referenceRefs.map((source, index) => ({
        id: `hint-reference-${slugifyId(source.ref)}-${index}`,
        beatRole: 'hook' as const,
        label: `Reference: ${sourceLabel(source)}`,
        reason: 'Use this selected reference to shape motion grammar and social-video pacing.',
        provenance: [source],
      })),
    ],
    provenance: mergeProvenanceRefs(profile.provenance, inputRefs),
  };
}

function sourceProfileSummaryWithInputSet(
  summary: string,
  inputRefs: MotionProvenanceRef[]
): string {
  const sidecarCount = inputRefs.filter((source) => source.kind !== 'repo').length;
  if (sidecarCount === 0) return summary;
  return `${summary}; ${sidecarCount} selected source ${sidecarCount === 1 ? 'sidecar' : 'sidecars'} attached`;
}

function sourceSetValue(inputRefs: MotionProvenanceRef[]): string {
  return uniqueStrings(inputRefs.map((source) => source.label ?? source.kind)).join(', ');
}

function sourceLabel(source: MotionProvenanceRef): string {
  return source.label ?? source.ref;
}

function mergeProvenanceRefs(
  current: MotionProvenanceRef[],
  incoming: MotionProvenanceRef[]
): MotionProvenanceRef[] {
  const refs = [...current];
  for (const next of incoming) {
    const index = refs.findIndex((ref) => ref.kind === next.kind && ref.ref === next.ref);
    if (index === -1) {
      refs.push(next);
      continue;
    }
    if (next.label && !refs[index].label) {
      refs[index] = { ...refs[index], label: next.label };
    }
  }
  return refs;
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}

function slugifyId(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 32) || 'source'
  );
}

function formatMissingSourceLabel(kinds: WorkflowSourceKind[]): string {
  if (kinds.length === 0) return 'Add source';
  if (kinds.length === 1) return `Add ${kinds[0]}`;

  return `Add ${kinds.slice(0, -1).join(', ')}, or ${kinds[kinds.length - 1]}`;
}
