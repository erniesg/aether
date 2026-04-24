import { describe, expect, it } from 'vitest';
import {
  getToolEntryRef,
  getToolRegistryEntry,
  listPublishedToolRegistryEntries,
} from '@/lib/tool/registry';
import {
  getWorkflowRegistryEntry,
  listPublishedWorkflowRegistryEntries,
} from '@/lib/workflow/registry';
import {
  getSkillRegistryEntry,
  listPublishedSkillRegistryEntries,
} from '@/lib/skill/registry';

describe('typed capability registries', () => {
  it('resolves built-in tools with stable versioned entry refs', () => {
    expect(getToolRegistryEntry('image-gen')).toEqual({
      kind: 'tool',
      id: 'image-gen',
      version: 1,
      artifactKind: 'image',
      label: 'Image generation',
      outputKind: 'image',
      status: 'published',
    });

    expect(getToolEntryRef('image-gen')).toEqual({
      kind: 'tool',
      id: 'image-gen',
      version: 1,
    });
  });

  it('exposes published workflows over existing tool seams', () => {
    expect(getWorkflowRegistryEntry('cutout-clean-plate')).toEqual({
      kind: 'workflow',
      id: 'cutout-clean-plate',
      version: 1,
      artifactKind: 'image',
      label: 'Cutout with clean plate',
      toolIds: ['cutout', 'bg-fill'],
      status: 'published',
    });

    expect(listPublishedWorkflowRegistryEntries().map((entry) => entry.id)).toContain(
      'cutout-clean-plate'
    );
  });

  it('keeps draft motion/audio tools out of the published creator list', () => {
    expect(getToolRegistryEntry('video-gen')?.status).toBe('draft');
    expect(getToolRegistryEntry('audio-gen')?.status).toBe('draft');
    expect(listPublishedToolRegistryEntries().map((entry) => entry.id)).not.toContain(
      'video-gen'
    );
  });

  it('exposes creator-facing skills separately from runtime primitives', () => {
    expect(getSkillRegistryEntry('hero-image-draft')).toEqual({
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
    });

    expect(getSkillRegistryEntry('double-exposure-intro')?.status).toBe('draft');
    expect(listPublishedSkillRegistryEntries().map((entry) => entry.id)).toEqual([
      'hero-image-draft',
    ]);
  });
});
