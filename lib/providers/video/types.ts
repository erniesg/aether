export type VideoUnderstandingTask =
  | 'summarize'
  | 'transcribe'
  | 'extract-moments'
  | 'describe-shots'
  | 'free-form';

export interface VideoUnderstandingRequest {
  videoUrl: string;
  prompt?: string;
  task?: VideoUnderstandingTask;
}

export interface VideoUnderstandingResult {
  text: string;
  modelId: string;
  usageMs: number;
}

export interface VideoUnderstandingProvider {
  id: string;
  displayName: string;
  available(): boolean;
  understand(req: VideoUnderstandingRequest): Promise<VideoUnderstandingResult>;
}

export class VideoProviderUnavailableError extends Error {
  constructor(reason: string) {
    super(`Video provider unavailable: ${reason}`);
    this.name = 'VideoProviderUnavailableError';
  }
}
