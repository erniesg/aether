export const DEFAULT_MOTION_FPS = 30;
export const DEFAULT_MOTION_WORKFLOW_MODE = 'review' satisfies MotionWorkflowMode;

export type MotionProjectKind = 'launch' | 'feature' | 'demo' | 'social' | 'case-study' | 'pr';
export type MotionWorkflowMode = 'review' | 'full-auto';
export type MotionDraftStatus = 'planned' | 'generating' | 'ready' | 'approved' | 'rejected';
export type MotionBeatRole =
  | 'hook'
  | 'problem'
  | 'change'
  | 'diff'
  | 'mechanism'
  | 'evidence'
  | 'proof'
  | 'demo'
  | 'payoff'
  | 'credits'
  | 'cta';
export type MotionAspectRatio = '16:9' | '9:16' | '1:1' | '4:5';
export type MotionPlatform =
  | 'x'
  | 'linkedin'
  | 'youtube'
  | 'tiktok'
  | 'instagram'
  | 'website'
  | 'deck';

export type MotionTrackKind =
  | 'screen'
  | 'broll'
  | 'text'
  | 'caption'
  | 'voice'
  | 'music'
  | 'sfx'
  | 'effect'
  | 'transition';

export interface MotionProvenanceRef {
  kind:
    | 'repo'
    | 'code-change'
    | 'site'
    | 'upload'
    | 'reference'
    | 'story-beat'
    | 'timeline'
    | 'capture'
    | 'voice'
    | 'provider'
    | 'render'
    | 'manual';
  ref: string;
  label?: string;
}

export interface AppProfile {
  name: string;
  repoUrl?: string;
  siteUrl?: string;
  summary: string;
  stack: string[];
}

export interface MotionPlatformTarget {
  platform: MotionPlatform;
  aspectRatio: MotionAspectRatio;
  seconds: number;
}

export interface MotionClaimReceipt {
  text: string;
  source: MotionProvenanceRef;
}

export interface BrandMotionTokens {
  palette: string[];
  fontFamilies: string[];
  motionStyle: string;
}

export interface MotionBriefV2 {
  projectKind: MotionProjectKind;
  appProfile: AppProfile;
  audience: string;
  platformTargets: MotionPlatformTarget[];
  claims: MotionClaimReceipt[];
  tone: string;
  brandMotion: BrandMotionTokens;
}

export interface StoryBeat {
  id: string;
  role: MotionBeatRole;
  narration: string;
  targetSeconds: number;
  selectedAssetIds: string[];
  templateId?: string;
  provenance: MotionProvenanceRef[];
}

export interface TimelineClip {
  id: string;
  assetId?: string;
  componentId?: string;
  startFrame: number;
  durationFrames: number;
  inFrame?: number;
  outFrame?: number;
  props: Record<string, unknown>;
  linkedVariantScope?: 'global' | 'format-local';
  provenance: MotionProvenanceRef[];
}

export interface TimelineTrack {
  id: string;
  kind: MotionTrackKind;
  clips: TimelineClip[];
}

export interface MotionDraft {
  id: string;
  label: string;
  angle: string;
  status: MotionDraftStatus;
  story: StoryBeat[];
  tracks: TimelineTrack[];
  provenance: MotionProvenanceRef[];
}

export interface MotionGraphNode {
  id: string;
  kind:
    | 'repo-ingest'
    | 'pr-ingest'
    | 'script'
    | 'storyboard'
    | 'capture'
    | 'visual-search'
    | 'image-to-video'
    | 'voice'
    | 'sync'
    | 'render';
  inputRefs: string[];
  outputRefs: string[];
  providerId?: string;
  status: 'planned' | 'running' | 'done' | 'failed';
  provenance: MotionProvenanceRef[];
}

export interface MotionExport {
  id: string;
  platform: MotionPlatform;
  aspectRatio: MotionAspectRatio;
  status: 'planned' | 'rendering' | 'ready' | 'failed';
  assetId?: string;
  posterAssetId?: string;
  subtitleAssetId?: string;
  transcriptAssetId?: string;
  manifestAssetId?: string;
  provenance: MotionProvenanceRef[];
}

export interface MotionProject {
  id: string;
  workspaceId: string;
  title: string;
  sourceRefs: MotionProvenanceRef[];
  brief: MotionBriefV2;
  story: StoryBeat[];
  workflowMode: MotionWorkflowMode;
  currentDraftId: string;
  drafts: MotionDraft[];
  tracks: TimelineTrack[];
  graphNodes: MotionGraphNode[];
  exports: MotionExport[];
  createdAt: number;
  updatedAt: number;
}

export function motionFrames(seconds: number, fps = DEFAULT_MOTION_FPS): number {
  return Math.round(seconds * fps);
}

export function motionSeconds(frames: number, fps = DEFAULT_MOTION_FPS): number {
  return frames / fps;
}
