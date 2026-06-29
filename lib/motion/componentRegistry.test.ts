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
      'cursor-callout',
      'split-screen-compare',
      'avatar-bubble',
      'device-frame',
      'logo-motion',
      'flow-diagram',
      'hotspot-marker',
      'data-visual-card',
      'code-diff-card',
      'code-highlight-card',
      'code-scroll-card',
      'code-typing-card',
      'mechanism-diagram',
      'evidence-card',
      'cta-card',
      'caption-line',
      'voice-line',
      'soft-wipe',
      'shader-wipe',
      'contact-sheet-proof',
      'outro-slate',
    ]);
  });

  it('marks engines and aspect ratios per component', () => {
    const hook = getMotionComponent('hook-card');
    expect(hook?.engines).toEqual(['remotion', 'hyperframes']);
    expect(hook?.aspectRatios).toContain('9:16');
    expect(hook?.editControls.map((control) => control.id)).toContain('headline');
    expect(hook?.editControls.map((control) => control.id)).toContain('effectPreset');

    const appFrame = getMotionComponent('app-frame');
    expect(appFrame?.engines).toEqual(['remotion']);
    expect(appFrame?.requiredProps).toEqual(['assetId', 'caption']);
    expect(appFrame?.editControls.map((control) => control.id)).toEqual([
      'assetId',
      'assetUrl',
      'caption',
      'crop',
      'zoom',
      'cursorPath',
    ]);

    const codeDiff = getMotionComponent('code-diff-card');
    expect(codeDiff?.requiredProps).toEqual(['filePath', 'lines']);
    expect(codeDiff?.regenerateScopes).toContain('code');

    const codeHighlight = getMotionComponent('code-highlight-card');
    expect(codeHighlight?.engines).toEqual(['remotion', 'hyperframes']);
    expect(codeHighlight?.requiredProps).toEqual(['filePath', 'lines', 'focusLine']);
    expect(codeHighlight?.editControls.map((control) => control.id)).toEqual([
      'filePath',
      'lines',
      'focusLine',
      'accentColor',
    ]);
    expect(codeHighlight?.regenerateScopes).toEqual(['code', 'proof', 'timing', 'effect']);

    const codeScroll = getMotionComponent('code-scroll-card');
    expect(codeScroll?.engines).toEqual(['remotion', 'hyperframes']);
    expect(codeScroll?.requiredProps).toEqual(['filePath', 'lines', 'scrollTarget']);
    expect(codeScroll?.editControls.map((control) => control.id)).toContain('scrollTarget');
    expect(codeScroll?.regenerateScopes).toEqual(['code', 'timing', 'effect']);

    const codeTyping = getMotionComponent('code-typing-card');
    expect(codeTyping?.engines).toEqual(['remotion', 'hyperframes']);
    expect(codeTyping?.requiredProps).toEqual(['filePath', 'code', 'typingPace']);
    expect(codeTyping?.editControls.map((control) => control.id)).toContain('typingPace');
    expect(codeTyping?.regenerateScopes).toEqual(['code', 'copy', 'timing', 'effect']);

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

    const cursorCallout = getMotionComponent('cursor-callout');
    expect(cursorCallout?.engines).toEqual(['remotion', 'hyperframes']);
    expect(cursorCallout?.requiredProps).toEqual(['targetLabel', 'cursorPath']);
    expect(cursorCallout?.editControls.map((control) => control.id)).toEqual([
      'targetLabel',
      'cursorPath',
      'zoom',
      'effectPreset',
    ]);
    expect(cursorCallout?.regenerateScopes).toEqual([
      'capture',
      'caption',
      'timing',
      'effect',
    ]);

    const splitScreen = getMotionComponent('split-screen-compare');
    expect(splitScreen?.requiredProps).toEqual([
      'beforeAssetId',
      'afterAssetId',
      'caption',
    ]);
    expect(splitScreen?.regenerateScopes).toEqual([
      'capture',
      'asset',
      'caption',
      'timing',
      'effect',
    ]);

    const avatarBubble = getMotionComponent('avatar-bubble');
    expect(avatarBubble?.requiredProps).toEqual(['avatarAssetId', 'speakerName', 'caption']);
    expect(avatarBubble?.regenerateScopes).toEqual(['asset', 'copy', 'caption', 'timing']);

    const deviceFrame = getMotionComponent('device-frame');
    expect(deviceFrame?.engines).toEqual(['remotion', 'hyperframes']);
    expect(deviceFrame?.requiredProps).toEqual(['assetId', 'device', 'caption']);
    expect(deviceFrame?.editControls.map((control) => control.id)).toEqual([
      'assetId',
      'device',
      'caption',
      'safeZone',
      'effectPreset',
    ]);
    expect(deviceFrame?.regenerateScopes).toEqual([
      'capture',
      'caption',
      'timing',
      'effect',
    ]);

    const logoMotion = getMotionComponent('logo-motion');
    expect(logoMotion?.engines).toEqual(['remotion', 'hyperframes']);
    expect(logoMotion?.requiredProps).toEqual(['logoAssetId', 'wordmark', 'motionPreset']);
    expect(logoMotion?.regenerateScopes).toEqual(['asset', 'copy', 'timing', 'effect']);

    const flowDiagram = getMotionComponent('flow-diagram');
    expect(flowDiagram?.engines).toEqual(['remotion', 'hyperframes']);
    expect(flowDiagram?.requiredProps).toEqual(['headline', 'steps']);
    expect(flowDiagram?.regenerateScopes).toEqual(['diagram', 'copy', 'timing', 'effect']);

    const hotspotMarker = getMotionComponent('hotspot-marker');
    expect(hotspotMarker?.engines).toEqual(['remotion', 'hyperframes']);
    expect(hotspotMarker?.requiredProps).toEqual(['targetLabel', 'hotspot', 'action']);
    expect(hotspotMarker?.regenerateScopes).toEqual([
      'capture',
      'caption',
      'timing',
      'effect',
    ]);

    const dataVisual = getMotionComponent('data-visual-card');
    expect(dataVisual?.requiredProps).toEqual(['metric', 'label']);
    expect(dataVisual?.regenerateScopes).toEqual(['proof', 'copy', 'effect']);

    const shaderWipe = getMotionComponent('shader-wipe');
    expect(shaderWipe?.engines).toEqual(['hyperframes', 'remotion']);
    expect(shaderWipe?.requiredProps).toEqual(['style', 'accentColor']);
    expect(shaderWipe?.regenerateScopes).toEqual(['effect', 'timing']);

    const contactSheet = getMotionComponent('contact-sheet-proof');
    expect(contactSheet?.requiredProps).toEqual(['frameAssetIds', 'status']);
    expect(contactSheet?.regenerateScopes).toEqual(['proof', 'asset', 'timing']);

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
