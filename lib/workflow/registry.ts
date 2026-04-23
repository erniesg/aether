import type { CapabilityEntryRef } from '@/lib/capability/entry';
import type { ToolRegistryId } from '@/lib/tool/registry';

export interface WorkflowRegistryEntry extends CapabilityEntryRef<'workflow'> {
  artifactKind: string;
  label: string;
  toolIds: ToolRegistryId[];
}

const WORKFLOW_REGISTRY = {
  'image-render-basic': {
    kind: 'workflow',
    id: 'image-render-basic',
    version: 1,
    artifactKind: 'image',
    label: 'Basic image render',
    toolIds: ['image-gen'],
  },
} as const satisfies Record<string, WorkflowRegistryEntry>;

export type WorkflowRegistryId = keyof typeof WORKFLOW_REGISTRY;

export function listWorkflowRegistryEntries(): WorkflowRegistryEntry[] {
  return Object.values(WORKFLOW_REGISTRY);
}

export function getWorkflowRegistryEntry(id: string): WorkflowRegistryEntry | null {
  return WORKFLOW_REGISTRY[id as WorkflowRegistryId] ?? null;
}
