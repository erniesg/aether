import type {
  CaptureArtifact,
  CaptureArtifactKind,
  CaptureCursorTarget,
  CaptureMode,
  CaptureProvider,
  CaptureRequest,
} from './types';
import type { MotionProvenanceRef } from '@/lib/motion/project';

export interface BrowserCaptureRunnerArtifact {
  assetUrl: string;
  width?: number;
  height?: number;
  durationMs?: number;
  mimeType?: string;
  cursorTargets?: CaptureCursorTarget[];
  provenance?: MotionProvenanceRef[];
}

export interface BrowserCaptureRunner {
  available(): boolean;
  capture(request: CaptureRequest): Promise<BrowserCaptureRunnerArtifact[]>;
}

export interface CreateBrowserCaptureProviderOptions {
  runner?: BrowserCaptureRunner;
}

const PROVIDER_ID = 'browser-capture';
const PROVIDER_PROVENANCE = { kind: 'provider', ref: PROVIDER_ID } satisfies MotionProvenanceRef;

export function createBrowserCaptureProvider(
  options: CreateBrowserCaptureProviderOptions = {}
): CaptureProvider {
  const runner = options.runner;

  return {
    id: PROVIDER_ID,
    displayName: 'Browser capture',
    available: () => runner?.available() ?? false,
    async capture(request) {
      if (!runner?.available()) {
        throw new Error('Browser capture requires a runner');
      }

      const runnerArtifacts = await runner.capture(request);
      const provenance = baseProvenance(request);

      return {
        providerId: PROVIDER_ID,
        artifacts: runnerArtifacts.map((artifact, index) =>
          normalizeArtifact({ artifact, index, request, provenance })
        ),
        provenance,
      };
    },
  };
}

function normalizeArtifact(input: {
  artifact: BrowserCaptureRunnerArtifact;
  index: number;
  request: CaptureRequest;
  provenance: MotionProvenanceRef[];
}): CaptureArtifact {
  const kind = artifactKindForMode(input.request.mode);
  const provenance = uniqueProvenance([
    ...input.provenance,
    ...(input.artifact.provenance ?? []),
  ]);

  return {
    id: artifactId(input.request, input.index),
    kind,
    target: input.request.target,
    assetUrl: input.artifact.assetUrl,
    width: input.artifact.width ?? input.request.viewport.width,
    height: input.artifact.height ?? input.request.viewport.height,
    ...(input.artifact.durationMs === undefined ? {} : { durationMs: input.artifact.durationMs }),
    mimeType: input.artifact.mimeType ?? mimeTypeForKind(kind),
    viewport: input.request.viewport,
    ...(input.request.appLaunch ? { appLaunch: input.request.appLaunch } : {}),
    cursorTargets: input.artifact.cursorTargets ?? cursorTargetsFromSteps(input.request),
    provenance,
  };
}

function artifactKindForMode(mode: CaptureMode): CaptureArtifactKind {
  if (mode === 'screenshot') return 'screenshot';
  if (mode === 'screen-recording') return 'recording';
  if (mode === 'dom-snapshot') return 'snapshot';
  return 'trace';
}

function mimeTypeForKind(kind: CaptureArtifactKind): string {
  if (kind === 'screenshot') return 'image/png';
  if (kind === 'recording') return 'video/mp4';
  return 'application/json';
}

function artifactId(request: CaptureRequest, index: number): string {
  const base = `capture-${request.mode}-${slugFromRef(request.target.ref)}`;
  return index === 0 ? base : `${base}-${index + 1}`;
}

function slugFromRef(ref: string): string {
  return ref
    .replace(/^https?:\/\//i, '')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 80);
}

function cursorTargetsFromSteps(request: CaptureRequest): CaptureCursorTarget[] {
  return request.steps.flatMap((step) => {
    if (!step.targetPoint) return [];

    return [{ stepId: step.id, ...step.targetPoint }];
  });
}

function baseProvenance(request: CaptureRequest): MotionProvenanceRef[] {
  return uniqueProvenance([
    PROVIDER_PROVENANCE,
    {
      kind: request.target.kind === 'url' ? 'site' : 'manual',
      ref: request.target.ref,
    },
  ]);
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
