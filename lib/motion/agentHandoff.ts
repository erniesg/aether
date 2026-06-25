import type { ToolRegistryId } from '@/lib/tool/registry';
import type { WorkflowEngine } from '@/lib/workflow/registry';
import type { AgentMotionCapturePlan } from './capturePlan';
import type { MotionProject, MotionWorkflowMode } from './project';
import type { RoutedAgentMotionWorkflow } from './workflowRouter';

export interface MotionAgentRequestTemplate {
  id: string;
  label: string;
  method: 'POST';
  route: string;
  toolId: ToolRegistryId;
  body: Record<string, unknown>;
  inputPlaceholders: string[];
  expectedReceipts: string[];
}

export interface MotionAgentExecutionHandoff {
  id: string;
  projectId: string;
  workflowId: string;
  mode: MotionWorkflowMode;
  nextTemplateId: string | null;
  sourceLabels: string[];
  templates: MotionAgentRequestTemplate[];
}

const PROJECT_PLACEHOLDER = '$motionProject';

export function buildMotionAgentExecutionHandoff(input: {
  workflow: RoutedAgentMotionWorkflow;
  project: MotionProject;
  capturePlan: AgentMotionCapturePlan | null;
}): MotionAgentExecutionHandoff {
  const templates = buildTemplates(input);

  return {
    id: `handoff-${input.project.id}`,
    projectId: input.project.id,
    workflowId: input.workflow.workflowId,
    mode: input.project.workflowMode,
    nextTemplateId: nextTemplateId(input.project.workflowMode, templates),
    sourceLabels: sourceLabels(input.project),
    templates,
  };
}

function buildTemplates(input: {
  workflow: RoutedAgentMotionWorkflow;
  project: MotionProject;
  capturePlan: AgentMotionCapturePlan | null;
}): MotionAgentRequestTemplate[] {
  const engines = input.workflow.plan.engines;
  const capture = captureTemplateParts(input.project, input.capturePlan);
  const templates: MotionAgentRequestTemplate[] = [];

  if (input.project.workflowMode === 'full-auto') {
    templates.push({
      id: 'full-auto-run',
      label: 'Run saved gates',
      method: 'POST',
      route: '/api/motion/full-auto',
      toolId: 'motion-render',
      body: cleanBody({
        project: PROJECT_PLACEHOLDER,
        requestedEngines: engines,
        ...(capture ? { captureRequestIds: capture.requestIds } : {}),
        ...(capture?.runner ? { captureRunner: capture.runner } : {}),
      }),
      inputPlaceholders: [PROJECT_PLACEHOLDER],
      expectedReceipts: uniqueStrings([
        ...(capture ? ['captures'] : []),
        'source asset picks',
        'generated clips',
        'voice clips',
        'timeline sync',
        'contact sheet',
        'export pack',
      ]),
    });
  }

  if (capture) {
    templates.push({
      id: 'review-capture',
      label: 'Capture product media',
      method: 'POST',
      route: '/api/motion/capture',
      toolId: 'motion-capture',
      body: cleanBody({
        project: PROJECT_PLACEHOLDER,
        requestIds: capture.requestIds,
        ...(capture.runner ? { captureRunner: capture.runner } : {}),
      }),
      inputPlaceholders: [PROJECT_PLACEHOLDER],
      expectedReceipts: capture.expectedReceipts,
    });
  }

  templates.push(
    {
      id: 'generate-visuals',
      label: 'Generate or select visuals',
      method: 'POST',
      route: '/api/motion/image-to-video',
      toolId: 'motion-visuals',
      body: {
        project: PROJECT_PLACEHOLDER,
      },
      inputPlaceholders: [PROJECT_PLACEHOLDER],
      expectedReceipts: ['generated clips', 'image-to-video receipts'],
    },
    {
      id: 'generate-voice',
      label: 'Generate voice and timings',
      method: 'POST',
      route: '/api/motion/voice',
      toolId: 'motion-voice',
      body: {
        project: PROJECT_PLACEHOLDER,
      },
      inputPlaceholders: [PROJECT_PLACEHOLDER],
      expectedReceipts: ['voice clips', 'word timings', 'transcript'],
    },
    {
      id: 'sync-timeline',
      label: 'Sync timeline',
      method: 'POST',
      route: '/api/motion/sync',
      toolId: 'motion-sync',
      body: cleanBody({
        project: PROJECT_PLACEHOLDER,
        requestedEngines: engines,
      }),
      inputPlaceholders: [PROJECT_PLACEHOLDER],
      expectedReceipts: ['beat markers', 'caption links', 'transition cues', 'sound cues'],
    },
    {
      id: 'prepare-preview-source',
      label: 'Prepare preview source',
      method: 'POST',
      route: '/api/motion/preview-source',
      toolId: 'motion-preview-source',
      body: cleanBody({
        project: PROJECT_PLACEHOLDER,
        engine: preferredRenderEngine(engines),
      }),
      inputPlaceholders: [PROJECT_PLACEHOLDER],
      expectedReceipts: ['preview source files', 'runtime mount target', 'edit contract'],
    },
    {
      id: 'edit-source',
      label: 'Apply source edits',
      method: 'POST',
      route: '/api/motion/source-edit',
      toolId: 'motion-source-edit',
      body: {
        project: PROJECT_PLACEHOLDER,
        sourceFiles: '$editedSourceFiles',
      },
      inputPlaceholders: [PROJECT_PLACEHOLDER, '$editedSourceFiles'],
      expectedReceipts: ['updated script', 'updated storyboard', 'updated timeline'],
    },
    {
      id: 'render-proof',
      label: 'Render proof',
      method: 'POST',
      route: '/api/motion/render',
      toolId: 'motion-render',
      body: cleanBody({
        project: PROJECT_PLACEHOLDER,
        engine: preferredRenderEngine(engines),
      }),
      inputPlaceholders: [PROJECT_PLACEHOLDER],
      expectedReceipts: ['contact sheet', 'poster still', 'mp4 probe'],
    },
    {
      id: 'export-pack',
      label: 'Export pack',
      method: 'POST',
      route: '/api/motion/export-pack',
      toolId: 'motion-export-pack',
      body: {
        project: PROJECT_PLACEHOLDER,
      },
      inputPlaceholders: [PROJECT_PLACEHOLDER],
      expectedReceipts: ['export pack', 'canvas drop candidates', 'pack manifest'],
    }
  );

  return templates;
}

function captureTemplateParts(
  project: MotionProject,
  capturePlan: AgentMotionCapturePlan | null
):
  | {
      requestIds: string[];
      runner?: {
        kind: 'playwright-local';
        outputDir: string;
        launchLocalApp: boolean;
        headless: boolean;
      };
      expectedReceipts: string[];
    }
  | null {
  if (!capturePlan || capturePlan.status !== 'ready') return null;

  const requests = capturePlan.requests.filter((request) => request.required);
  if (requests.length === 0) return null;

  const needsLocalAppLaunch = requests.some((request) => request.request.appLaunch);
  const canUseBrowserRunner = capturePlan.providerRequirements.includes('browser-capture');
  const runner = canUseBrowserRunner
    ? {
        kind: 'playwright-local' as const,
        outputDir: `outputs/motion-captures/${project.id}`,
        launchLocalApp: needsLocalAppLaunch,
        headless: true,
      }
    : undefined;

  return {
    requestIds: requests.map((request) => request.id),
    ...(runner ? { runner } : {}),
    expectedReceipts: uniqueStrings(requests.flatMap((request) => request.expectedArtifacts)),
  };
}

function nextTemplateId(
  mode: MotionWorkflowMode,
  templates: MotionAgentRequestTemplate[]
): string | null {
  if (mode === 'full-auto' && templates.some((template) => template.id === 'full-auto-run')) {
    return 'full-auto-run';
  }

  return templates[0]?.id ?? null;
}

function sourceLabels(project: MotionProject): string[] {
  return project.sourceRefs.map((source) => source.label ?? source.ref);
}

function preferredRenderEngine(engines: WorkflowEngine[]): 'remotion' | 'hyperframes' {
  const engine = engines.find(
    (candidate): candidate is 'remotion' | 'hyperframes' =>
      candidate === 'remotion' || candidate === 'hyperframes'
  );
  return engine ?? 'remotion';
}

function cleanBody(body: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(body).filter(([, value]) => value !== undefined));
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values));
}
