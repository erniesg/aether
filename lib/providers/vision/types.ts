export type VisionProviderId = 'openai';
export const KNOWN_VISION_PROVIDER_IDS = ['openai'] as const;

export type ImageElementProminence = 'primary' | 'secondary' | 'accent';

export interface ImageElementSuggestion {
  id: string;
  label: string;
  prompt: string;
  prominence: ImageElementProminence;
}

export interface ImageElementInventory {
  summary: string;
  elements: ImageElementSuggestion[];
}

export interface VisionAnalyzeRequest {
  sourceUrl: string;
  maxElements?: number;
}

export interface VisionAnalyzeResult {
  provider: VisionProviderId;
  model: string;
  latencyMs?: number;
  inventory: ImageElementInventory;
  raw?: unknown;
}

export interface VisionProvider {
  id: VisionProviderId;
  displayName: string;
  isAvailable(): boolean;
  listModels(): string[];
  analyze(req: VisionAnalyzeRequest, opts: { model: string }): Promise<VisionAnalyzeResult>;
}

export class VisionUnavailableError extends Error {
  constructor(providerId: VisionProviderId, hint?: string) {
    super(
      hint
        ? `vision provider '${providerId}' is unavailable: ${hint}`
        : `vision provider '${providerId}' is unavailable`
    );
    this.name = 'VisionUnavailableError';
  }
}

export class VisionError extends Error {
  constructor(
    message: string,
    public readonly providerId: VisionProviderId,
    public readonly cause?: unknown
  ) {
    super(`${providerId}: ${message}`);
    this.name = 'VisionError';
  }
}
