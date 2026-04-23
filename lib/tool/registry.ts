import type { CapabilityEntryRef } from '@/lib/capability/entry';

export interface ToolRegistryEntry extends CapabilityEntryRef<'tool'> {
  artifactKind: string;
  label: string;
  outputKind: 'image';
}

const TOOL_REGISTRY = {
  'image-gen': {
    kind: 'tool',
    id: 'image-gen',
    version: 1,
    artifactKind: 'image',
    label: 'Image generation',
    outputKind: 'image',
  },
  'image-edit': {
    kind: 'tool',
    id: 'image-edit',
    version: 1,
    artifactKind: 'image',
    label: 'Image edit',
    outputKind: 'image',
  },
  'bg-fill': {
    kind: 'tool',
    id: 'bg-fill',
    version: 1,
    artifactKind: 'image',
    label: 'Background fill',
    outputKind: 'image',
  },
  cutout: {
    kind: 'tool',
    id: 'cutout',
    version: 1,
    artifactKind: 'image',
    label: 'Cutout',
    outputKind: 'image',
  },
  relight: {
    kind: 'tool',
    id: 'relight',
    version: 1,
    artifactKind: 'image',
    label: 'Relight',
    outputKind: 'image',
  },
  'spatial-gen': {
    kind: 'tool',
    id: 'spatial-gen',
    version: 1,
    artifactKind: 'spatial',
    label: 'Spatial generation',
    outputKind: 'image',
  },
} as const satisfies Record<string, ToolRegistryEntry>;

export type ToolRegistryId = keyof typeof TOOL_REGISTRY;

export function listToolRegistryEntries(): ToolRegistryEntry[] {
  return Object.values(TOOL_REGISTRY);
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
