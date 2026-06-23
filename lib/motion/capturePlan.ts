import type {
  CaptureMode,
  CaptureRequest,
  CaptureTarget,
  CaptureViewport,
} from '@/lib/providers/capture/types';
import type {
  MotionAspectRatio,
  MotionGraphNode,
  MotionProject,
  MotionProvenanceRef,
} from './project';

export type AgentMotionCapturePlanStatus = 'ready' | 'needs-source' | 'not-needed';
export type AgentMotionCapturePreferredPath = 'screenshot-first' | 'recording-first';
export type AgentMotionCaptureActionId =
  | 'capture-browser-stills'
  | 'review-capture-receipts'
  | 'record-interaction-if-needed';

export interface AgentMotionCapturePlanRequest {
  id: string;
  label: string;
  required: boolean;
  request: CaptureRequest;
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
  requests: AgentMotionCapturePlanRequest[];
  fallbacks: AgentMotionCaptureFallback[];
  nextActions: AgentMotionCaptureAction[];
  provenance: MotionProvenanceRef[];
}

export function buildAgentMotionCapturePlan(project: MotionProject): AgentMotionCapturePlan {
  const captureNode = project.graphNodes.find((node) => node.kind === 'capture');
  const siteSource = project.sourceRefs.find((source) => source.kind === 'site');

  if (!captureNode && project.brief.projectKind === 'pr') {
    return emptyCapturePlan(project, 'not-needed');
  }

  if (!siteSource) {
    return {
      ...emptyCapturePlan(project, 'needs-source'),
      captureNodeId: captureNode?.id,
      providerRequirements: ['browser-capture'],
      fallbacks: computerUseFallbacks(),
    };
  }

  const target: CaptureTarget = { kind: 'url', ref: siteSource.ref };
  const aspectRatio = project.brief.platformTargets[0]?.aspectRatio ?? '16:9';
  const viewport = viewportForAspectRatio(aspectRatio);
  const provenance = captureProvenance(captureNode, siteSource);

  return {
    projectId: project.id,
    status: 'ready',
    captureNodeId: captureNode?.id,
    preferredPath: 'screenshot-first',
    target,
    providerRequirements: ['browser-capture'],
    requests: [
      buildRequest({
        id: 'capture-home-still',
        label: 'Capture hero still',
        required: true,
        mode: 'screenshot',
        target,
        aspectRatio,
        viewport,
        expectedArtifacts: ['screenshot', 'cursor targets', 'viewport receipt'],
        provenance,
      }),
      buildRequest({
        id: 'capture-dom-snapshot',
        label: 'Capture DOM snapshot',
        required: true,
        mode: 'dom-snapshot',
        target,
        aspectRatio,
        viewport,
        expectedArtifacts: ['snapshot', 'route metadata', 'viewport receipt'],
        provenance,
      }),
      buildRequest({
        id: 'capture-interaction-trace',
        label: 'Capture interaction trace',
        required: false,
        mode: 'interaction-trace',
        target,
        aspectRatio,
        viewport,
        expectedArtifacts: ['trace', 'cursor targets', 'app-state receipt'],
        provenance,
      }),
      buildRequest({
        id: 'capture-screen-recording',
        label: 'Record product flow',
        required: false,
        mode: 'screen-recording',
        target,
        aspectRatio,
        viewport,
        expectedArtifacts: ['recording', 'cursor targets', 'app-state receipt'],
        provenance,
      }),
    ],
    fallbacks: computerUseFallbacks(),
    nextActions: [
      { id: 'capture-browser-stills', label: 'Capture browser stills' },
      { id: 'review-capture-receipts', label: 'Review capture receipts' },
      { id: 'record-interaction-if-needed', label: 'Record interaction if needed' },
    ],
    provenance,
  };
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
  expectedArtifacts: string[];
  provenance: MotionProvenanceRef[];
}): AgentMotionCapturePlanRequest {
  return {
    id: input.id,
    label: input.label,
    required: input.required,
    request: {
      target: input.target,
      mode: input.mode,
      aspectRatio: input.aspectRatio,
      viewport: input.viewport,
      steps: stepsFor(input.mode, input.target.ref),
    },
    expectedArtifacts: input.expectedArtifacts,
    provenance: input.provenance,
  };
}

function stepsFor(mode: CaptureMode, ref: string): CaptureRequest['steps'] {
  const baseSteps: CaptureRequest['steps'] = [
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
