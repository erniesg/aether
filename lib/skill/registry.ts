import type {
  CapabilityEntryRef,
  CapabilityStatus,
} from '@/lib/capability/entry';
import type { ArtifactKind } from '@/lib/tool/registry';

export interface SkillRegistryEntry extends CapabilityEntryRef<'skill'> {
  artifactKind: ArtifactKind;
  label: string;
  trigger: string;
  baseEntryRef: CapabilityEntryRef<'tool' | 'workflow'>;
  status: CapabilityStatus;
}

const SKILL_REGISTRY = {
  'hero-image-draft': {
    kind: 'skill',
    id: 'hero-image-draft',
    version: 1,
    artifactKind: 'image',
    label: 'Hero image draft',
    trigger: 'draft a campaign key visual from the active input set',
    baseEntryRef: {
      kind: 'workflow',
      id: 'image-render-basic',
      version: 1,
    },
    status: 'published',
  },
  'airbrushed-name-visual': {
    kind: 'skill',
    id: 'airbrushed-name-visual',
    version: 1,
    artifactKind: 'image',
    label: 'Airbrushed name visual',
    trigger: 'use the confirmed sketch strokes as the name mark for a key visual',
    baseEntryRef: {
      kind: 'workflow',
      id: 'image-render-basic',
      version: 1,
    },
    status: 'draft',
  },
  'double-exposure-intro': {
    kind: 'skill',
    id: 'double-exposure-intro',
    version: 1,
    artifactKind: 'video',
    label: 'Double exposure intro',
    trigger: 'blend a portrait with a place plate into a short intro motion visual',
    baseEntryRef: {
      kind: 'workflow',
      id: 'motion-key-visual',
      version: 1,
    },
    status: 'draft',
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
