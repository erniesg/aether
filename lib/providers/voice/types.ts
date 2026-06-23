import type { MotionProvenanceRef } from '@/lib/motion/project';

export type VoiceArtifactKind = 'audio' | 'word-timings' | 'transcript';

export interface VoiceArtifact {
  id: string;
  kind: VoiceArtifactKind;
  mimeType: string;
  path: string;
  assetUrl?: string;
  durationMs?: number;
  provenance: MotionProvenanceRef[];
}

export interface VoiceSynthesisRequest {
  id: string;
  projectId: string;
  draftId: string;
  clipId: string;
  trackId?: string;
  text: string;
  voiceId?: string;
  startFrame: number;
  durationFrames: number;
  fps: number;
  expectedArtifacts: VoiceArtifact[];
  provenance: MotionProvenanceRef[];
}

export interface VoiceSynthesisResult {
  providerId: string;
  artifacts: VoiceArtifact[];
  provenance: MotionProvenanceRef[];
}

export interface VoiceProvider {
  id: string;
  displayName: string;
  available(): boolean;
  synthesize(req: VoiceSynthesisRequest): Promise<VoiceSynthesisResult>;
}

export type VoiceProviderFactory = () => VoiceProvider;
