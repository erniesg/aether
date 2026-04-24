import type { AirBrushHandLandmarkFrame } from './airBrush';

const MEDIAPIPE_VERSION = '0.10.34';
const DEFAULT_WASM_BASE_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;
const DEFAULT_HAND_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

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
      numHands: 1,
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

    return {
      detectForVideo(video, timestampMs) {
        return landmarker.detectForVideo(video, timestampMs);
      },
      close() {
        landmarker.close();
      },
    };
  };
