import type { CapabilityEntryRef } from '@/lib/capability/entry';
import type { ToolRegistryId } from '@/lib/tool/registry';

export type WorkflowArtifactKind = 'image' | 'deck';
export type WorkflowSourceKind = 'repo' | 'site' | 'capture' | 'upload' | 'reference';
export type WorkflowReviewArtifactKind =
  | 'outline'
  | 'style-previews'
  | 'slide-draft'
  | 'live-demo-config'
  | 'code-references'
  | 'render-proof'
  | 'export-pack';

export interface WorkflowRegistryEntry extends CapabilityEntryRef<'workflow'> {
  artifactKind: WorkflowArtifactKind;
  label: string;
  description?: string;
  toolIds: readonly ToolRegistryId[];
  acceptedSourceKinds?: readonly WorkflowSourceKind[];
  reviewArtifacts?: readonly WorkflowReviewArtifactKind[];
  status: 'draft' | 'published' | 'archived';
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
  'repo-to-deck': {
    kind: 'workflow',
    id: 'repo-to-deck',
    version: 1,
    artifactKind: 'deck',
    label: 'Repo to deck',
    description:
      'Plan an editable deck on the canvas from repo, site, capture, upload, and references, with slides, live demo, code references, render proof, and export pack review.',
    toolIds: [],
    acceptedSourceKinds: ['repo', 'site', 'capture', 'upload', 'reference'],
    reviewArtifacts: [
      'outline',
      'style-previews',
      'slide-draft',
      'live-demo-config',
      'code-references',
      'render-proof',
      'export-pack',
    ],
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
