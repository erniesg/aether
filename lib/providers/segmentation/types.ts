export type SegmentationMode = 'removebg' | 'cutout' | 'unmask';

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
  provider: string;
  model: string;
  maskUrl: string;
  alphaCutoutUrl?: string;
  bbox?: SegmentationBoxPrompt;
  width: number;
  height: number;
  raw?: unknown;
}

export interface SegmentationProvider {
  id: string;
  displayName: string;
  supportsTextPrompt: boolean;
  isAvailable(): boolean;
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
