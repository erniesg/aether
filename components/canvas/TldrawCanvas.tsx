'use client';

import { Tldraw, type Editor } from 'tldraw';
import 'tldraw/tldraw.css';
import type { Theme } from '@/app/design-system/ThemeProvider';
import { useEditorRef } from '@/lib/store/editor-ref';

/**
 * Minimal tldraw wrapper. Native bottom Toolbar + StylePanel stay so
 * creators have primitive editing tools (select/hand/shapes/text/zoom);
 * the Aether FloatingToolbar owns AI/capability verbs. See docs/ARCHITECTURE
 * and CLAUDE.md hard rule 6.
 */
export function TldrawCanvas({ theme }: { theme: Theme }) {
  const { setEditor } = useEditorRef();

  return (
    <Tldraw
      className="absolute inset-0"
      inferDarkMode={false}
      options={{ maxPages: 1 }}
      onMount={(editor: Editor) => {
        setEditor(editor);
        editor.user.updateUserPreferences({ colorScheme: theme === 'light' ? 'light' : 'dark' });
      }}
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
