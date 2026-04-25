import path from 'node:path';
import type { CapabilityEntryKind, CapabilityEntryRef } from './entry';
import type { SkillRef } from '@/lib/agent/skills/types';

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
  /**
   * When `action === 'author-skill'`, a deterministic stub SkillRef is
   * populated so the caller can write the SKILL.md to disk and store the ref.
   * Real Claude-driven authoring of the manifest body is a follow-up slice.
   */
  draftSkillRef?: SkillRef;
}

/**
 * Derive a stable kebab-case skill id from the creator's prompt.
 * Takes the first 6 significant words, lowercases and hyphenates them.
 */
function deriveSkillId(prompt: string): string {
  return prompt
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 6)
    .join('-');
}

/**
 * Build a deterministic stub SkillRef for the `author-skill` plan branch.
 * The manifest body is left empty — the authoring loop (follow-up slice) will
 * fill it via Claude. All we need now is a stable ref + manifestPath.
 */
function buildDraftSkillRef(request: CapabilityFactoryRequest): SkillRef {
  const id = deriveSkillId(request.prompt) || request.artifactKind;
  const manifestPath = path.join(
    process.cwd(),
    'lib',
    'agent',
    'skills',
    id,
    'SKILL.md'
  );
  return {
    kind: 'skill',
    id,
    version: 1,
    manifestPath,
    manifest: {
      name: id,
      version: 1,
      description: `Auto-drafted skill for: ${request.prompt.slice(0, 120)}`,
      tools: [],
      referenceFiles: [],
      instructions: '',
    },
  };
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
      draftSkillRef: buildDraftSkillRef(request),
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
