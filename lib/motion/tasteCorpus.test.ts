import { describe, expect, it } from 'vitest';
import { getMotionComponent } from './componentRegistry';
import {
  listMotionTasteCorpus,
  listMotionTasteCorpusForWorkflow,
  type MotionTasteCorpusEntry,
  validateMotionTasteCorpus,
} from './tasteCorpus';
import { getWorkflowRegistryEntry } from '@/lib/workflow/registry';

describe('motion taste corpus', () => {
  it('keeps timestamped shot lists mapped to workflow and component primitives', () => {
    const entries = listMotionTasteCorpus();

    expect(entries.length).toBeGreaterThanOrEqual(3);
    expect(validateMotionTasteCorpus(entries)).toEqual([]);

    for (const entry of entries) {
      expect(entry.sourceUrl).toMatch(/^https?:\/\//);
      expect(entry.targetCrops.length).toBeGreaterThan(0);
      expect(entry.componentIds.length).toBeGreaterThan(0);
      expect(entry.regenerateScopes.length).toBeGreaterThan(0);
      expect(entry.shotList.length).toBeGreaterThanOrEqual(4);
      expect(entry.shotList[0].startSeconds).toBe(0);
      expect(entry.shotList.at(-1)?.endSeconds).toBeGreaterThan(entry.shotList[0].startSeconds);

      for (const componentId of entry.componentIds) {
        expect(getMotionComponent(componentId), `${entry.id} -> ${componentId}`).not.toBeNull();
      }
      for (const workflowId of entry.workflowIds) {
        expect(
          getWorkflowRegistryEntry(workflowId),
          `${entry.id} -> ${workflowId}`
        ).not.toBeNull();
      }
      for (const shot of entry.shotList) {
        expect(shot.endSeconds).toBeGreaterThan(shot.startSeconds);
        expect(shot.componentIds.length).toBeGreaterThan(0);
        expect(shot.editTargets.length).toBeGreaterThan(0);
      }
    }
  });

  it('keeps playback-reviewed examples for agent demos, skill-launch cuts, and polished product demos', () => {
    const entries = listMotionTasteCorpus();
    const requiredExamples = [
      { id: 'claude-agent-demo-playback-review', label: 'agent product demo' },
      { id: 'hyperframes-pr-to-video-skill-drop', label: 'skill-launch social cut' },
      { id: 'screen-studio-product-demo-polish', label: 'polished product demo' },
    ];

    for (const required of requiredExamples) {
      const entry = entries.find((candidate) => candidate.id === required.id);

      expect(entry, required.label).toBeDefined();
      assertPlaybackReviewedTasteEntry(entry as MotionTasteCorpusEntry, required.label);
    }
  });

  it('pins the HyperFrames PR launch snippet as a reviewable skill-drop cut', () => {
    const prTaste = listMotionTasteCorpusForWorkflow('pr-to-video');

    expect(prTaste.map((entry) => entry.id)).toContain('hyperframes-pr-to-video-skill-drop');
    expect(
      prTaste.find((entry) => entry.id === 'hyperframes-pr-to-video-skill-drop')
    ).toMatchObject({
      sourceEntryId: 'hyperframes-pr-to-video-launch-note',
      reviewStatus: 'playback-reviewed',
      proofBoundary: 'public-video-playback',
      hookType: 'pain-point',
      targetCrops: expect.arrayContaining(['9:16', '4:5']),
      componentIds: expect.arrayContaining(['hook-card', 'command-card', 'code-diff-card']),
      regenerateScopes: expect.arrayContaining(['copy', 'code', 'timing', 'effect']),
    });
  });

  it('keeps public agent demo videos playback-reviewed for repo launches', () => {
    const repoLaunchTaste = listMotionTasteCorpusForWorkflow('repo-launch-video');

    expect(repoLaunchTaste).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'claude-agent-demo-playback-review',
          platform: 'youtube',
          reviewStatus: 'playback-reviewed',
          proofBoundary: 'public-video-playback',
          shotList: expect.arrayContaining([
            expect.objectContaining({
              componentIds: expect.arrayContaining(['agent-trace', 'terminal-card']),
              editTargets: expect.arrayContaining(['proof', 'timing']),
            }),
          ]),
        }),
      ])
    );
  });

  it('maps website-to-video product references to device, brand, flow, and hotspot primitives', () => {
    const websiteTaste = listMotionTasteCorpusForWorkflow('website-to-video');

    expect(websiteTaste).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'hyperframes-website-to-video-production-source',
          platform: 'github',
          reviewStatus: 'needs-public-playback',
          proofBoundary: 'public-repo',
          componentIds: expect.arrayContaining([
            'device-frame',
            'logo-motion',
            'flow-diagram',
            'hotspot-marker',
          ]),
          regenerateScopes: expect.arrayContaining([
            'capture',
            'asset',
            'diagram',
            'effect',
          ]),
          shotList: expect.arrayContaining([
            expect.objectContaining({
              componentIds: expect.arrayContaining(['device-frame', 'hotspot-marker']),
              editTargets: expect.arrayContaining(['capture', 'timing']),
            }),
            expect.objectContaining({
              componentIds: expect.arrayContaining(['flow-diagram', 'logo-motion']),
              editTargets: expect.arrayContaining(['diagram', 'effect']),
            }),
          ]),
        }),
      ])
    );
  });

  it('adds public product-story and AI-editor references for reviewable draft planning', () => {
    const featureTaste = listMotionTasteCorpusForWorkflow('feature-social-video');

    expect(featureTaste).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'arcade-product-story-ai-videos',
          reviewStatus: 'needs-public-playback',
          proofBoundary: 'accessible-page',
          hookType: 'product-name',
          componentIds: expect.arrayContaining([
            'app-frame',
            'hotspot-marker',
            'flow-diagram',
            'voice-line',
          ]),
          regenerateScopes: expect.arrayContaining([
            'capture',
            'diagram',
            'caption',
            'timing',
          ]),
          shotList: expect.arrayContaining([
            expect.objectContaining({
              componentIds: expect.arrayContaining(['hotspot-marker']),
              editTargets: expect.arrayContaining(['capture', 'caption']),
            }),
          ]),
        }),
        expect.objectContaining({
          id: 'descript-ai-editor-regenerate-speech',
          reviewStatus: 'needs-public-playback',
          proofBoundary: 'accessible-page',
          hookType: 'before-after',
          componentIds: expect.arrayContaining([
            'voice-line',
            'caption-line',
            'avatar-bubble',
            'split-screen-compare',
          ]),
          regenerateScopes: expect.arrayContaining([
            'copy',
            'caption',
            'timing',
            'asset',
          ]),
          shotList: expect.arrayContaining([
            expect.objectContaining({
              componentIds: expect.arrayContaining(['voice-line', 'caption-line']),
              editTargets: expect.arrayContaining(['copy', 'caption']),
            }),
          ]),
        }),
      ])
    );
  });

  it('keeps computer-use capture as an explicitly guarded taste reference', () => {
    const repoTaste = listMotionTasteCorpusForWorkflow('repo-launch-video');

    expect(repoTaste).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'anthropic-computer-use-capture-boundary',
          reviewStatus: 'needs-public-playback',
          proofBoundary: 'accessible-page',
          hookType: 'agent-action',
          componentIds: expect.arrayContaining([
            'agent-trace',
            'app-frame',
            'proof-card',
            'contact-sheet-proof',
          ]),
          regenerateScopes: expect.arrayContaining(['capture', 'proof', 'timing']),
          shotList: expect.arrayContaining([
            expect.objectContaining({
              componentIds: expect.arrayContaining(['agent-trace', 'app-frame']),
              editTargets: expect.arrayContaining(['capture', 'proof']),
            }),
          ]),
        }),
      ])
    );
  });
});

function assertPlaybackReviewedTasteEntry(entry: MotionTasteCorpusEntry, label: string) {
  expect(entry.reviewStatus, label).toBe('playback-reviewed');
  expect(entry.sourceUrl, label).toMatch(/^https?:\/\//);
  expect(entry.proofBoundary, label).toBeTruthy();
  expect(entry.targetCrops.length, label).toBeGreaterThan(0);
  expect(entry.hookType, label).toBeTruthy();
  expect(entry.componentIds.length, label).toBeGreaterThan(0);
  expect(entry.effectTags.length, label).toBeGreaterThan(0);

  expect(
    entry.shotList.some((shot) => shot.componentIds.length > 0),
    `${label} component ids`
  ).toBe(true);
  expect(
    entry.shotList.some((shot) => shot.effectTags.length > 0),
    `${label} effect tags`
  ).toBe(true);
  expect(
    entry.shotList.some((shot) => shot.captionStyle !== 'none'),
    `${label} caption style`
  ).toBe(true);
  expect(
    entry.shotList.some((shot) => Boolean(shot.transitionOut)),
    `${label} transition notes`
  ).toBe(true);
  expect(
    entry.shotList.some(
      (shot) => shot.componentIds.includes('cta-card') || shot.editTargets.includes('cta')
    ),
    `${label} CTA`
  ).toBe(true);

  let previousEnd = 0;
  for (const shot of entry.shotList) {
    expect(shot.startSeconds, `${label} shot order`).toBeGreaterThanOrEqual(previousEnd);
    expect(shot.endSeconds, `${label} ${shot.id}`).toBeGreaterThan(shot.startSeconds);
    previousEnd = shot.endSeconds;
  }
}
