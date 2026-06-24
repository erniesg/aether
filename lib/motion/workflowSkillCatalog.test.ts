import { describe, expect, it } from 'vitest';
import { listWorkflowRegistryEntries } from '@/lib/workflow/registry';
import { getMotionComponent } from './componentRegistry';
import {
  getMotionWorkflowSkillRecipe,
  listMotionWorkflowSkillRecipes,
  type MotionWorkflowGenerationLane,
} from './workflowSkillCatalog';
import { listMotionReferencePatterns } from './referencePatterns';

const VALID_GENERATION_LANES = new Set<MotionWorkflowGenerationLane>([
  'repo-facts',
  'code-change',
  'capture',
  'visual-search',
  'image-to-video',
  'voice',
  'sync',
  'render',
  'export',
]);

describe('motion workflow skill catalog', () => {
  it('has a reusable recipe for every registered video workflow skill', () => {
    const workflowIds = listWorkflowRegistryEntries()
      .filter((workflow) => workflow.artifactKind === 'video' && workflow.status !== 'archived')
      .map((workflow) => workflow.id);

    expect(listMotionWorkflowSkillRecipes().map((recipe) => recipe.workflowId)).toEqual(
      workflowIds
    );

    for (const workflowId of workflowIds) {
      const recipe = getMotionWorkflowSkillRecipe(workflowId);
      expect(recipe).toMatchObject({
        workflowId,
        triggerPhrases: expect.any(Array),
        agentTaskLabels: expect.any(Array),
        draftVariations: expect.any(Array),
        componentSlots: expect.any(Array),
        reviewSurfaces: expect.any(Array),
      });
      expect(recipe?.triggerPhrases.length).toBeGreaterThan(0);
      expect(recipe?.agentTaskLabels.length).toBeGreaterThan(0);
      expect(recipe?.draftVariations.length).toBeGreaterThan(0);
      expect(recipe?.componentSlots.length).toBeGreaterThan(0);
      expect(recipe?.reviewSurfaces.length).toBeGreaterThan(0);
    }
  });

  it('keeps component slots valid and creator-facing', () => {
    const bannedCopy = /operator|dashboard|control plane|run inspector/i;

    for (const recipe of listMotionWorkflowSkillRecipes()) {
      const searchableCopy = [
        recipe.label,
        ...recipe.triggerPhrases,
        ...recipe.agentTaskLabels,
        recipe.reviewPolicy,
        recipe.fullAutoPolicy,
        ...recipe.draftVariations.flatMap((variation) => [
          variation.label,
          variation.angle,
          variation.reviewPrompt,
        ]),
        ...recipe.componentSlots.flatMap((slot) => [slot.label, slot.role, slot.reason]),
        ...recipe.referencePatterns.flatMap((pattern) => [
          pattern.label,
          pattern.purpose,
          ...pattern.sourceSignals,
          ...pattern.editSurfaces,
          ...pattern.verificationLabels,
        ]),
        ...recipe.reviewSurfaces.flatMap((surface) => [surface.label, surface.purpose]),
      ].join(' ');

      expect(searchableCopy).not.toMatch(bannedCopy);
      for (const slot of recipe.componentSlots) {
        expect(getMotionComponent(slot.componentId)).not.toBeNull();
        expect(slot.regenerateScopes.length).toBeGreaterThan(0);
      }
      for (const pattern of recipe.referencePatterns) {
        expect(pattern.componentIds.length).toBeGreaterThan(0);
        expect(pattern.editSurfaces.length).toBeGreaterThan(0);
        expect(pattern.verificationLabels.length).toBeGreaterThan(0);
        for (const componentId of pattern.componentIds) {
          expect(getMotionComponent(componentId)).not.toBeNull();
        }
        for (const lane of pattern.generationLanes) {
          expect(VALID_GENERATION_LANES.has(lane)).toBe(true);
        }
      }
    }
  });

  it('lists reusable product-video reference patterns for agents and creators', () => {
    const patterns = listMotionReferencePatterns();

    expect(patterns.map((pattern) => pattern.id)).toEqual([
      'launch-hook-title',
      'real-product-capture',
      'screen-zoom-callout',
      'caption-led-social',
      'proof-receipt-card',
      'code-diff-explainer',
      'before-after-feature',
      'agent-process-trace',
      'skill-drop-announcement',
      'terminal-command-proof',
      'image-to-video-insert',
      'voice-caption-sync',
      'multi-format-pack',
      'branded-template-system',
      'localized-caption-variant',
      'reusable-motion-system',
    ]);
    expect(patterns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'real-product-capture',
          componentIds: ['app-frame', 'soft-wipe'],
          generationLanes: ['capture', 'sync', 'render'],
        }),
        expect.objectContaining({
          id: 'screen-zoom-callout',
          componentIds: ['app-frame', 'cursor-callout', 'soft-wipe'],
          verificationLabels: expect.arrayContaining(['cursor target visible']),
        }),
        expect.objectContaining({
          id: 'before-after-feature',
          componentIds: ['split-screen-compare', 'app-frame', 'proof-card', 'soft-wipe'],
          verificationLabels: expect.arrayContaining(['before and after are distinct']),
        }),
        expect.objectContaining({
          id: 'skill-drop-announcement',
          componentIds: ['hook-card', 'command-card', 'proof-card', 'cta-card', 'caption-line'],
          verificationLabels: expect.arrayContaining(['install command visible']),
        }),
        expect.objectContaining({
          id: 'code-diff-explainer',
          componentIds: [
            'code-diff-card',
            'code-highlight-card',
            'code-scroll-card',
            'code-typing-card',
            'mechanism-diagram',
            'evidence-card',
          ],
          verificationLabels: expect.arrayContaining(['focus line readable']),
        }),
        expect.objectContaining({
          id: 'image-to-video-insert',
          generationLanes: ['image-to-video', 'sync', 'render'],
          verificationLabels: expect.arrayContaining(['timeline update receipt']),
        }),
        expect.objectContaining({
          id: 'voice-caption-sync',
          componentIds: ['voice-line', 'caption-line', 'avatar-bubble', 'soft-wipe'],
          verificationLabels: expect.arrayContaining(['word timing receipt']),
        }),
        expect.objectContaining({
          id: 'multi-format-pack',
          componentIds: ['contact-sheet-proof', 'cta-card', 'caption-line'],
          verificationLabels: expect.arrayContaining(['contact sheet proof']),
        }),
      ])
    );
  });
});
