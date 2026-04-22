export type SegmentationMode = 'removebg' | 'cutout' | 'unmask';
export type SegmentationRefinementMode = 'point-fg' | 'point-bg' | 'box';
export const KNOWN_SEGMENTATION_PROVIDER_IDS = ['sam3', 'sam2'] as const;
export type SegmentationProviderId =
  (typeof KNOWN_SEGMENTATION_PROVIDER_IDS)[number];

export interface SegmentationBoxPrompt {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SegmentationPointPrompt {
  x: number;
  y: number;
  label: 'fg' | 'bg';
}

export interface SegmentationRequest {
  sourceUrl: string;
  mode: SegmentationMode;
  prompt?: string;
  box?: SegmentationBoxPrompt;
  points?: SegmentationPointPrompt[];
  size?: { w: number; h: number };
}

export interface SegmentationResult {
  provider: SegmentationProviderId;
  model: string;
  maskUrl: string;
  alphaCutoutUrl?: string;
  bbox?: SegmentationBoxPrompt;
  width: number;
  height: number;
  raw?: unknown;
}

export interface SegmentationProviderStatus {
  id: SegmentationProviderId;
  displayName: string;
  models: string[];
  supportsTextPrompt: boolean;
  supportsPointPrompt: boolean;
  supportsBoxPrompt: boolean;
  available: boolean;
  unavailableReason?: string;
}

export interface SegmentationProvider {
  id: SegmentationProviderId;
  displayName: string;
  supportsTextPrompt: boolean;
  supportsPointPrompt: boolean;
  supportsBoxPrompt: boolean;
  isAvailable(): boolean;
  getAvailabilityIssue(): string | undefined;
  listModels(): string[];
  segment(req: SegmentationRequest, opts: { model: string }): Promise<SegmentationResult>;
}

export class SegmentationUnavailableError extends Error {
  constructor(providerId: string, hint?: string) {
    super(
      hint
        ? `segmentation provider '${providerId}' is unavailable: ${hint}`
        : `segmentation provider '${providerId}' is unavailable`
    );
    this.name = 'SegmentationUnavailableError';
  }
}

export class SegmentationError extends Error {
  constructor(
    message: string,
    public readonly providerId: string,
    public readonly cause?: unknown
  ) {
    super(`${providerId}: ${message}`);
    this.name = 'SegmentationError';
  }
}
