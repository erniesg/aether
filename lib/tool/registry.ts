import type { CapabilityEntryRef } from '@/lib/capability/entry';

export type ToolArtifactKind = 'image' | 'spatial' | 'video' | 'audio';

export interface ToolRegistryEntry extends CapabilityEntryRef<'tool'> {
  artifactKind: ToolArtifactKind;
  label: string;
  outputKind: ToolArtifactKind;
  status: 'draft' | 'published' | 'archived';
}

const TOOL_REGISTRY = {
  'image-gen': {
    kind: 'tool',
    id: 'image-gen',
    version: 1,
    artifactKind: 'image',
    label: 'Image generation',
    outputKind: 'image',
    status: 'published',
  },
  'image-edit': {
    kind: 'tool',
    id: 'image-edit',
    version: 1,
    artifactKind: 'image',
    label: 'Image edit',
    outputKind: 'image',
    status: 'published',
  },
  'bg-fill': {
    kind: 'tool',
    id: 'bg-fill',
    version: 1,
    artifactKind: 'image',
    label: 'Background fill',
    outputKind: 'image',
    status: 'published',
  },
  cutout: {
    kind: 'tool',
    id: 'cutout',
    version: 1,
    artifactKind: 'image',
    label: 'Cutout',
    outputKind: 'image',
    status: 'published',
  },
  relight: {
    kind: 'tool',
    id: 'relight',
    version: 1,
    artifactKind: 'image',
    label: 'Relight',
    outputKind: 'image',
    status: 'published',
  },
  'spatial-gen': {
    kind: 'tool',
    id: 'spatial-gen',
    version: 1,
    artifactKind: 'spatial',
    label: 'Spatial generation',
    outputKind: 'image',
    status: 'draft',
  },
  'video-gen': {
    kind: 'tool',
    id: 'video-gen',
    version: 1,
    artifactKind: 'video',
    label: 'Video generation',
    outputKind: 'video',
    status: 'draft',
  },
  'audio-gen': {
    kind: 'tool',
    id: 'audio-gen',
    version: 1,
    artifactKind: 'audio',
    label: 'Audio generation',
    outputKind: 'audio',
    status: 'draft',
  },
  removebg: {
    kind: 'tool',
    id: 'removebg',
    version: 1,
    artifactKind: 'image',
    label: 'Remove background',
    outputKind: 'image',
    status: 'published',
  },
  unmask: {
    kind: 'tool',
    id: 'unmask',
    version: 1,
    artifactKind: 'image',
    label: 'Unmask',
    outputKind: 'image',
    status: 'published',
  },
} as const satisfies Record<string, ToolRegistryEntry>;

export type ToolRegistryId = keyof typeof TOOL_REGISTRY;

export function listToolRegistryEntries(): ToolRegistryEntry[] {
  return Object.values(TOOL_REGISTRY);
}

export function listPublishedToolRegistryEntries(): ToolRegistryEntry[] {
  return listToolRegistryEntries().filter((entry) => entry.status === 'published');
}

export function getToolRegistryEntry(id: string): ToolRegistryEntry | null {
  return TOOL_REGISTRY[id as ToolRegistryId] ?? null;
}

export function getToolEntryRef(id: string): CapabilityEntryRef<'tool'> | null {
  const entry = getToolRegistryEntry(id);
  return entry
    ? {
        kind: entry.kind,
        id: entry.id,
        version: entry.version,
      }
    : null;
}

export function resolveToolEntryRef(id: string): CapabilityEntryRef<'tool'> {
  return getToolEntryRef(id) ?? { kind: 'tool', id, version: 1 };
}
