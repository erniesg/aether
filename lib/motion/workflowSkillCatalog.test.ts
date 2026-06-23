import { describe, expect, it } from 'vitest';
import { listWorkflowRegistryEntries } from '@/lib/workflow/registry';
import { getMotionComponent } from './componentRegistry';
import {
  getMotionWorkflowSkillRecipe,
  listMotionWorkflowSkillRecipes,
} from './workflowSkillCatalog';

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
        ...recipe.reviewSurfaces.flatMap((surface) => [surface.label, surface.purpose]),
      ].join(' ');

      expect(searchableCopy).not.toMatch(bannedCopy);
      for (const slot of recipe.componentSlots) {
        expect(getMotionComponent(slot.componentId)).not.toBeNull();
        expect(slot.regenerateScopes.length).toBeGreaterThan(0);
      }
    }
  });
});
