import { describe, expect, it } from 'vitest';
import { TLDRAW_CHROME_OVERRIDES } from '@/components/canvas/TldrawCanvas';

describe('TldrawCanvas · operator-chrome overrides', () => {
  it('nulls tldraw NavigationPanel (bottom-right page/zoom stack is operator chrome)', () => {
    expect(TLDRAW_CHROME_OVERRIDES.NavigationPanel).toBeNull();
  });

  it('nulls the rest of the operator-shaped menus so the creator surface stays clean', () => {
    const mustBeNull = [
      'MenuPanel',
      'MainMenu',
      'PageMenu',
      'QuickActions',
      'ActionsMenu',
      'HelpMenu',
      'KeyboardShortcutsDialog',
      'NavigationPanel',
      'ZoomMenu',
      'SharePanel',
      'DebugPanel',
    ] as const;
    for (const key of mustBeNull) {
      expect(
        TLDRAW_CHROME_OVERRIDES[key as keyof typeof TLDRAW_CHROME_OVERRIDES]
      ).toBeNull();
    }
  });

  it('hides the native Toolbar and StylePanel so aether owns the canvas chrome', () => {
    expect(TLDRAW_CHROME_OVERRIDES.Toolbar).toBeNull();
    expect(TLDRAW_CHROME_OVERRIDES.StylePanel).toBeNull();
  });
});
