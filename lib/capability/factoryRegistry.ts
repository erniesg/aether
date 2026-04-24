import type { CapabilityRegistrySnapshot } from './factory';
import { listPublishedSkillRegistryEntries } from '@/lib/skill/registry';
import {
  listPublishedToolRegistryEntries,
  listToolRegistryEntries,
  type ToolRegistryEntry,
} from '@/lib/tool/registry';
import { listPublishedWorkflowRegistryEntries } from '@/lib/workflow/registry';

export interface CapabilityFactoryRegistryResolution {
  snapshot: CapabilityRegistrySnapshot;
  draftTool: (ToolRegistryEntry & { status: 'draft' }) | null;
}

export function resolveCapabilityFactoryRegistry(
  artifactKind: string
): CapabilityFactoryRegistryResolution {
  const skill =
    listPublishedSkillRegistryEntries().find((entry) => entry.artifactKind === artifactKind) ?? null;
  const workflow =
    listPublishedWorkflowRegistryEntries().find((entry) => entry.artifactKind === artifactKind) ??
    null;
  const tool =
    listPublishedToolRegistryEntries().find((entry) => entry.artifactKind === artifactKind) ?? null;
  const draftTool =
    listToolRegistryEntries().find(
      (entry): entry is ToolRegistryEntry & { status: 'draft' } =>
        entry.artifactKind === artifactKind && entry.status === 'draft'
    ) ?? null;

  return {
    snapshot: {
      skill,
      workflow,
      tool,
    },
    draftTool,
  };
}
