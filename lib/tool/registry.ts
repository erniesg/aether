import type { CapabilityEntryRef } from '@/lib/capability/entry';

/**
 * Artifact kinds the capability system can produce. New kinds get added here
 * first so the registry, the capability types, and the Convex validator can
 * all widen in lockstep. Do not inline these literals anywhere else.
 */
export type ArtifactKind = 'image' | 'video' | 'audio' | 'spatial' | 'text-overlay';

export interface ToolRegistryEntry extends CapabilityEntryRef<'tool'> {
  artifactKind: ArtifactKind;
  label: string;
  outputKind: ArtifactKind;
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
  'text-apply': {
    kind: 'tool',
    id: 'text-apply',
    version: 1,
    artifactKind: 'text-overlay',
    label: 'Text apply',
    outputKind: 'text-overlay',
    status: 'draft',
  },
  'signals-search': {
    kind: 'tool',
    id: 'signals-search',
    version: 1,
    artifactKind: 'image',
    label: 'Signals search',
    outputKind: 'image',
    status: 'draft',
  },
  'clusters-run': {
    kind: 'tool',
    id: 'clusters-run',
    version: 1,
    artifactKind: 'image',
    label: 'Cluster references',
    outputKind: 'image',
    status: 'draft',
  },
  'video-understand': {
    kind: 'tool',
    id: 'video-understand',
    version: 1,
    artifactKind: 'video',
    label: 'Video understanding',
    outputKind: 'video',
    status: 'draft',
  },
  'motion-brief': {
    kind: 'tool',
    id: 'motion-brief',
    version: 1,
    artifactKind: 'video',
    label: 'Motion brief',
    outputKind: 'video',
    status: 'draft',
  },
  'motion-storyboard': {
    kind: 'tool',
    id: 'motion-storyboard',
    version: 1,
    artifactKind: 'video',
    label: 'Storyboard composer',
    outputKind: 'video',
    status: 'draft',
  },
  'motion-capture': {
    kind: 'tool',
    id: 'motion-capture',
    version: 1,
    artifactKind: 'video',
    label: 'Product capture',
    outputKind: 'video',
    status: 'draft',
  },
  'motion-visuals': {
    kind: 'tool',
    id: 'motion-visuals',
    version: 1,
    artifactKind: 'video',
    label: 'Visual generation',
    outputKind: 'video',
    status: 'draft',
  },
  'motion-voice': {
    kind: 'tool',
    id: 'motion-voice',
    version: 1,
    artifactKind: 'video',
    label: 'Voiceover',
    outputKind: 'audio',
    status: 'draft',
  },
  'motion-sync': {
    kind: 'tool',
    id: 'motion-sync',
    version: 1,
    artifactKind: 'video',
    label: 'Motion sync',
    outputKind: 'video',
    status: 'draft',
  },
  'motion-render': {
    kind: 'tool',
    id: 'motion-render',
    version: 1,
    artifactKind: 'video',
    label: 'Motion render',
    outputKind: 'video',
    status: 'draft',
  },
  'motion-preview-source': {
    kind: 'tool',
    id: 'motion-preview-source',
    version: 1,
    artifactKind: 'video',
    label: 'Preview source',
    outputKind: 'video',
    status: 'draft',
  },
  'motion-export-pack': {
    kind: 'tool',
    id: 'motion-export-pack',
    version: 1,
    artifactKind: 'video',
    label: 'Export pack',
    outputKind: 'video',
    status: 'draft',
  },
  'motion-revise': {
    kind: 'tool',
    id: 'motion-revise',
    version: 1,
    artifactKind: 'video',
    label: 'Timeline revise',
    outputKind: 'video',
    status: 'draft',
  },
  'motion-source-edit': {
    kind: 'tool',
    id: 'motion-source-edit',
    version: 1,
    artifactKind: 'video',
    label: 'Source edit apply',
    outputKind: 'video',
    status: 'draft',
  },
  'motion-pin-capability': {
    kind: 'tool',
    id: 'motion-pin-capability',
    version: 1,
    artifactKind: 'video',
    label: 'Pin motion capability',
    outputKind: 'video',
    status: 'draft',
  },
  'post-capture': {
    kind: 'tool',
    id: 'post-capture',
    version: 1,
    artifactKind: 'image',
    label: 'Post capture',
    outputKind: 'image',
    status: 'draft',
  },
  // NOTE: `datetime` is intentionally NOT in the registry — registry entries
  // require an `artifactKind` from the canvas-artifact union, but datetime is
  // an agent-context tool that never produces a canvas artifact. The
  // resolveToolEntryRef fallback (`{ kind:'tool', id, version:1 }`) is used
  // for these context-class tools instead.
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
