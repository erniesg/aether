import type {
  MotionAspectRatio,
  MotionPlatform,
  MotionProvenanceRef,
  TimelineTrack,
} from '@/lib/motion/project';

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

export type MotionRenderEngine = 'remotion' | 'hyperframes';
export type MotionRenderOutputKind =
  | 'video'
  | 'poster'
  | 'subtitle'
  | 'transcript'
  | 'manifest';

export interface MotionRenderOutput {
  id: string;
  exportId: string;
  kind: MotionRenderOutputKind;
  platform: MotionPlatform;
  aspectRatio: MotionAspectRatio;
  width: number;
  height: number;
  mimeType: string;
  path: string;
  provenance: MotionProvenanceRef[];
}

export interface MotionRenderRequest {
  id: string;
  projectId: string;
  draftId: string;
  engine: MotionRenderEngine;
  compositionId: string;
  fps: number;
  durationFrames: number;
  tracks: TimelineTrack[];
  outputs: MotionRenderOutput[];
  provenance: MotionProvenanceRef[];
}

export interface MotionRenderedAsset extends MotionRenderOutput {
  assetUrl: string;
}

export interface MotionRenderResult {
  providerId: string;
  engine: MotionRenderEngine;
  outputs: MotionRenderedAsset[];
  provenance: MotionProvenanceRef[];
}

export interface MotionRenderProvider {
  id: string;
  engine: MotionRenderEngine;
  displayName: string;
  available(): boolean;
  render(req: MotionRenderRequest): Promise<MotionRenderResult>;
}

export type MotionRenderProviderFactory = () => MotionRenderProvider;
