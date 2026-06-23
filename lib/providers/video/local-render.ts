import type {
  MotionRenderedAsset,
  MotionRenderEngine,
  MotionRenderProvider,
  MotionRenderRequest,
  MotionRenderResult,
} from './types';
import type { MotionProvenanceRef } from '@/lib/motion/project';

export interface MotionRenderRunnerOutput {
  outputId: string;
  assetUrl: string;
  provenance?: MotionProvenanceRef[];
}

export interface MotionRenderRunnerResult {
  outputs: MotionRenderRunnerOutput[];
  provenance?: MotionProvenanceRef[];
}

export interface MotionRenderRunner {
  available(): boolean;
  render(request: MotionRenderRequest): Promise<MotionRenderRunnerResult>;
}

export interface CreateRunnerMotionRenderProviderOptions {
  id: string;
  engine: MotionRenderEngine;
  displayName: string;
  runner?: MotionRenderRunner;
}

export interface CreateEngineRenderProviderOptions {
  runner?: MotionRenderRunner;
}

export function createRunnerMotionRenderProvider(
  options: CreateRunnerMotionRenderProviderOptions
): MotionRenderProvider {
  const providerRef = { kind: 'provider', ref: options.id } satisfies MotionProvenanceRef;

  return {
    id: options.id,
    engine: options.engine,
    displayName: options.displayName,
    available: () => options.runner?.available() ?? false,
    async render(request) {
      if (request.engine !== options.engine) {
        throw new Error(`${options.id} cannot render ${request.engine} requests`);
      }

      if (!options.runner?.available()) {
        throw new Error(`${options.id} requires a runner`);
      }

      const runnerResult = await options.runner.render(request);
      const outputsById = new Map(request.outputs.map((output) => [output.id, output]));

      return {
        providerId: options.id,
        engine: options.engine,
        outputs: runnerResult.outputs.map((output) => {
          const plannedOutput = outputsById.get(output.outputId);
          if (!plannedOutput) {
            throw new Error(`unplanned render output ${output.outputId}`);
          }

          return {
            ...plannedOutput,
            assetUrl: output.assetUrl,
            provenance: uniqueProvenance([
              providerRef,
              ...plannedOutput.provenance,
              ...(output.provenance ?? []),
            ]),
          } satisfies MotionRenderedAsset;
        }),
        provenance: renderResultProvenance(providerRef, request, runnerResult),
      } satisfies MotionRenderResult;
    },
  };
}

export function createRemotionRenderProvider(
  options: CreateEngineRenderProviderOptions = {}
): MotionRenderProvider {
  return createRunnerMotionRenderProvider({
    id: 'remotion-local',
    engine: 'remotion',
    displayName: 'Remotion local render',
    runner: options.runner,
  });
}

export function createHyperFramesRenderProvider(
  options: CreateEngineRenderProviderOptions = {}
): MotionRenderProvider {
  return createRunnerMotionRenderProvider({
    id: 'hyperframes-local',
    engine: 'hyperframes',
    displayName: 'HyperFrames local render',
    runner: options.runner,
  });
}

function renderResultProvenance(
  providerRef: MotionProvenanceRef,
  request: MotionRenderRequest,
  runnerResult: MotionRenderRunnerResult
): MotionProvenanceRef[] {
  return uniqueProvenance([
    providerRef,
    ...request.provenance,
    ...(runnerResult.provenance ?? []),
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
