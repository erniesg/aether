import { describe, expect, it } from 'vitest';
import {
  DEMO_CREATOR_CONTEXT,
  describeWorkspaceMode,
  summarizeInputSet,
} from '@/lib/context/model';

describe('creator context model', () => {
  it('separates stable context, campaign context, and run-time input assembly', () => {
    expect(DEMO_CREATOR_CONTEXT.brand.knowledgeSources).toHaveLength(4);
    expect(DEMO_CREATOR_CONTEXT.offer.claims).toHaveLength(3);
    expect(DEMO_CREATOR_CONTEXT.campaign.channels).toHaveLength(3);
    expect(DEMO_CREATOR_CONTEXT.inputSet.referenceCount).toBe(2);
    expect(DEMO_CREATOR_CONTEXT.inputSet.signalIds).toHaveLength(2);
    expect(summarizeInputSet(DEMO_CREATOR_CONTEXT)).toContain('brand');
    expect(summarizeInputSet(DEMO_CREATOR_CONTEXT)).toContain('campaign');
    expect(summarizeInputSet(DEMO_CREATOR_CONTEXT)).toContain('2 refs');
  });

  it('supports both creator-owned ventures and multi-brand studios', () => {
    expect(describeWorkspaceMode('venture')).toBe('creator-owned venture');
    expect(describeWorkspaceMode('studio')).toBe('multi-brand studio');
  });
});
