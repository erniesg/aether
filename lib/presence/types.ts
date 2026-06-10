import type { EvidenceClaim } from '@/lib/research/evidence-facts';

export type PresenceStrategyStatus = 'proposed' | 'accepted' | 'rejected';
export type PresenceDraftKind = 'post' | 'reply';
export type PresenceDraftReceiptKind = 'evidence-fact' | 'signal-post';

export interface PresenceProfile {
  id: string;
  workspaceId: string;
  label: string;
  xHandle: string;
  goal: string;
  targetMetric?: string;
  createdAt: number;
  updatedAt: number;
}

export interface PresenceIcpAccount {
  handle: string;
  reason: string;
}

export interface PresencePillar {
  name: string;
  evidenceRefs: string[];
  exampleFormats: string[];
}

export interface PresenceReplyPlaybook {
  dailyMinutes: number;
  accountListSize: number;
}

export interface PresenceStrategyShape {
  positioning: string;
  icpAccounts: PresenceIcpAccount[];
  pillars: PresencePillar[];
  cadence: string;
  replyPlaybook: PresenceReplyPlaybook;
  skipList: string[];
  goalMetric90d: string;
}

export interface PresenceStrategyRecord extends PresenceStrategyShape {
  id: string;
  workspaceId: string;
  profileId: string;
  status: PresenceStrategyStatus;
  createdAt: number;
  updatedAt: number;
  acceptedAt?: number;
  rejectedAt?: number;
}

export interface PresenceDraftReceipt {
  kind: PresenceDraftReceiptKind;
  ref: string;
}

export interface GeneratedPresenceDraft {
  kind: PresenceDraftKind;
  text: string;
  pillar: string;
  targetUrl?: string;
  receipt: PresenceDraftReceipt;
}

export interface PresenceCreatorContext {
  brand?: {
    name: string;
    voice?: string;
  };
  offer?: {
    name: string;
    summary?: string;
    claims?: string[];
  };
  campaign?: {
    name: string;
    goal?: string;
    audience?: string;
  };
}

export interface PresencePlannerContext {
  workspaceId: string;
  profile: PresenceProfile;
  creatorContext?: PresenceCreatorContext;
  evidenceFacts?: EvidenceClaim[];
  insightsDigest?: unknown;
  performanceLedger?: unknown;
  recentIcpPosts?: unknown[];
}
