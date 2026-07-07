import { describe, expect, it } from 'vitest';
import {
  getToolEntryRef,
  getToolRegistryEntry,
  listPublishedToolRegistryEntries,
} from '@/lib/tool/registry';
import {
  getWorkflowRegistryEntry,
  listPublishedWorkflowRegistryEntries,
  listWorkflowRegistryEntries,
} from '@/lib/workflow/registry';
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
      status: 'published',
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
      status: 'published',
    });
  });

  it('lists and resolves the repo-to-deck planning workflow contract', () => {
    expect(listWorkflowRegistryEntries().map((entry) => entry.id)).toContain('repo-to-deck');

    expect(getWorkflowRegistryEntry('repo-to-deck')).toEqual({
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
    });
  });

  it('keeps the published image workflow registry unchanged', () => {
    expect(listPublishedWorkflowRegistryEntries()).toEqual([
      {
        kind: 'workflow',
        id: 'image-render-basic',
        version: 1,
        artifactKind: 'image',
        label: 'Basic image render',
        toolIds: ['image-gen'],
        status: 'published',
      },
    ]);
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
      status: 'published',
    });
  });

  it('keeps spatial-gen out of the published creator tool list until the factory publishes it', () => {
    expect(getToolRegistryEntry('spatial-gen')).toEqual({
      kind: 'tool',
      id: 'spatial-gen',
      version: 1,
      artifactKind: 'spatial',
      label: 'Spatial generation',
      outputKind: 'image',
      status: 'draft',
    });

    expect(listPublishedToolRegistryEntries().map((entry) => entry.id)).not.toContain('spatial-gen');
  });
});
