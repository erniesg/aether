'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useTheme } from '@/app/design-system/ThemeProvider';
import { cn } from '@/lib/utils/cn';
import { FloatingToolbar } from './FloatingToolbar';
import type { Scope } from './FloatingToolbar';

/**
 * Dynamically imported tldraw to keep the workspace route's initial bundle
 * small. The Tldraw component ships its own stylesheet — we import it at the
 * module level of the dynamic chunk.
 */
const TldrawCanvas = dynamic(() => import('./TldrawCanvas').then((m) => m.TldrawCanvas), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 flex items-center justify-center">
      <span className="font-caption text-ink-faint">canvas · loading tldraw…</span>
    </div>
  ),
});

export interface CanvasSubstrateProps {
  className?: string;
  composerRef: React.RefObject<HTMLTextAreaElement | null>;
  pinnedCapabilities?: Array<{ id: string; label: string }>;
}

export function CanvasSubstrate({ className, composerRef, pinnedCapabilities }: CanvasSubstrateProps) {
  const { theme } = useTheme();
  const [scope, setScope] = useState<Scope>('global');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const focusComposer = () => composerRef.current?.focus();

  return (
    <section
      data-taxonomy="tool"
      aria-label="canvas"
      className={cn('relative flex-1 overflow-hidden bg-surface-canvas', className)}
    >
      {mounted ? (
        <TldrawCanvas theme={theme} />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="font-caption text-ink-faint">canvas · initialising</span>
        </div>
      )}

      <FloatingToolbar
        scope={scope}
        onScopeChange={setScope}
        onAIPress={focusComposer}
        pinnedCapabilities={pinnedCapabilities}
      />
    </section>
  );
}
