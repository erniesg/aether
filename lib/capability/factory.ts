import type { CapabilityEntryKind, CapabilityEntryRef } from './entry';

export type CapabilityEntryStatus = 'draft' | 'published' | 'archived';
export type CapabilityPublishScope = 'workspace' | 'team';
export type CapabilityFactoryAction = 'invoke-entry' | 'author-skill' | 'author-workflow' | 'author-tool';
export type CapabilityReviewRoute = 'route-human';

export interface CapabilityRegistryEntry extends CapabilityEntryRef {
  status: CapabilityEntryStatus;
}

export interface CapabilityRegistrySnapshot {
  skill: CapabilityRegistryEntry | null;
  workflow: CapabilityRegistryEntry | null;
  tool: CapabilityRegistryEntry | null;
}

export interface CapabilityFactoryRequest {
  prompt: string;
  artifactKind: string;
  publishScope: CapabilityPublishScope;
}

export interface CapabilityFactoryPlan {
  action: CapabilityFactoryAction;
  entryRef?: CapabilityEntryRef;
  baseEntryRef?: CapabilityEntryRef;
  draftEntryKind?: Extract<CapabilityEntryKind, 'tool' | 'workflow' | 'skill'>;
  humanReviewRequired: boolean;
  reviewRoute?: CapabilityReviewRoute;
  reason: string;
}

function toEntryRef(entry: CapabilityRegistryEntry): CapabilityEntryRef {
  return {
    kind: entry.kind,
    id: entry.id,
    version: entry.version,
  };
}

export function planCapabilityFactoryAction(
  request: CapabilityFactoryRequest,
  snapshot: CapabilityRegistrySnapshot
): CapabilityFactoryPlan {
  if (snapshot.skill?.status === 'published') {
    return {
      action: 'invoke-entry',
      entryRef: toEntryRef(snapshot.skill),
      humanReviewRequired: false,
      reason: `Published skill '${snapshot.skill.id}' already matches the request.`,
    };
  }

  const base = snapshot.workflow ?? snapshot.tool;
  if (base) {
    const teamPublish = request.publishScope === 'team';
    return {
      action: 'author-skill',
      baseEntryRef: toEntryRef(base),
      draftEntryKind: 'skill',
      humanReviewRequired: teamPublish,
      reviewRoute: teamPublish ? 'route-human' : undefined,
      reason: teamPublish
        ? `A reusable team skill should be authored over the existing ${base.kind} '${base.id}' and reviewed before publication.`
        : `A workspace skill can be authored over the existing ${base.kind} '${base.id}'.`,
    };
  }

  return {
    action: 'author-tool',
    draftEntryKind: 'tool',
    humanReviewRequired: true,
    reviewRoute: 'route-human',
    reason: `A new execution primitive is required because no published tool, workflow, or skill exists for '${request.artifactKind}'.`,
  };
}
