import type { CapabilityRegistrySnapshot } from './factory';
import { listPublishedSkillRegistryEntries } from '@/lib/skill/registry';
import { listPublishedToolRegistryEntries, listToolRegistryEntries } from '@/lib/tool/registry';
import { listPublishedWorkflowRegistryEntries } from '@/lib/workflow/registry';

export interface CapabilityFactoryRegistryResolution {
  snapshot: CapabilityRegistrySnapshot;
  draftTool:
    | {
        kind: 'tool';
        id: string;
        version: number;
        artifactKind: string;
        label: string;
        outputKind: 'image';
        status: 'draft';
      }
    | null;
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
      (entry): entry is CapabilityFactoryRegistryResolution['draftTool'] extends infer Draft
        ? Exclude<Draft, null>
        : never => entry.artifactKind === artifactKind && entry.status === 'draft'
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
