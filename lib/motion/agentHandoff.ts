import type { ToolRegistryId } from '@/lib/tool/registry';
import type { WorkflowEngine, WorkflowRegistryId } from '@/lib/workflow/registry';
import type { AgentMotionCapturePlan, AgentMotionCapturePlanRequest } from './capturePlan';
import { getMotionComponent, type MotionRegenerateScope } from './componentRegistry';
import type { MotionProject, MotionWorkflowMode } from './project';
import {
  listRankedMotionReferenceCorpusForWorkflow,
  type MotionReferenceCorpusEntry,
} from './referenceCorpus';
import { buildMotionReviewPlan } from './reviewPlan';
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

export interface MaterializeMotionAgentRequestTemplateInput {
  project: MotionProject;
  imageToVideoProviderId?: string;
  voiceProviderId?: string;
  renderProviderId?: string;
  computerUseCaptureRunner?: unknown;
  editedSourceFiles?: unknown;
}

export interface MaterializedMotionAgentRequestTemplate {
  templateId: string;
  label: string;
  method: 'POST';
  route: string;
  toolId: ToolRegistryId;
  body: Record<string, unknown>;
  missingPlaceholders: string[];
}

const PROJECT_PLACEHOLDER = '$motionProject';
const OMIT_OPTIONAL_PLACEHOLDER = Symbol('omit optional placeholder');

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

export function materializeMotionAgentRequestTemplate(
  template: MotionAgentRequestTemplate,
  input: MaterializeMotionAgentRequestTemplateInput
): MaterializedMotionAgentRequestTemplate {
  const placeholders: Record<string, unknown> = {
    [PROJECT_PLACEHOLDER]: input.project,
    $imageToVideoProviderId: input.imageToVideoProviderId,
    $voiceProviderId: input.voiceProviderId,
    $renderProviderId: input.renderProviderId,
    $computerUseCaptureRunner: input.computerUseCaptureRunner,
    $editedSourceFiles: input.editedSourceFiles,
  };
  const missing = new Set<string>();

  return {
    templateId: template.id,
    label: template.label,
    method: template.method,
    route: template.route,
    toolId: template.toolId,
    body: materializeBody(template.body, placeholders, missing),
    missingPlaceholders: Array.from(missing),
  };
}

function buildTemplates(input: {
  workflow: RoutedAgentMotionWorkflow;
  project: MotionProject;
  capturePlan: AgentMotionCapturePlan | null;
}): MotionAgentRequestTemplate[] {
  const engines = input.workflow.plan.engines;
  const capture = captureTemplateParts(input.project, input.capturePlan);
  const recording = recordingCaptureTemplateParts(input.project, input.capturePlan);
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
        imageToVideoProviderId: '$imageToVideoProviderId?',
        voiceProviderId: '$voiceProviderId?',
        renderProviderId: '$renderProviderId?',
        renderEngine: preferredRenderEngine(engines),
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
    if (capture) {
      templates.push({
        id: 'full-auto-computer-use-run',
        label: 'Run saved gates with computer-use capture',
        method: 'POST',
        route: '/api/motion/full-auto',
        toolId: 'motion-render',
        body: cleanBody({
          project: PROJECT_PLACEHOLDER,
          requestedEngines: engines,
          captureRequestIds: capture.requestIds,
          captureRunner: '$computerUseCaptureRunner',
          imageToVideoProviderId: '$imageToVideoProviderId?',
          voiceProviderId: '$voiceProviderId?',
          renderProviderId: '$renderProviderId?',
          renderEngine: preferredRenderEngine(engines),
        }),
        inputPlaceholders: [PROJECT_PLACEHOLDER, '$computerUseCaptureRunner'],
        expectedReceipts: uniqueStrings([
          'captures',
          'approval receipt',
          'redaction receipt',
          'source asset picks',
          'generated clips',
          'voice clips',
          'timeline sync',
          'contact sheet',
          'export pack',
        ]),
      });
    }
    templates.push(...setupDryRunTemplates({ engines, capture }));
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
    templates.push({
      id: 'review-computer-use-capture',
      label: 'Apply computer-use capture',
      method: 'POST',
      route: '/api/motion/capture',
      toolId: 'motion-capture',
      body: cleanBody({
        project: PROJECT_PLACEHOLDER,
        requestIds: capture.requestIds,
        captureRunner: '$computerUseCaptureRunner',
      }),
      inputPlaceholders: [PROJECT_PLACEHOLDER, '$computerUseCaptureRunner'],
      expectedReceipts: uniqueStrings([
        ...capture.expectedReceipts,
        'approval receipt',
        'redaction receipt',
      ]),
    });
  }

  if (recording) {
    templates.push({
      id: 'record-product-flow',
      label: 'Record product flow',
      method: 'POST',
      route: '/api/motion/capture',
      toolId: 'motion-capture',
      body: cleanBody({
        project: PROJECT_PLACEHOLDER,
        requestIds: recording.requestIds,
        ...(recording.runner ? { captureRunner: recording.runner } : {}),
      }),
      inputPlaceholders: [PROJECT_PLACEHOLDER],
      expectedReceipts: recording.expectedReceipts,
    });
  }

  templates.push(
    ...componentRegenerationTemplates(input.project, engines),
    ...referenceSignalRegenerationTemplates(input.workflow.workflowId, engines),
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
        files: '$editedSourceFiles',
      },
      inputPlaceholders: [PROJECT_PLACEHOLDER, '$editedSourceFiles'],
      expectedReceipts: [
        'updated script',
        'updated storyboard',
        'updated timeline',
        'sync effect edits',
      ],
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

function componentRegenerationTemplates(
  project: MotionProject,
  engines: WorkflowEngine[]
): MotionAgentRequestTemplate[] {
  const reviewPlan = buildMotionReviewPlan(project);

  return reviewPlan.componentSlots.flatMap((slot) =>
    slot.regenerateScopes.map((scope) => {
      const label = `Regenerate ${scope} for ${slot.componentLabel}`;
      return {
        id: `regenerate-component-${slot.clipId}-${scope}`,
        label,
        method: 'POST' as const,
        route: '/api/motion/regenerate',
        toolId: regenerationToolIdForScope(scope),
        body: cleanBody({
          project: PROJECT_PLACEHOLDER,
          clipId: slot.clipId,
          scope,
          prompt: label,
          requestedEngines: engines,
        }),
        inputPlaceholders: [PROJECT_PLACEHOLDER],
        expectedReceipts: regenerationReceiptLabelsForScope(scope),
      };
    })
  );
}

function referenceSignalRegenerationTemplates(
  workflowId: WorkflowRegistryId,
  engines: WorkflowEngine[]
): MotionAgentRequestTemplate[] {
  return listRankedMotionReferenceCorpusForWorkflow(workflowId).flatMap((entry) =>
    referenceSignalTemplatesForEntry(entry, engines)
  );
}

function referenceSignalTemplatesForEntry(
  entry: MotionReferenceCorpusEntry,
  engines: WorkflowEngine[]
): MotionAgentRequestTemplate[] {
  const componentIds = entry.componentIds.slice(0, 4);
  const focusedComponentIds = componentIds.slice(0, 2);
  if (focusedComponentIds.length === 0) return [];

  const focusedComponentLabels = focusedComponentIds.map(componentLabelFor);
  const templates = [
    referenceSignalTemplate(entry, {
      scope: 'effect',
      componentIds: focusedComponentIds,
      componentLabels: focusedComponentLabels,
      label: `Apply reference style to ${focusedComponentLabels.join(' / ')}`,
      engines,
    }),
  ];

  if (entry.tags.some((tag) => tag === 'capture' || tag === 'cursor' || tag === 'zoom')) {
    templates.push(
      referenceSignalTemplate(entry, {
        scope: 'capture',
        componentIds: focusedComponentIds,
        componentLabels: focusedComponentLabels,
        label: `Regenerate capture from ${readableLabel(entry.observedFormat)}`,
        engines,
      })
    );
  }

  return templates;
}

function referenceSignalTemplate(
  entry: MotionReferenceCorpusEntry,
  options: {
    scope: MotionRegenerateScope;
    componentIds: string[];
    componentLabels: string[];
    label: string;
    engines: WorkflowEngine[];
  }
): MotionAgentRequestTemplate {
  return {
    id: `reference-signal-${entry.id}-${options.scope}`,
    label: options.label,
    method: 'POST',
    route: '/api/motion/regenerate',
    toolId: regenerationToolIdForScope(options.scope),
    body: cleanBody({
      project: PROJECT_PLACEHOLDER,
      referenceSignalId: entry.id,
      sourceUrl: entry.sourceUrl,
      scope: options.scope,
      componentIds: [...options.componentIds],
      prompt: `${options.label}. Use ${entry.title} as the source-backed reference signal.`,
      requestedEngines: options.engines,
    }),
    inputPlaceholders: [PROJECT_PLACEHOLDER],
    expectedReceipts: referenceSignalReceiptLabels(options.scope),
  };
}

function regenerationToolIdForScope(scope: MotionRegenerateScope): ToolRegistryId {
  switch (scope) {
    case 'capture':
      return 'motion-capture';
    case 'asset':
    case 'proof':
    case 'code':
    case 'diagram':
      return 'motion-visuals';
    case 'caption':
      return 'motion-voice';
    case 'timing':
    case 'effect':
      return 'motion-revise';
    case 'copy':
    case 'cta':
      return 'motion-storyboard';
  }
}

function referenceSignalReceiptLabels(scope: MotionRegenerateScope): string[] {
  if (scope === 'capture') {
    return ['reference signal', 'capture plan', 'updated preview plan'];
  }
  if (scope === 'caption') {
    return ['reference signal', 'voice and caption update', 'updated preview plan'];
  }
  if (scope === 'effect' || scope === 'timing') {
    return ['reference signal', 'component style update', 'updated preview plan'];
  }
  return ['reference signal', 'component plan', 'updated preview plan'];
}

function regenerationReceiptLabelsForScope(scope: MotionRegenerateScope): string[] {
  switch (scope) {
    case 'capture':
      return ['regeneration request', 'capture plan', 'updated preview plan'];
    case 'asset':
    case 'proof':
    case 'code':
    case 'diagram':
      return ['regeneration request', 'visual source plan', 'updated preview plan'];
    case 'caption':
      return ['regeneration request', 'voice and caption update', 'updated preview plan'];
    case 'timing':
      return ['regeneration request', 'timing update', 'updated preview plan'];
    case 'effect':
      return ['regeneration request', 'effect update', 'updated preview plan'];
    case 'copy':
    case 'cta':
      return ['regeneration request', 'script update', 'updated preview plan'];
  }
}

function setupDryRunTemplates(input: {
  engines: WorkflowEngine[];
  capture: ReturnType<typeof captureTemplateParts>;
}): MotionAgentRequestTemplate[] {
  const baseBody = {
    project: PROJECT_PLACEHOLDER,
    requestedEngines: input.engines,
  };
  const templates: MotionAgentRequestTemplate[] = [];

  if (input.capture?.runner?.launchLocalApp) {
    templates.push({
      id: 'setup-local-app',
      label: 'Dry-run local app runner',
      method: 'POST',
      route: '/api/motion/full-auto',
      toolId: 'motion-capture',
      body: cleanBody({
        ...baseBody,
        setupDryRun: { setupId: 'local-app' },
        captureRunner: input.capture.runner,
      }),
      inputPlaceholders: [PROJECT_PLACEHOLDER],
      expectedReceipts: ['HTTP readiness receipt', 'process cleanup receipt'],
    });
  }

  if (input.capture) {
    templates.push({
      id: 'setup-computer-use',
      label: 'Approve computer-use capture',
      method: 'POST',
      route: '/api/motion/full-auto',
      toolId: 'motion-capture',
      body: cleanBody({
        ...baseBody,
        setupDryRun: { setupId: 'computer-use' },
        captureRunner: '$computerUseCaptureRunner',
      }),
      inputPlaceholders: [PROJECT_PLACEHOLDER, '$computerUseCaptureRunner'],
      expectedReceipts: ['approval receipt', 'redaction receipt', 'safe-scope receipt'],
    });
  }

  templates.push(
    {
      id: 'setup-visual-source',
      label: 'Dry-run visual source selection',
      method: 'POST',
      route: '/api/motion/full-auto',
      toolId: 'motion-visuals',
      body: cleanBody({
        ...baseBody,
        setupDryRun: { setupId: 'visual-source' },
      }),
      inputPlaceholders: [PROJECT_PLACEHOLDER],
      expectedReceipts: ['source asset receipt', 'prompt receipt'],
    },
    {
      id: 'setup-visual-generation',
      label: 'Dry-run image-to-video provider',
      method: 'POST',
      route: '/api/motion/full-auto',
      toolId: 'motion-visuals',
      body: cleanBody({
        ...baseBody,
        setupDryRun: { setupId: 'visual-generation' },
        imageToVideoProviderId: '$imageToVideoProviderId?',
      }),
      inputPlaceholders: [PROJECT_PLACEHOLDER],
      expectedReceipts: ['generated clip receipt', 'timeline update receipt'],
    },
    {
      id: 'setup-voice',
      label: 'Dry-run voice provider',
      method: 'POST',
      route: '/api/motion/full-auto',
      toolId: 'motion-voice',
      body: cleanBody({
        ...baseBody,
        setupDryRun: { setupId: 'voice' },
        voiceProviderId: '$voiceProviderId?',
      }),
      inputPlaceholders: [PROJECT_PLACEHOLDER],
      expectedReceipts: ['audio receipt', 'word timing receipt', 'transcript receipt'],
    },
    {
      id: 'setup-render',
      label: 'Dry-run render runner',
      method: 'POST',
      route: '/api/motion/full-auto',
      toolId: 'motion-render',
      body: cleanBody({
        ...baseBody,
        setupDryRun: { setupId: 'render' },
        renderEngine: preferredRenderEngine(input.engines),
        renderProviderId: '$renderProviderId?',
      }),
      inputPlaceholders: [PROJECT_PLACEHOLDER],
      expectedReceipts: ['source lint', 'contact sheet', 'mp4 probe'],
    }
  );

  return templates;
}

type CaptureTemplateParts = {
  requestIds: string[];
  runner?: {
    kind: 'playwright-local';
    outputDir: string;
    launchLocalApp: boolean;
    headless: boolean;
  };
  expectedReceipts: string[];
};

function captureTemplateParts(
  project: MotionProject,
  capturePlan: AgentMotionCapturePlan | null
): CaptureTemplateParts | null {
  return captureTemplatePartsForRequests(project, capturePlan, (request) => request.required);
}

function recordingCaptureTemplateParts(
  project: MotionProject,
  capturePlan: AgentMotionCapturePlan | null
): CaptureTemplateParts | null {
  return captureTemplatePartsForRequests(
    project,
    capturePlan,
    (request) => request.request.mode === 'screen-recording'
  );
}

function captureTemplatePartsForRequests(
  project: MotionProject,
  capturePlan: AgentMotionCapturePlan | null,
  selectRequest: (request: AgentMotionCapturePlanRequest) => boolean
): CaptureTemplateParts | null {
  if (!capturePlan || capturePlan.status !== 'ready') return null;

  const requests = capturePlan.requests.filter(selectRequest);
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

function componentLabelFor(componentId: string): string {
  return getMotionComponent(componentId)?.label ?? readableLabel(componentId);
}

function readableLabel(value: string): string {
  return value.replace(/[-_]/g, ' ');
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

function materializeBody(
  body: Record<string, unknown>,
  placeholders: Record<string, unknown>,
  missing: Set<string>
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(body)
      .map(([key, value]) => [key, materializeValue(value, placeholders, missing)] as const)
      .filter(([, value]) => value !== OMIT_OPTIONAL_PLACEHOLDER)
  );
}

function materializeValue(
  value: unknown,
  placeholders: Record<string, unknown>,
  missing: Set<string>
): unknown {
  if (typeof value === 'string' && value.startsWith('$')) {
    const optional = value.endsWith('?');
    const placeholder = optional ? value.slice(0, -1) : value;
    if (Object.prototype.hasOwnProperty.call(placeholders, placeholder)) {
      const replacement = placeholders[placeholder];
      if (replacement !== undefined) return replacement;
    }
    if (optional) return OMIT_OPTIONAL_PLACEHOLDER;
    missing.add(placeholder);
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => materializeValue(item, placeholders, missing));
  }

  if (isPlainRecord(value)) {
    return materializeBody(value, placeholders, missing);
  }

  return value;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values));
}
