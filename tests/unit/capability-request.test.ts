import { describe, expect, it } from 'vitest';
import {
  resolveCapabilityRequest,
  type CapabilityRequestContext,
} from '@/lib/capability/request';

function makeContext(
  partial?: Partial<CapabilityRequestContext>
): CapabilityRequestContext {
  return {
    prompt: partial?.prompt ?? 'turn this image into a gaussian splat',
    hasSelectedImage: partial?.hasSelectedImage ?? true,
    definitions: partial?.definitions ?? [],
  };
}

describe('capability request resolver', () => {
  it('routes gaussian splat asks with a selected image to the spatial tool', () => {
    const plan = resolveCapabilityRequest(makeContext());

    expect(plan).toEqual({
      kind: 'tool',
      toolId: 'spatial-gen',
      artifactKind: 'spatial',
      spatialFormat: 'gaussian-splat',
      sourceMode: 'selected-image',
    });
  });

  it('recognizes particle language as the particle-field spatial mode', () => {
    const plan = resolveCapabilityRequest(
      makeContext({ prompt: 'turn this into particles on the canvas' })
    );

    expect(plan).toEqual({
      kind: 'tool',
      toolId: 'spatial-gen',
      artifactKind: 'spatial',
      spatialFormat: 'particle-field',
      sourceMode: 'selected-image',
    });
  });

  it('requires a selected image for spatial-from-image asks', () => {
    const plan = resolveCapabilityRequest(
      makeContext({ hasSelectedImage: false })
    );

    expect(plan).toEqual({
      kind: 'needs-selected-image',
      artifactKind: 'spatial',
      reason: 'Select an image on the canvas first to build a spatial draft from it.',
    });
  });

  it('invokes a matching pinned capability before falling back to the primitive tool', () => {
    const plan = resolveCapabilityRequest(
      makeContext({
        prompt: 'hero splat',
        definitions: [
          {
            id: 'cap_hero_splat',
            version: 2,
            createdAt: 1,
            name: 'hero splat',
            trigger: 'turn the selected image into a hero splat',
            paramSchema: { type: 'object', properties: { layerId: { type: 'string' } } },
            createdBy: 'agent',
            tool: 'spatial-gen',
            provider: 'draft',
            entryRef: { kind: 'tool', id: 'spatial-gen', version: 1 },
            runTemplate: {
              prompt: 'turn the selected image into a hero splat',
              artifactKind: 'spatial',
              format: 'gaussian-splat',
              quality: 'draft',
              sourceMode: 'selected-image',
            },
          },
        ],
      })
    );

    expect(plan).toEqual({
      kind: 'definition',
      definitionId: 'cap_hero_splat',
      artifactKind: 'spatial',
    });
  });

  it('falls back to image generation for non-spatial requests', () => {
    const plan = resolveCapabilityRequest(
      makeContext({ prompt: 'make a still life hero image' })
    );

    expect(plan).toEqual({
      kind: 'tool',
      toolId: 'image-gen',
      artifactKind: 'image',
    });
  });
});
