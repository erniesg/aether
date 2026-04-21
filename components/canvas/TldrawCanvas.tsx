'use client';

import { Tldraw } from 'tldraw';
import 'tldraw/tldraw.css';
import type { Theme } from '@/app/design-system/ThemeProvider';

/**
 * Minimal tldraw wrapper. Native chrome is suppressed — we rely on the Aether
 * FloatingToolbar as the single primary palette (hard rule 6).
 *
 * tldraw's internal dark-mode toggles can be wired later; for now the theme
 * prop is a hook so downstream slices can inject brand palette, safe zones,
 * and custom shapes without touching this file.
 */
export function TldrawCanvas({ theme }: { theme: Theme }) {
  return (
    <Tldraw
      className="absolute inset-0"
      inferDarkMode={false}
      options={{ maxPages: 1 }}
      // tldraw's native Toolbar + StylePanel stay — primitives (select/hand/
      // shapes/text/zoom) belong to tldraw. The Aether FloatingToolbar owns
      // AI/capability verbs only. See docs/ARCHITECTURE + CLAUDE.md rule 6.
      components={{
        MenuPanel: null,
        MainMenu: null,
        HelpMenu: null,
        PageMenu: null,
        KeyboardShortcutsDialog: null,
        QuickActions: null,
        ActionsMenu: null,
      }}
      data-aether-theme={theme}
    />
  );
}
