import type { CapabilityEntryRef, CapabilityStatus } from '@/lib/capability/entry';
import type { ArtifactKind, ToolRegistryId } from '@/lib/tool/registry';

export interface WorkflowRegistryEntry extends CapabilityEntryRef<'workflow'> {
  artifactKind: ArtifactKind;
  label: string;
  toolIds: ToolRegistryId[];
  status: CapabilityStatus;
}

const WORKFLOW_REGISTRY = {
  'image-render-basic': {
    kind: 'workflow',
    id: 'image-render-basic',
    version: 1,
    artifactKind: 'image',
    label: 'Basic image render',
    toolIds: ['image-gen'],
    status: 'published',
  },
  'cutout-clean-plate': {
    kind: 'workflow',
    id: 'cutout-clean-plate',
    version: 1,
    artifactKind: 'image',
    label: 'Cutout with clean plate',
    toolIds: ['cutout', 'bg-fill'],
    status: 'published',
  },
  'motion-key-visual': {
    kind: 'workflow',
    id: 'motion-key-visual',
    version: 1,
    artifactKind: 'video',
    label: 'Motion key visual',
    toolIds: ['image-gen', 'video-gen'],
    status: 'draft',
  },
} as const satisfies Record<string, WorkflowRegistryEntry>;

export type WorkflowRegistryId = keyof typeof WORKFLOW_REGISTRY;

export function listWorkflowRegistryEntries(): WorkflowRegistryEntry[] {
  return Object.values(WORKFLOW_REGISTRY);
}

export function listPublishedWorkflowRegistryEntries(): WorkflowRegistryEntry[] {
  return listWorkflowRegistryEntries().filter((entry) => entry.status === 'published');
}

export function getWorkflowRegistryEntry(id: string): WorkflowRegistryEntry | null {
  return WORKFLOW_REGISTRY[id as WorkflowRegistryId] ?? null;
}
