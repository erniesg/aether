import type {
  CaptureArtifact,
  CaptureArtifactKind,
  CaptureCursorTarget,
  CaptureProvider,
  CaptureRedaction,
  CaptureRedactionManifest,
  CaptureRequest,
} from './types';
import type { MotionProvenanceRef } from '@/lib/motion/project';

export interface ComputerUseCaptureRunnerArtifact {
  assetUrl: string;
  width?: number;
  height?: number;
  durationMs?: number;
  mimeType?: string;
  cursorTargets?: CaptureCursorTarget[];
  redactions?: CaptureRedaction[];
  provenance?: MotionProvenanceRef[];
}

export interface ComputerUseCapturePolicy {
  approved: true;
  redactionManifest: CaptureRedactionManifest;
}

export interface ComputerUseCaptureRunner {
  available(): boolean;
  capture(
    request: CaptureRequest,
    policy: ComputerUseCapturePolicy
  ): Promise<ComputerUseCaptureRunnerArtifact[]>;
}

export interface CreateComputerUseCaptureProviderOptions {
  runner?: ComputerUseCaptureRunner;
  approved?: boolean;
  redactionManifest?: CaptureRedactionManifest;
}

const PROVIDER_ID = 'computer-use-capture';
const PROVIDER_PROVENANCE = { kind: 'provider', ref: PROVIDER_ID } satisfies MotionProvenanceRef;

export function createComputerUseCaptureProvider(
  options: CreateComputerUseCaptureProviderOptions = {}
): CaptureProvider {
  const runner = options.runner;

  return {
    id: PROVIDER_ID,
    displayName: 'Computer-use capture',
    available: () => runner?.available() ?? false,
    async capture(request) {
      if (!runner?.available()) {
        throw new Error('Computer-use capture requires a runner');
      }

      const policy = capturePolicy(options);
      const runnerArtifacts = await runner.capture(request, policy);
      const provenance = baseProvenance(request, policy.redactionManifest);

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

function capturePolicy(
  options: CreateComputerUseCaptureProviderOptions
): ComputerUseCapturePolicy {
  if (options.approved !== true) {
    throw new Error('Computer-use capture requires creator approval');
  }
  if (!options.redactionManifest?.applied) {
    throw new Error('Computer-use capture requires an applied redaction manifest');
  }

  return {
    approved: true,
    redactionManifest: options.redactionManifest,
  };
}

function normalizeArtifact(input: {
  artifact: ComputerUseCaptureRunnerArtifact;
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
    id: artifactId(input.request, kind, input.index),
    kind,
    assetUrl: input.artifact.assetUrl,
    width: input.artifact.width ?? input.request.viewport.width,
    height: input.artifact.height ?? input.request.viewport.height,
    ...(input.artifact.durationMs === undefined ? {} : { durationMs: input.artifact.durationMs }),
    mimeType: input.artifact.mimeType ?? mimeTypeForKind(kind),
    viewport: input.request.viewport,
    cursorTargets: input.artifact.cursorTargets ?? cursorTargetsFromSteps(input.request),
    ...(input.artifact.redactions?.length ? { redactions: input.artifact.redactions } : {}),
    provenance,
  };
}

function artifactKindForMode(mode: CaptureRequest['mode']): CaptureArtifactKind {
  if (mode === 'screen-recording') return 'recording';
  if (mode === 'dom-snapshot') return 'snapshot';
  if (mode === 'interaction-trace') return 'trace';
  return 'screenshot';
}

function mimeTypeForKind(kind: CaptureArtifactKind): string {
  if (kind === 'screenshot') return 'image/png';
  if (kind === 'recording') return 'video/mp4';
  return 'application/json';
}

function artifactId(request: CaptureRequest, kind: CaptureArtifactKind, index: number): string {
  const base = `capture-computer-use-${kind}-${slugFromRef(request.target.ref)}`;
  return index === 0 ? base : `${base}-${index + 1}`;
}

function slugFromRef(ref: string): string {
  return ref
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

function baseProvenance(
  request: CaptureRequest,
  redactionManifest: CaptureRedactionManifest
): MotionProvenanceRef[] {
  return uniqueProvenance([
    PROVIDER_PROVENANCE,
    {
      kind: request.target.kind === 'url' ? 'site' : 'manual',
      ref: request.target.ref,
    },
    ...(redactionManifest.receiptRef
      ? [
          {
            kind: 'manual' as const,
            ref: `redaction:${redactionManifest.receiptRef}`,
          },
        ]
      : []),
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
