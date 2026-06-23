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
      'command-card',
      'proof-card',
      'terminal-card',
      'social-overlay',
      'ui-reveal-frame',
      'data-visual-card',
      'code-diff-card',
      'mechanism-diagram',
      'evidence-card',
      'cta-card',
      'caption-line',
      'voice-line',
      'soft-wipe',
      'shader-wipe',
      'outro-slate',
    ]);
  });

  it('marks engines and aspect ratios per component', () => {
    const hook = getMotionComponent('hook-card');
    expect(hook?.engines).toEqual(['remotion', 'hyperframes']);
    expect(hook?.aspectRatios).toContain('9:16');
    expect(hook?.editControls.map((control) => control.id)).toContain('headline');
    expect(hook?.editControls.map((control) => control.id)).toContain('effectPreset');

    const codeDiff = getMotionComponent('code-diff-card');
    expect(codeDiff?.requiredProps).toEqual(['filePath', 'lines']);
    expect(codeDiff?.regenerateScopes).toContain('code');

    const mechanism = getMotionComponent('mechanism-diagram');
    expect(mechanism?.editControls.map((control) => control.id)).toContain('diagramKind');
    expect(mechanism?.regenerateScopes).toContain('diagram');

    const command = getMotionComponent('command-card');
    expect(command?.engines).toEqual(['remotion', 'hyperframes']);
    expect(command?.requiredProps).toEqual(['command', 'context']);
    expect(command?.editControls.map((control) => control.id)).toEqual([
      'command',
      'context',
      'accentColor',
      'effectPreset',
    ]);

    const terminal = getMotionComponent('terminal-card');
    expect(terminal?.engines).toEqual(['remotion', 'hyperframes']);
    expect(terminal?.requiredProps).toEqual(['command', 'result']);
    expect(terminal?.editControls.map((control) => control.id)).toEqual([
      'command',
      'result',
      'accentColor',
      'effectPreset',
    ]);
    expect(terminal?.regenerateScopes).toEqual(['proof', 'copy', 'timing', 'effect']);

    const socialOverlay = getMotionComponent('social-overlay');
    expect(socialOverlay?.requiredProps).toEqual(['headline', 'platform']);
    expect(socialOverlay?.regenerateScopes).toEqual(['copy', 'caption', 'effect']);

    const uiReveal = getMotionComponent('ui-reveal-frame');
    expect(uiReveal?.requiredProps).toEqual(['assetId', 'revealLabel']);
    expect(uiReveal?.regenerateScopes).toEqual(['capture', 'timing', 'effect']);

    const dataVisual = getMotionComponent('data-visual-card');
    expect(dataVisual?.requiredProps).toEqual(['metric', 'label']);
    expect(dataVisual?.regenerateScopes).toEqual(['proof', 'copy', 'effect']);

    const shaderWipe = getMotionComponent('shader-wipe');
    expect(shaderWipe?.engines).toEqual(['hyperframes', 'remotion']);
    expect(shaderWipe?.requiredProps).toEqual(['style', 'accentColor']);
    expect(shaderWipe?.regenerateScopes).toEqual(['effect', 'timing']);

    const outroSlate = getMotionComponent('outro-slate');
    expect(outroSlate?.requiredProps).toEqual(['headline', 'signature']);
    expect(outroSlate?.regenerateScopes).toEqual(['cta', 'copy', 'effect']);
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
