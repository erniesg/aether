/**
 * factory.test.ts — AC3: factory emits draftSkillRef when action is author-skill.
 *
 * Kept alongside the existing tests/unit/capability-factory.test.ts which tests
 * the core planner logic. This file tests the new draftSkillRef emission.
 */

import { describe, expect, it } from 'vitest';
import {
  planCapabilityFactoryAction,
  type CapabilityFactoryRequest,
  type CapabilityRegistrySnapshot,
} from './factory';

function makeRequest(partial?: Partial<CapabilityFactoryRequest>): CapabilityFactoryRequest {
  return {
    prompt: partial?.prompt ?? 'make a neon drench effect',
    publishScope: partial?.publishScope ?? 'workspace',
    artifactKind: partial?.artifactKind ?? 'image',
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

describe('planCapabilityFactoryAction — draftSkillRef emission', () => {
  it('includes a draftSkillRef when action is author-skill', () => {
    const plan = planCapabilityFactoryAction(
      makeRequest(),
      makeSnapshot({
        tool: {
          kind: 'tool',
          id: 'image-gen',
          version: 1,
          status: 'published',
        },
      })
    );

    expect(plan.action).toBe('author-skill');
    expect(plan.draftSkillRef).toBeDefined();
    expect(plan.draftSkillRef?.kind).toBe('skill');
    // id is deterministically derived from the request
    expect(typeof plan.draftSkillRef?.id).toBe('string');
    expect(plan.draftSkillRef?.id.length).toBeGreaterThan(0);
    // version is always 1 for a draft
    expect(plan.draftSkillRef?.version).toBe(1);
    // manifestPath points to the expected skills directory
    expect(plan.draftSkillRef?.manifestPath).toContain('lib/agent/skills');
  });

  it('draftSkillRef id is kebab-cased and derived from prompt', () => {
    const plan = planCapabilityFactoryAction(
      makeRequest({ prompt: 'neon drench with ambient wash' }),
      makeSnapshot({
        tool: {
          kind: 'tool',
          id: 'image-gen',
          version: 1,
          status: 'published',
        },
      })
    );

    expect(plan.draftSkillRef?.id).toMatch(/^[a-z0-9-]+$/);
  });

  it('does NOT include draftSkillRef when action is invoke-entry', () => {
    const plan = planCapabilityFactoryAction(
      makeRequest(),
      makeSnapshot({
        skill: {
          kind: 'skill',
          id: 'hero-image-draft',
          version: 1,
          status: 'published',
        },
      })
    );

    expect(plan.action).toBe('invoke-entry');
    expect(plan.draftSkillRef).toBeUndefined();
  });

  it('does NOT include draftSkillRef when action is author-tool', () => {
    const plan = planCapabilityFactoryAction(makeRequest(), makeSnapshot());

    expect(plan.action).toBe('author-tool');
    expect(plan.draftSkillRef).toBeUndefined();
  });
});
