export const KNOWN_SPATIAL_PROVIDER_IDS = ['draft'] as const;

export type SpatialProviderId = (typeof KNOWN_SPATIAL_PROVIDER_IDS)[number];
export type SpatialFormat = 'particle-field' | 'gaussian-splat';
export type SpatialQuality = 'draft' | 'standard' | 'high';

export interface SpatialBuildRequest {
  sourceUrl: string;
  width: number;
  height: number;
  prompt?: string;
  format: SpatialFormat;
  quality?: SpatialQuality;
}

export interface SpatialSceneSpec {
  kind: SpatialFormat;
  pointCount: number;
  sourceUrl: string;
  prompt?: string;
}

export interface SpatialBuildResult {
  provider: SpatialProviderId;
  model: string;
  format: SpatialFormat;
  previewImageUrl: string;
  sceneSpec: SpatialSceneSpec;
  latencyMs: number;
  raw?: unknown;
}

export interface SpatialProviderStatus {
  id: SpatialProviderId;
  displayName: string;
  models: string[];
  available: boolean;
  unavailableReason?: string;
}

export interface SpatialProvider {
  id: SpatialProviderId;
  displayName: string;
  isAvailable(): boolean;
  getAvailabilityIssue(): string | undefined;
  listModels(): string[];
  build(req: SpatialBuildRequest, opts: { model: string }): Promise<SpatialBuildResult>;
}

export class SpatialUnavailableError extends Error {
  constructor(providerId: string, hint?: string) {
    super(
      hint
        ? `spatial provider '${providerId}' is unavailable: ${hint}`
        : `spatial provider '${providerId}' is unavailable`
    );
    this.name = 'SpatialUnavailableError';
  }
}

export class SpatialBuildError extends Error {
  constructor(message: string, readonly providerId: string) {
    super(message);
    this.name = 'SpatialBuildError';
  }
}
