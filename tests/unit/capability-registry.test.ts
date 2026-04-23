import { describe, expect, it } from 'vitest';
import { getToolEntryRef, getToolRegistryEntry } from '@/lib/tool/registry';
import { getWorkflowRegistryEntry } from '@/lib/workflow/registry';
import { getSkillRegistryEntry } from '@/lib/skill/registry';

describe('typed capability registries', () => {
  it('resolves the built-in image generation tool with a stable versioned entry ref', () => {
    expect(getToolRegistryEntry('image-gen')).toEqual({
      kind: 'tool',
      id: 'image-gen',
      version: 1,
      artifactKind: 'image',
      label: 'Image generation',
      outputKind: 'image',
    });

    expect(getToolEntryRef('image-gen')).toEqual({
      kind: 'tool',
      id: 'image-gen',
      version: 1,
    });
  });

  it('exposes a typed workflow over registered tools', () => {
    expect(getWorkflowRegistryEntry('image-render-basic')).toEqual({
      kind: 'workflow',
      id: 'image-render-basic',
      version: 1,
      artifactKind: 'image',
      label: 'Basic image render',
      toolIds: ['image-gen'],
    });
  });

  it('exposes a creator-facing skill over a registered base entry', () => {
    expect(getSkillRegistryEntry('hero-image-draft')).toEqual({
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
    });
  });
});
