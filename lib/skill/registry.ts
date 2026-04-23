import type { CapabilityEntryRef } from '@/lib/capability/entry';

export interface SkillRegistryEntry extends CapabilityEntryRef<'skill'> {
  artifactKind: string;
  label: string;
  baseEntryRef: CapabilityEntryRef<'tool' | 'workflow'>;
  status: 'draft' | 'published' | 'archived';
}

const SKILL_REGISTRY = {
  'hero-image-draft': {
    kind: 'skill',
    id: 'hero-image-draft',
    version: 1,
    artifactKind: 'image',
    label: 'Hero image draft',
    baseEntryRef: {
      kind: 'workflow',
      id: 'image-render-basic',
      version: 1,
    },
    status: 'published',
  },
} as const satisfies Record<string, SkillRegistryEntry>;

export type SkillRegistryId = keyof typeof SKILL_REGISTRY;

export function listSkillRegistryEntries(): SkillRegistryEntry[] {
  return Object.values(SKILL_REGISTRY);
}

export function listPublishedSkillRegistryEntries(): SkillRegistryEntry[] {
  return listSkillRegistryEntries().filter((entry) => entry.status === 'published');
}

export function getSkillRegistryEntry(id: string): SkillRegistryEntry | null {
  return SKILL_REGISTRY[id as SkillRegistryId] ?? null;
}
