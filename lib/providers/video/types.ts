export type VideoProviderId =
  | 'hyperframes'
  | 'remotion'
  | 'volcengine'
  | 'replicate';
export type VideoAspectRatio =
  | '1:1'
  | '9:16'
  | '16:9'
  | '4:3'
  | '3:4'
  | '4:5'
  | '2:3'
  | '3:2'
  | 'custom';

export interface VideoSize {
  w: number;
  h: number;
}

export interface VideoSceneAsset {
  id: string;
  kind: 'image' | 'video' | 'audio';
  url: string;
  posterUrl?: string;
  width?: number;
  height?: number;
  durationSec?: number;
}

export interface VideoSceneSpec {
  kind: string;
  version: number;
  title?: string;
  durationSec: number;
  fps: number;
  size: VideoSize;
  aspectRatio: VideoAspectRatio;
  assets?: VideoSceneAsset[];
  payload: unknown;
}

export interface VideoGenRequest {
  prompt?: string;
  sourceImageUrl?: string;
  sourceVideoUrl?: string;
  sceneSpec?: VideoSceneSpec;
  durationSec: number;
  aspectRatio?: VideoAspectRatio;
  size?: VideoSize;
  fps?: number;
  seed?: number;
  style?: Record<string, unknown>;
  audioUrl?: string;
  beatSync?: boolean;
}

export interface VideoGenResult {
  provider: VideoProviderId;
  model: string;
  videoUrl: string;
  posterUrl?: string;
  durationSec: number;
  fps?: number;
  width?: number;
  height?: number;
  latencyMs: number;
  raw?: unknown;
}

export interface VideoProviderStatus {
  id: VideoProviderId;
  displayName: string;
  models: string[];
  supportsTextToVideo: boolean;
  supportsImageToVideo: boolean;
  supportsSceneSpec: boolean;
  supportsAudioSync: boolean;
  available: boolean;
  unavailableReason?: string;
}

export interface VideoGenProvider {
  id: VideoProviderId;
  displayName: string;
  supportsTextToVideo: boolean;
  supportsImageToVideo: boolean;
  supportsSceneSpec: boolean;
  supportsAudioSync: boolean;
  isAvailable(): boolean;
  getAvailabilityIssue(): string | undefined;
  listModels(): string[];
  generate(req: VideoGenRequest, opts: { model: string }): Promise<VideoGenResult>;
}

export class VideoProviderUnavailableError extends Error {
  constructor(providerId: string, hint?: string) {
    super(
      hint
        ? `video provider '${providerId}' is unavailable: ${hint}`
        : `video provider '${providerId}' is unavailable`
    );
    this.name = 'VideoProviderUnavailableError';
  }
}

export class VideoGenError extends Error {
  constructor(
    message: string,
    public readonly providerId: string,
    public readonly cause?: unknown
  ) {
    super(`${providerId}: ${message}`);
    this.name = 'VideoGenError';
  }
}

const DEFAULT_VIDEO_SIZES: Record<Exclude<VideoAspectRatio, 'custom'>, VideoSize> = {
  '1:1': { w: 1080, h: 1080 },
  '9:16': { w: 1080, h: 1920 },
  '16:9': { w: 1920, h: 1080 },
  '4:3': { w: 1600, h: 1200 },
  '3:4': { w: 1200, h: 1600 },
  '4:5': { w: 1080, h: 1350 },
  '2:3': { w: 1200, h: 1800 },
  '3:2': { w: 1800, h: 1200 },
};

export function resolveVideoSize(
  aspectRatio: VideoAspectRatio = '16:9',
  size?: VideoSize
): VideoSize {
  if (size) return size;
  if (aspectRatio === 'custom') {
    throw new Error('custom video aspect ratio requires an explicit size');
  }
  return DEFAULT_VIDEO_SIZES[aspectRatio];
}
