import { describe, expect, it } from 'vitest';
import {
  getToolRegistryEntry,
  getToolEntryRef,
  listPublishedToolRegistryEntries,
} from '@/lib/tool/registry';
import { getWorkflowRegistryEntry } from '@/lib/workflow/registry';
import { getSkillRegistryEntry } from '@/lib/skill/registry';
import type { CapabilityTool } from '@/lib/capability/types';

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

  it('registers draft motion tools for agent-native video workflows', () => {
    const motionToolIds = [
      'motion-brief',
      'motion-storyboard',
      'motion-capture',
      'motion-visuals',
      'motion-voice',
      'motion-sync',
      'motion-preview-source',
      'motion-source-author',
      'motion-render',
      'motion-export-pack',
      'motion-interactive-export',
      'motion-revise',
      'motion-source-edit',
      'motion-agent-handoff',
      'motion-pin-capability',
    ] satisfies CapabilityTool[];

    for (const id of motionToolIds) {
      expect(getToolRegistryEntry(id)).toMatchObject({
        kind: 'tool',
        id,
        artifactKind: 'video',
        status: 'draft',
      });
    }
    expect(listPublishedToolRegistryEntries().map((entry) => entry.id)).not.toContain(
      'motion-render'
    );
  });

  it('registers reusable draft video workflows with review gates and engine hints', () => {
    expect(getWorkflowRegistryEntry('repo-launch-video')).toMatchObject({
      kind: 'workflow',
      id: 'repo-launch-video',
      artifactKind: 'video',
      label: 'Repo launch video',
      toolIds: [
        'motion-brief',
        'motion-storyboard',
        'motion-capture',
        'motion-visuals',
        'motion-voice',
        'motion-sync',
        'motion-revise',
        'motion-preview-source',
        'motion-source-author',
        'motion-source-edit',
        'motion-agent-handoff',
        'motion-render',
        'motion-export-pack',
        'motion-interactive-export',
      ],
      sourceKinds: ['repo', 'site', 'capture', 'reference'],
      engines: ['remotion', 'hyperframes', 'provider'],
      reviewGates: ['plan', 'drafts', 'capture', 'visuals', 'voice', 'timeline', 'render', 'export'],
      skillContract: {
        runModes: ['review', 'full-auto'],
        reviewArtifacts: [
          'video-plan',
          'draft-variations',
          'component-plan',
          'capture-plan',
          'visual-source-plan',
          'sync-plan',
          'render-proof',
          'export-pack',
        ],
        regenerationTargets: [
          'story-beat',
          'component',
          'capture',
          'caption',
          'voice-line',
          'timing',
          'effect',
          'whole-video',
        ],
        verificationArtifacts: [
          'contact-sheet',
          'mp4-probe',
          'poster',
          'subtitles',
          'transcript',
          'provenance-manifest',
        ],
      },
      status: 'draft',
    });

    expect(getWorkflowRegistryEntry('pr-to-video')).toMatchObject({
      id: 'pr-to-video',
      toolIds: [
        'motion-brief',
        'motion-storyboard',
        'motion-visuals',
        'motion-voice',
        'motion-sync',
        'motion-revise',
        'motion-preview-source',
        'motion-source-author',
        'motion-source-edit',
        'motion-agent-handoff',
        'motion-render',
        'motion-export-pack',
        'motion-interactive-export',
      ],
      sourceKinds: ['pr', 'repo'],
      engines: ['remotion', 'hyperframes'],
      reviewGates: ['plan', 'drafts', 'visuals', 'voice', 'timeline', 'render', 'export'],
      skillContract: {
        runModes: ['review', 'full-auto'],
        reviewArtifacts: [
          'video-plan',
          'draft-variations',
          'component-plan',
          'visual-source-plan',
          'sync-plan',
          'render-proof',
          'export-pack',
        ],
        regenerationTargets: [
          'story-beat',
          'component',
          'code-proof',
          'caption',
          'voice-line',
          'timing',
          'effect',
          'whole-video',
        ],
        verificationArtifacts: [
          'contact-sheet',
          'mp4-probe',
          'poster',
          'subtitles',
          'transcript',
          'provenance-manifest',
        ],
      },
      status: 'draft',
    });

    expect(getWorkflowRegistryEntry('remotion-hyperframes-port')).toMatchObject({
      id: 'remotion-hyperframes-port',
      sourceKinds: ['remotion', 'hyperframes'],
      engines: ['remotion', 'hyperframes'],
      status: 'draft',
    });
  });
});
