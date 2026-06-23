import type { MotionProvenanceRef } from '@/lib/motion/project';

export type CodeChangeSourceKind = 'github-pr' | 'local-diff' | 'commit-range';
export type CodeChangeFileStatus = 'added' | 'modified' | 'removed' | 'renamed';
export type CodeChangeReviewState = 'approved' | 'changes-requested' | 'commented';
export type CodeChangeCiStatus = 'passed' | 'failed' | 'pending' | 'unknown';

export interface CodeChangeSource {
  kind: CodeChangeSourceKind;
  ref: string;
}

export interface CodeChangeRequest {
  source: CodeChangeSource;
  preferredProviderId?: string;
}

export interface CodeChangeFile {
  path: string;
  status: CodeChangeFileStatus;
  additions: number;
  deletions: number;
  language?: string;
}

export interface CodeChangeHunk {
  id: string;
  filePath: string;
  oldStart?: number;
  newStart?: number;
  lines: string[];
  provenance: MotionProvenanceRef[];
}

export interface CodeChangeCommit {
  sha: string;
  message: string;
  authorName?: string;
}

export interface CodeChangeReview {
  reviewer: string;
  state: CodeChangeReviewState;
}

export interface CodeChangeCiCheck {
  name: string;
  status: CodeChangeCiStatus;
  url?: string;
}

export interface CodeChangeAuthor {
  name: string;
  avatarUrl?: string;
}

export interface CodeChangeResult {
  providerId: string;
  title: string;
  author?: CodeChangeAuthor;
  files: CodeChangeFile[];
  hunks: CodeChangeHunk[];
  commits: CodeChangeCommit[];
  reviews: CodeChangeReview[];
  ci: CodeChangeCiCheck[];
  provenance: MotionProvenanceRef[];
}

export interface CodeChangeProvider {
  id: string;
  displayName: string;
  available(): boolean;
  ingest(req: CodeChangeRequest): Promise<CodeChangeResult>;
}

export type CodeChangeProviderFactory = () => CodeChangeProvider;
