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

  it('does NOT touch the native bottom Toolbar or StylePanel (primitives stay reachable)', () => {
    expect(TLDRAW_CHROME_OVERRIDES).not.toHaveProperty('Toolbar');
    expect(TLDRAW_CHROME_OVERRIDES).not.toHaveProperty('StylePanel');
  });
});
