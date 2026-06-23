import { describe, expect, it } from 'vitest';
import {
  getMotionComponent,
  listMotionComponents,
  motionComponentIds,
} from './componentRegistry';

describe('motion component registry', () => {
  it('ships the first five reusable repo-video components', () => {
    expect(motionComponentIds()).toEqual([
      'hook-card',
      'app-frame',
      'agent-trace',
      'proof-card',
      'cta-card',
    ]);
  });

  it('marks engines and aspect ratios per component', () => {
    const hook = getMotionComponent('hook-card');
    expect(hook?.engines).toEqual(['remotion', 'hyperframes']);
    expect(hook?.aspectRatios).toContain('9:16');
    expect(hook?.editControls.map((control) => control.id)).toContain('headline');
  });

  it('keeps every component creator-facing', () => {
    for (const component of listMotionComponents()) {
      expect(component.label).not.toMatch(/pipeline|operator|dashboard|control plane/i);
      expect(component.requiredProps.length).toBeGreaterThan(0);
    }
  });

  it('declares scoped regeneration affordances for each component', () => {
    const appFrame = getMotionComponent('app-frame');
    expect(appFrame?.regenerateScopes).toEqual(['capture', 'timing', 'caption']);

    for (const component of listMotionComponents()) {
      expect(component.regenerateScopes.length).toBeGreaterThan(0);
      expect(component.regenerateScopes).not.toContain('whole-video');
    }
  });
});
