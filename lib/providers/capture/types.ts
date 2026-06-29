import type { MotionAspectRatio, MotionProvenanceRef } from '@/lib/motion/project';

export type CaptureTargetKind = 'url' | 'local-app' | 'desktop-app' | 'figma' | 'repo';
export type CaptureMode = 'screenshot' | 'screen-recording' | 'dom-snapshot' | 'interaction-trace';
export type CaptureStepAction = 'goto' | 'click' | 'type' | 'wait' | 'scroll' | 'record' | 'manual';
export type CaptureArtifactKind = 'screenshot' | 'recording' | 'snapshot' | 'trace';
export type CaptureRedactionAction = 'mask' | 'blur' | 'omit';

export interface CaptureTarget {
  kind: CaptureTargetKind;
  ref: string;
}

export interface CaptureViewport {
  width: number;
  height: number;
  deviceScaleFactor: number;
}

export interface CapturePoint {
  x: number;
  y: number;
}

export interface CaptureStep {
  id: string;
  label: string;
  action: CaptureStepAction;
  selector?: string;
  value?: string;
  targetPoint?: CapturePoint;
  expectedArtifactId?: string;
}

export interface CaptureAppLaunchReadiness {
  kind: 'http';
  url: string;
  timeoutMs: number;
}

export interface CaptureAppLaunch {
  command: string;
  cwd?: string;
  targetUrl: string;
  readiness: CaptureAppLaunchReadiness;
}

export interface CaptureRequest {
  target: CaptureTarget;
  mode: CaptureMode;
  aspectRatio: MotionAspectRatio;
  viewport: CaptureViewport;
  steps: CaptureStep[];
  appLaunch?: CaptureAppLaunch;
  preferredProviderId?: string;
}

export interface CaptureCursorTarget extends CapturePoint {
  stepId: string;
}

export interface CaptureRedaction {
  label: string;
  target: string;
  action: CaptureRedactionAction;
  applied: boolean;
}

export interface CaptureRedactionManifest {
  labels: string[];
  applied: boolean;
  receiptRef?: string;
}

export interface CaptureArtifact {
  id: string;
  kind: CaptureArtifactKind;
  target?: CaptureTarget;
  assetUrl: string;
  width: number;
  height: number;
  durationMs?: number;
  mimeType: string;
  viewport: CaptureViewport;
  appLaunch?: CaptureAppLaunch;
  cursorTargets: CaptureCursorTarget[];
  redactions?: CaptureRedaction[];
  provenance: MotionProvenanceRef[];
}

export interface CaptureResult {
  providerId: string;
  artifacts: CaptureArtifact[];
  provenance: MotionProvenanceRef[];
}

export interface CaptureProvider {
  id: string;
  displayName: string;
  available(): boolean;
  capture(req: CaptureRequest): Promise<CaptureResult>;
}

export type CaptureProviderFactory = () => CaptureProvider;
