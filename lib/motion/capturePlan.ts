import type {
  CaptureArtifactKind,
  CaptureMode,
  CaptureAppLaunch,
  CaptureRequest,
  CaptureTarget,
  CaptureViewport,
} from '@/lib/providers/capture/types';
import type {
  MotionAspectRatio,
  MotionGraphNode,
  MotionProject,
  MotionProvenanceRef,
  MotionSourceCaptureCandidate,
} from './project';

export type AgentMotionCapturePlanStatus = 'ready' | 'needs-source' | 'not-needed';
export type AgentMotionCapturePreferredPath = 'screenshot-first' | 'recording-first';
export type AgentMotionCaptureToolId =
  | 'browser-capture'
  | 'app-launch'
  | 'screen-recording'
  | 'computer-use';
export type AgentMotionCaptureActionId =
  | 'capture-browser-stills'
  | 'review-capture-receipts'
  | 'record-interaction-if-needed';

export interface AgentMotionCaptureInstruction {
  id: string;
  toolId: AgentMotionCaptureToolId;
  label: string;
  detail: string;
  cwd?: string;
  expectedArtifactKinds?: CaptureArtifactKind[];
}

export interface AgentMotionCaptureOutputContract {
  applyRoute: '/api/motion/capture';
  artifactKinds: CaptureArtifactKind[];
  receiptFields: string[];
}

export interface AgentMotionCaptureRunbook {
  primaryToolId: AgentMotionCaptureToolId;
  fallbackToolIds: AgentMotionCaptureToolId[];
  applyRoute: '/api/motion/capture';
  setupCommands: CaptureAppLaunch[];
  instructions: string[];
  reviewArtifactLabels: string[];
}

export interface AgentMotionCapturePlanRequest {
  id: string;
  label: string;
  required: boolean;
  request: CaptureRequest;
  agentInstructions: AgentMotionCaptureInstruction[];
  outputContract: AgentMotionCaptureOutputContract;
  expectedArtifacts: string[];
  provenance: MotionProvenanceRef[];
}

export interface AgentMotionCaptureFallback {
  id: string;
  label: string;
  reason: string;
}

export interface AgentMotionCaptureAction {
  id: AgentMotionCaptureActionId;
  label: string;
}

export interface AgentMotionCapturePlan {
  projectId: string;
  status: AgentMotionCapturePlanStatus;
  captureNodeId?: string;
  preferredPath?: AgentMotionCapturePreferredPath;
  target?: CaptureTarget;
  providerRequirements: string[];
  agentRunbook?: AgentMotionCaptureRunbook;
  requests: AgentMotionCapturePlanRequest[];
  fallbacks: AgentMotionCaptureFallback[];
  nextActions: AgentMotionCaptureAction[];
  provenance: MotionProvenanceRef[];
}

export function buildAgentMotionCapturePlan(project: MotionProject): AgentMotionCapturePlan {
  const captureNode = project.graphNodes.find((node) => node.kind === 'capture');
  const siteSource = project.sourceRefs.find((source) => source.kind === 'site');
  const sourceCandidates = project.sourceProfile?.captureCandidates ?? [];
  const readySourceCandidates = sourceCandidates.filter(hasCaptureTarget);

  if (!captureNode && project.brief.projectKind === 'pr') {
    return emptyCapturePlan(project, 'not-needed');
  }

  if (!siteSource && readySourceCandidates.length === 0) {
    return {
      ...emptyCapturePlan(project, 'needs-source'),
      captureNodeId: captureNode?.id,
      providerRequirements: ['browser-capture'],
      fallbacks: computerUseFallbacks(),
    };
  }

  const firstCandidate = readySourceCandidates[0];
  const target: CaptureTarget = siteSource
    ? { kind: 'url', ref: siteSource.ref }
    : { kind: firstCandidate.targetKind, ref: firstCandidate.targetRef };
  const aspectRatio = project.brief.platformTargets[0]?.aspectRatio ?? '16:9';
  const viewport = viewportForAspectRatio(aspectRatio);
  const provenance = siteSource
    ? captureProvenance(captureNode, siteSource)
    : captureProvenance(captureNode, captureCandidateSource(firstCandidate, project));
  const requests = siteSource
    ? defaultSiteRequests({ target, aspectRatio, viewport, provenance })
    : readySourceCandidates.map((candidate) =>
        buildRequest({
          id: candidate.id,
          label: candidate.label,
          required: candidate.mode !== 'screen-recording',
          mode: candidate.mode,
          target: { kind: candidate.targetKind, ref: candidate.targetRef },
          aspectRatio,
          viewport,
          setup: candidate.setup,
          setupCwd: candidate.setupCwd,
          expectedArtifacts: expectedArtifactsFor(candidate.mode),
          provenance: candidate.provenance,
        })
      );

  return {
    projectId: project.id,
    status: 'ready',
    captureNodeId: captureNode?.id,
    preferredPath: 'screenshot-first',
    target,
    providerRequirements: siteSource
      ? ['browser-capture']
      : providerRequirementsFor(target, requests),
    agentRunbook: buildCaptureRunbook(requests),
    requests,
    fallbacks: computerUseFallbacks(),
    nextActions: [
      { id: 'capture-browser-stills', label: 'Capture browser stills' },
      { id: 'review-capture-receipts', label: 'Review capture receipts' },
      { id: 'record-interaction-if-needed', label: 'Record interaction if needed' },
    ],
    provenance,
  };
}

function defaultSiteRequests(input: {
  target: CaptureTarget;
  aspectRatio: MotionAspectRatio;
  viewport: CaptureViewport;
  provenance: MotionProvenanceRef[];
}): AgentMotionCapturePlanRequest[] {
  return [
    buildRequest({
      id: 'capture-home-still',
      label: 'Capture hero still',
      required: true,
      mode: 'screenshot',
      target: input.target,
      aspectRatio: input.aspectRatio,
      viewport: input.viewport,
      expectedArtifacts: ['screenshot', 'cursor targets', 'viewport receipt'],
      provenance: input.provenance,
    }),
    buildRequest({
      id: 'capture-dom-snapshot',
      label: 'Capture DOM snapshot',
      required: true,
      mode: 'dom-snapshot',
      target: input.target,
      aspectRatio: input.aspectRatio,
      viewport: input.viewport,
      expectedArtifacts: ['snapshot', 'route metadata', 'viewport receipt'],
      provenance: input.provenance,
    }),
    buildRequest({
      id: 'capture-interaction-trace',
      label: 'Capture interaction trace',
      required: false,
      mode: 'interaction-trace',
      target: input.target,
      aspectRatio: input.aspectRatio,
      viewport: input.viewport,
      expectedArtifacts: ['trace', 'cursor targets', 'app-state receipt'],
      provenance: input.provenance,
    }),
    buildRequest({
      id: 'capture-screen-recording',
      label: 'Record product flow',
      required: false,
      mode: 'screen-recording',
      target: input.target,
      aspectRatio: input.aspectRatio,
      viewport: input.viewport,
      expectedArtifacts: ['recording', 'cursor targets', 'app-state receipt'],
      provenance: input.provenance,
    }),
  ];
}

function emptyCapturePlan(
  project: MotionProject,
  status: AgentMotionCapturePlanStatus
): AgentMotionCapturePlan {
  return {
    projectId: project.id,
    status,
    providerRequirements: [],
    requests: [],
    fallbacks: [],
    nextActions: [],
    provenance: [],
  };
}

function buildRequest(input: {
  id: string;
  label: string;
  required: boolean;
  mode: CaptureMode;
  target: CaptureTarget;
  aspectRatio: MotionAspectRatio;
  viewport: CaptureViewport;
  setup?: string;
  setupCwd?: string;
  expectedArtifacts: string[];
  provenance: MotionProvenanceRef[];
}): AgentMotionCapturePlanRequest {
  const appLaunch = appLaunchFor(input.target, input.setup, input.setupCwd);
  const request: CaptureRequest = {
    target: input.target,
    mode: input.mode,
    aspectRatio: input.aspectRatio,
    viewport: input.viewport,
    steps: stepsFor(input.mode, input.target.ref, input.setup),
    ...(appLaunch ? { appLaunch } : {}),
  };

  return {
    id: input.id,
    label: input.label,
    required: input.required,
    request,
    agentInstructions: agentInstructionsFor(request),
    outputContract: outputContractFor(input.mode),
    expectedArtifacts: input.expectedArtifacts,
    provenance: input.provenance,
  };
}

function buildCaptureRunbook(
  requests: AgentMotionCapturePlanRequest[]
): AgentMotionCaptureRunbook {
  return {
    primaryToolId: 'browser-capture',
    fallbackToolIds: ['computer-use'],
    applyRoute: '/api/motion/capture',
    setupCommands: uniqueAppLaunches(
      requests.flatMap((request) =>
        request.request.appLaunch ? [request.request.appLaunch] : []
      )
    ),
    instructions: [
      'Open each target in browser capture before using generated or stock visuals.',
      'Use computer-use capture when auth, native UI, simulator, or gesture state blocks browser capture.',
    ],
    reviewArtifactLabels: ['capture receipt', 'cursor targets', 'viewport receipt'],
  };
}

function agentInstructionsFor(request: CaptureRequest): AgentMotionCaptureInstruction[] {
  return [
    ...(request.appLaunch
      ? [
          {
            id: 'launch-local-app',
            toolId: 'app-launch' as const,
            label: 'Run local app',
            detail: request.appLaunch.command,
            ...(request.appLaunch.cwd ? { cwd: request.appLaunch.cwd } : {}),
          },
        ]
      : []),
    {
      id: 'open-target',
      toolId: 'browser-capture',
      label: 'Open target',
      detail: request.target.ref,
    },
    modeInstruction(request.mode),
  ];
}

function modeInstruction(mode: CaptureMode): AgentMotionCaptureInstruction {
  const artifactKinds = artifactKindsForMode(mode);

  if (mode === 'screen-recording') {
    return {
      id: 'record-screen',
      toolId: 'screen-recording',
      label: 'Record screen',
      detail: 'Record the product flow with cursor targets and app-state receipt.',
      expectedArtifactKinds: artifactKinds,
    };
  }

  if (mode === 'dom-snapshot') {
    return {
      id: 'capture-dom-snapshot',
      toolId: 'browser-capture',
      label: 'Capture DOM snapshot',
      detail: 'Save DOM structure, route metadata, and viewport receipt.',
      expectedArtifactKinds: artifactKinds,
    };
  }

  if (mode === 'interaction-trace') {
    return {
      id: 'capture-interaction-trace',
      toolId: 'browser-capture',
      label: 'Capture interaction trace',
      detail: 'Mark interactions, cursor targets, and app-state receipt.',
      expectedArtifactKinds: artifactKinds,
    };
  }

  return {
    id: 'capture-screenshot',
    toolId: 'browser-capture',
    label: 'Capture screenshot',
    detail: 'Save screenshot, cursor targets, and viewport receipt.',
    expectedArtifactKinds: artifactKinds,
  };
}

function outputContractFor(mode: CaptureMode): AgentMotionCaptureOutputContract {
  return {
    applyRoute: '/api/motion/capture',
    artifactKinds: artifactKindsForMode(mode),
    receiptFields: ['assetUrl', 'viewport', 'cursorTargets', 'provenance'],
  };
}

function artifactKindsForMode(mode: CaptureMode): CaptureArtifactKind[] {
  if (mode === 'screen-recording') return ['recording'];
  if (mode === 'dom-snapshot') return ['snapshot'];
  if (mode === 'interaction-trace') return ['trace'];
  return ['screenshot'];
}

function stepsFor(mode: CaptureMode, ref: string, setup?: string): CaptureRequest['steps'] {
  const baseSteps: CaptureRequest['steps'] = [
    ...(setup
      ? [{ id: 'start-source', label: 'Start app', action: 'manual' as const, value: setup }]
      : []),
    { id: 'goto-source', label: 'Open source', action: 'goto', value: ref },
    { id: 'settle-source', label: 'Wait for app state', action: 'wait', value: 'network-idle' },
  ];

  if (mode === 'interaction-trace') {
    return [
      ...baseSteps,
      { id: 'mark-interactions', label: 'Mark interactions to show', action: 'manual' },
    ];
  }

  if (mode === 'screen-recording') {
    return [...baseSteps, { id: 'record-flow', label: 'Record product flow', action: 'record' }];
  }

  return baseSteps;
}

function hasCaptureTarget(
  candidate: MotionSourceCaptureCandidate
): candidate is MotionSourceCaptureCandidate & { targetRef: string } {
  return Boolean(candidate.targetRef);
}

function captureCandidateSource(
  candidate: MotionSourceCaptureCandidate,
  project: MotionProject
): MotionProvenanceRef {
  return (
    candidate.provenance[0] ??
    project.sourceRefs[0] ?? { kind: 'manual', ref: `${project.id}:capture-source` }
  );
}

function expectedArtifactsFor(mode: CaptureMode): string[] {
  if (mode === 'screen-recording') return ['recording', 'cursor targets', 'app-state receipt'];
  if (mode === 'dom-snapshot') return ['snapshot', 'route metadata', 'viewport receipt'];
  if (mode === 'interaction-trace') return ['trace', 'cursor targets', 'app-state receipt'];
  return ['screenshot', 'cursor targets', 'viewport receipt'];
}

function providerRequirementsFor(
  target: CaptureTarget,
  requests: AgentMotionCapturePlanRequest[]
): string[] {
  const requirements = ['browser-capture'];
  if (target.kind === 'local-app') requirements.push('app-launch');
  if (requests.some((request) => request.request.mode === 'screen-recording')) {
    requirements.push('screen-recording');
  }
  return requirements;
}

function appLaunchFor(
  target: CaptureTarget,
  setup: string | undefined,
  cwd: string | undefined
): CaptureAppLaunch | null {
  if (target.kind !== 'local-app' || !setup) return null;

  return {
    command: setup,
    ...(cwd ? { cwd } : {}),
    targetUrl: target.ref,
    readiness: {
      kind: 'http',
      url: target.ref,
      timeoutMs: 60000,
    },
  };
}

function uniqueAppLaunches(launches: CaptureAppLaunch[]): CaptureAppLaunch[] {
  const seen = new Set<string>();
  return launches.filter((launch) => {
    const key = `${launch.command}:${launch.cwd ?? ''}:${launch.targetUrl}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function viewportForAspectRatio(aspectRatio: MotionAspectRatio): CaptureViewport {
  if (aspectRatio === '9:16') {
    return { width: 1080, height: 1920, deviceScaleFactor: 2 };
  }
  if (aspectRatio === '1:1') {
    return { width: 1080, height: 1080, deviceScaleFactor: 2 };
  }
  if (aspectRatio === '4:5') {
    return { width: 1080, height: 1350, deviceScaleFactor: 2 };
  }

  return { width: 1920, height: 1080, deviceScaleFactor: 2 };
}

function captureProvenance(
  captureNode: MotionGraphNode | undefined,
  source: MotionProvenanceRef
): MotionProvenanceRef[] {
  return captureNode?.provenance.length ? captureNode.provenance : [source];
}

function computerUseFallbacks(): AgentMotionCaptureFallback[] {
  return [
    {
      id: 'computer-use-capture',
      label: 'Use computer control when browser capture cannot reach the app state',
      reason: 'Needed for authenticated, native, simulator, or gesture-heavy flows.',
    },
  ];
}
