import { describe, expect, it } from 'vitest';
import { getMotionComponent } from './componentRegistry';
import {
  corpusEntriesNeedingAuthenticatedReview,
  listMotionReferenceCorpus,
  validateMotionReferenceCorpus,
} from './referenceCorpus';
import { getWorkflowRegistryEntry } from '@/lib/workflow/registry';

describe('motion reference corpus', () => {
  it('keeps the accessible research matrix valid and source-backed', () => {
    const entries = listMotionReferenceCorpus();

    expect(entries.length).toBeGreaterThanOrEqual(8);
    expect(validateMotionReferenceCorpus(entries)).toEqual([]);
    for (const entry of entries) {
      expect(entry.sourceUrl).toMatch(/^https?:\/\//);
      expect(entry.observedPrimitives.length).toBeGreaterThan(0);
      expect(entry.tags.length).toBeGreaterThan(0);
      expect(entry.aetherImplication).toContain(' ');
    }
  });

  it('maps observed primitives to registered motion components and workflows', () => {
    const entries = listMotionReferenceCorpus();

    for (const entry of entries) {
      for (const componentId of entry.componentIds) {
        expect(getMotionComponent(componentId), `${entry.id} -> ${componentId}`).not.toBeNull();
      }
      for (const workflowId of entry.workflowIds) {
        expect(
          getWorkflowRegistryEntry(workflowId),
          `${entry.id} -> ${workflowId}`
        ).not.toBeNull();
      }
    }
  });

  it('tracks the authenticated X video corpus as an explicit proof boundary', () => {
    const needsAuth = corpusEntriesNeedingAuthenticatedReview();

    expect(needsAuth.map((entry) => entry.id)).toContain('authenticated-x-launch-corpus');
    expect(
      needsAuth.find((entry) => entry.id === 'authenticated-x-launch-corpus')?.tags
    ).toEqual(expect.arrayContaining(['capture', 'caption', 'proof']));
  });
});
