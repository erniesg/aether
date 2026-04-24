import type { CapabilityDefinitionRecord } from './types';

export interface CapabilityRequestContext {
  prompt: string;
  hasSelectedImage: boolean;
  definitions: CapabilityDefinitionRecord[];
}

export type CapabilityRequestPlan =
  | {
      kind: 'definition';
      definitionId: string;
      artifactKind: 'image' | 'spatial';
    }
  | {
      kind: 'factory';
      artifactKind: 'spatial';
      publishScope: 'team';
      draftToolId: 'spatial-gen';
      spatialFormat: 'particle-field' | 'gaussian-splat';
      sourceMode: 'selected-image';
    }
  | {
      kind: 'tool';
      toolId: 'image-gen' | 'spatial-gen';
      artifactKind: 'image' | 'spatial';
      spatialFormat?: 'particle-field' | 'gaussian-splat';
      sourceMode?: 'selected-image';
    }
  | {
      kind: 'needs-selected-image';
      artifactKind: 'spatial';
      reason: string;
    };

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/[^\w\s-]+/g, ' ').replace(/\s+/g, ' ');
}

function isSpatialPrompt(prompt: string): boolean {
  return /\b(gaussian splat|gaussian-splat|splat|particle field|particles?)\b/i.test(prompt);
}

function resolveSpatialFormat(prompt: string): 'particle-field' | 'gaussian-splat' {
  return /\b(particle field|particles?)\b/i.test(prompt) ? 'particle-field' : 'gaussian-splat';
}

function definitionArtifactKind(definition: CapabilityDefinitionRecord): 'image' | 'spatial' {
  return definition.tool === 'spatial-gen' || definition.runTemplate.artifactKind === 'spatial'
    ? 'spatial'
    : 'image';
}

function matchesDefinition(prompt: string, definition: CapabilityDefinitionRecord): boolean {
  const normalizedPrompt = normalize(prompt);
  const normalizedName = normalize(definition.name);
  const normalizedTrigger = normalize(definition.trigger);

  return (
    normalizedPrompt === normalizedName ||
    normalizedPrompt === normalizedTrigger ||
    normalizedPrompt.includes(normalizedName) ||
    normalizedPrompt.includes(normalizedTrigger)
  );
}

export function resolveCapabilityRequest(
  context: CapabilityRequestContext
): CapabilityRequestPlan {
  for (const definition of context.definitions) {
    if (!matchesDefinition(context.prompt, definition)) continue;
    const artifactKind = definitionArtifactKind(definition);
    if (artifactKind === 'spatial' && !context.hasSelectedImage) {
      return {
        kind: 'needs-selected-image',
        artifactKind: 'spatial',
        reason: 'Select an image on the canvas first to build a spatial draft from it.',
      };
    }
    return {
      kind: 'definition',
      definitionId: definition.id,
      artifactKind,
    };
  }

  if (isSpatialPrompt(context.prompt)) {
    if (!context.hasSelectedImage) {
      return {
        kind: 'needs-selected-image',
        artifactKind: 'spatial',
        reason: 'Select an image on the canvas first to build a spatial draft from it.',
      };
    }
    return {
      kind: 'factory',
      artifactKind: 'spatial',
      publishScope: 'team',
      draftToolId: 'spatial-gen',
      spatialFormat: resolveSpatialFormat(context.prompt),
      sourceMode: 'selected-image',
    };
  }

  return {
    kind: 'tool',
    toolId: 'image-gen',
    artifactKind: 'image',
  };
}
