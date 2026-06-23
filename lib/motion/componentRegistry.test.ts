import { describe, expect, it } from 'vitest';
import {
  getMotionComponent,
  listMotionComponents,
  motionComponentIds,
} from './componentRegistry';

describe('motion component registry', () => {
  it('ships reusable repo-video, caption, voice, and transition components', () => {
    expect(motionComponentIds()).toEqual([
      'hook-card',
      'app-frame',
      'agent-trace',
      'proof-card',
      'code-diff-card',
      'mechanism-diagram',
      'evidence-card',
      'cta-card',
      'caption-line',
      'voice-line',
      'soft-wipe',
    ]);
  });

  it('marks engines and aspect ratios per component', () => {
    const hook = getMotionComponent('hook-card');
    expect(hook?.engines).toEqual(['remotion', 'hyperframes']);
    expect(hook?.aspectRatios).toContain('9:16');
    expect(hook?.editControls.map((control) => control.id)).toContain('headline');

    const codeDiff = getMotionComponent('code-diff-card');
    expect(codeDiff?.requiredProps).toEqual(['filePath', 'lines']);
    expect(codeDiff?.regenerateScopes).toContain('code');

    const mechanism = getMotionComponent('mechanism-diagram');
    expect(mechanism?.editControls.map((control) => control.id)).toContain('diagramKind');
    expect(mechanism?.regenerateScopes).toContain('diagram');
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

    const softWipe = getMotionComponent('soft-wipe');
    expect(softWipe?.regenerateScopes).toEqual(['effect', 'timing']);

    for (const component of listMotionComponents()) {
      expect(component.regenerateScopes.length).toBeGreaterThan(0);
      expect(component.regenerateScopes).not.toContain('whole-video');
    }
  });
});
