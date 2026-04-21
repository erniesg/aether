'use client';

import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { useRail } from './RailContext';
import { IconButton } from '@/components/ui/IconButton';
import { cn } from '@/lib/utils/cn';

export interface RailSectionProps {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Short summary rendered in the flyout header ("3 pinned", "2 swatches"). */
  summary?: string;
  /** Signals the section has active selection / content. Drives the dot indicator. */
  hasContent?: boolean;
  /** Signals the section is live (e.g. generation in progress). */
  active?: boolean;
  children?: ReactNode;
  /** Which side the flyout opens to. */
  side?: 'left' | 'right';
}

/**
 * A rail section: icon in the compact column; body in a flyout next to the icon
 * when open. Exactly one section per rail may be open at a time (enforced by
 * RailContext). Matches the lifecycle-ordered, icon-first, progressive-
 * disclosure contract from docs/PRD.md and CLAUDE.md hard rule 5.
 */
export function RailSection({
  id,
  label,
  icon: Icon,
  summary,
  hasContent,
  active,
  children,
  side = 'right',
}: RailSectionProps) {
  const { openSection, toggle, close, registerFlyout } = useRail();
  const isOpen = openSection === id;
  const flyoutRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (isOpen) registerFlyout(id, flyoutRef.current);
    return () => registerFlyout(id, null);
  }, [id, isOpen, registerFlyout]);

  return (
    <div className="relative">
      <IconButton
        size="md"
        variant="ghost"
        label={`${label}${summary ? ` · ${summary}` : ''}`}
        icon={
          <span className="relative inline-flex">
            <Icon size={16} strokeWidth={1.75} />
            {hasContent ? (
              <span
                aria-hidden
                className={cn(
                  'absolute -right-1 -top-1 h-1.5 w-1.5 rounded-pill',
                  active ? 'bg-accent animate-pulse' : 'bg-accent'
                )}
              />
            ) : null}
          </span>
        }
        active={isOpen}
        onClick={() => toggle(id)}
        className="mx-1 my-1"
        data-rail-section={id}
      />

      {isOpen ? (
        <aside
          ref={flyoutRef}
          role="region"
          aria-label={label}
          data-rail-flyout={id}
          className={cn(
            'absolute top-0 z-20 w-80 rounded-md border border-border bg-surface-panel shadow-md',
            'transition-opacity duration-fast ease-quick',
            side === 'right' ? 'left-[calc(100%+8px)]' : 'right-[calc(100%+8px)]'
          )}
        >
          <header className="flex items-center justify-between gap-2 border-b border-border-soft px-3 py-2">
            <div className="flex items-center gap-2">
              <Icon size={14} strokeWidth={1.75} className="text-ink-dim" />
              <span className="font-caption text-ink">{label}</span>
            </div>
            {summary ? (
              <span className="font-caption text-ink-dim">{summary}</span>
            ) : null}
          </header>
          <div className="max-h-[60vh] overflow-y-auto p-3">{children}</div>
          <footer className="flex justify-end border-t border-border-soft px-3 py-1.5">
            <button
              type="button"
              onClick={close}
              className="font-caption text-ink-dim transition-colors duration-fast hover:text-ink"
            >
              close
            </button>
          </footer>
        </aside>
      ) : null}
    </div>
  );
}
