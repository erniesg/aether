import { describe, expect, it } from 'vitest';
import {
  planCapabilityFactoryAction,
  type CapabilityFactoryRequest,
  type CapabilityRegistrySnapshot,
} from '@/lib/capability/factory';

function makeRequest(
  partial?: Partial<CapabilityFactoryRequest>
): CapabilityFactoryRequest {
  return {
    prompt: partial?.prompt ?? 'turn this image into a gaussian splat hero effect',
    publishScope: partial?.publishScope ?? 'workspace',
    artifactKind: partial?.artifactKind ?? 'spatial',
  };
}

function makeSnapshot(
  partial?: Partial<CapabilityRegistrySnapshot>
): CapabilityRegistrySnapshot {
  return {
    skill: partial?.skill ?? null,
    workflow: partial?.workflow ?? null,
    tool: partial?.tool ?? null,
  };
}

describe('capability factory planner', () => {
  it('invokes an existing published skill when one already matches the request', () => {
    const plan = planCapabilityFactoryAction(
      makeRequest(),
      makeSnapshot({
        skill: {
          kind: 'skill',
          id: 'hero-splat',
          version: 3,
          status: 'published',
        },
      })
    );

    expect(plan.action).toBe('invoke-entry');
    expect(plan.entryRef).toEqual({
      kind: 'skill',
      id: 'hero-splat',
      version: 3,
    });
    expect(plan.humanReviewRequired).toBe(false);
  });

  it('authors a new skill over an existing tool and routes human review for team publication', () => {
    const plan = planCapabilityFactoryAction(
      makeRequest({ publishScope: 'team' }),
      makeSnapshot({
        tool: {
          kind: 'tool',
          id: 'spatial-gen',
          version: 1,
          status: 'published',
        },
      })
    );

    expect(plan.action).toBe('author-skill');
    expect(plan.baseEntryRef).toEqual({
      kind: 'tool',
      id: 'spatial-gen',
      version: 1,
    });
    expect(plan.humanReviewRequired).toBe(true);
    expect(plan.reviewRoute).toBe('route-human');
    expect(plan.reason).toMatch(/team/i);
  });

  it('authors a new tool when no executable entry exists for the requested artifact family', () => {
    const plan = planCapabilityFactoryAction(makeRequest(), makeSnapshot());

    expect(plan.action).toBe('author-tool');
    expect(plan.draftEntryKind).toBe('tool');
    expect(plan.humanReviewRequired).toBe(true);
    expect(plan.reviewRoute).toBe('route-human');
    expect(plan.reason).toMatch(/new execution primitive/i);
  });
});
