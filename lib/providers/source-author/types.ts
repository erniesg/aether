import type { MotionProvenanceRef } from '@/lib/motion/project';
import type { MotionSourcePatchAuthoringRequest } from '@/lib/motion/sourcePatchDraft';
import type { MotionSourceBundleEditFile } from '@/lib/motion/sourceBundleApply';

export type MotionSourceAuthorRequest = MotionSourcePatchAuthoringRequest;

export interface MotionSourceAuthorResult {
  providerId: string;
  files: MotionSourceBundleEditFile[];
  provenance: MotionProvenanceRef[];
}

export interface MotionSourceAuthorProvider {
  id: string;
  displayName: string;
  available(): boolean;
  author(req: MotionSourceAuthorRequest): Promise<MotionSourceAuthorResult>;
}

export type MotionSourceAuthorProviderFactory = () => MotionSourceAuthorProvider;
