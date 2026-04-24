import type { AirBrushHandLandmarkFrame } from './airBrush';

const MEDIAPIPE_VERSION = '0.10.34';
const DEFAULT_WASM_BASE_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;
const DEFAULT_HAND_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

// MediaPipe routes info-level messages ("INFO: Created TensorFlow Lite
// XNNPACK delegate for CPU.") and transient per-frame warnings through
// `console.error`. Next's dev overlay hooks `console.error` and will surface
// anything that goes through it regardless of whether the downstream throw is
// caught. We filter these noisy messages once at module load so the dev
// overlay stays clean for actually-actionable errors.
let consoleErrorFiltered = false;
function filterMediaPipeConsoleNoiseOnce() {
  if (consoleErrorFiltered || typeof console === 'undefined') return;
  consoleErrorFiltered = true;
  const original = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    const first = args[0];
    if (typeof first === 'string') {
      if (first.startsWith('INFO: ')) return;
      if (first.includes('TensorFlow Lite')) return;
      if (first.includes('mediapipe')) return;
      if (first.includes('MediaPipe')) return;
      if (first.includes('XNNPACK')) return;
    }
    original(...args);
  };
}

export interface AirBrushHandLandmarker {
  detectForVideo(
    video: HTMLVideoElement,
    timestampMs: number
  ): AirBrushHandLandmarkFrame;
  close?: () => void;
}

export type CreateAirBrushHandLandmarker = () => Promise<AirBrushHandLandmarker>;

export const createMediaPipeHandLandmarker: CreateAirBrushHandLandmarker =
  async () => {
    filterMediaPipeConsoleNoiseOnce();
    const { FilesetResolver, HandLandmarker } = await import(
      '@mediapipe/tasks-vision'
    );
    const wasmFileset = await FilesetResolver.forVisionTasks(
      process.env.NEXT_PUBLIC_MEDIAPIPE_WASM_BASE_URL ?? DEFAULT_WASM_BASE_URL
    );
    const landmarker = await HandLandmarker.createFromOptions(wasmFileset, {
      baseOptions: {
        modelAssetPath:
          process.env.NEXT_PUBLIC_MEDIAPIPE_HAND_MODEL_URL ??
          DEFAULT_HAND_MODEL_URL,
      },
      runningMode: 'VIDEO',
      numHands: 2,
      minHandDetectionConfidence: 0.6,
      minHandPresenceConfidence: 0.6,
      minTrackingConfidence: 0.6,
    });

    const EMPTY_FRAME: AirBrushHandLandmarkFrame = {
      landmarks: [],
      handedness: [],
      handednesses: [],
    };
    return {
      detectForVideo(video, timestampMs) {
        // MediaPipe throws from its wasm when the video has a zero-sized ROI,
        // when timestamps briefly repeat, or when the backing texture is still
        // warming up. Swallow those here so the per-frame throw never reaches
        // the Next dev overlay or kills the RAF loop - a bad frame is just a
        // frame with no detected hand.
        try {
          return landmarker.detectForVideo(video, timestampMs);
        } catch (err) {
          return {
            ...EMPTY_FRAME,
            error:
              err instanceof Error && err.message
                ? err.message
                : 'MediaPipe detectForVideo failed',
          };
        }
      },
      close() {
        landmarker.close();
      },
    };
  };
