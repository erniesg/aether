'use client';

import { cn } from '@/lib/utils/cn';

export type ViewId = 'canvas' | 'focus' | 'timeline' | 'graph' | 'mood' | 'chat';

type ViewDef = {
  id: ViewId;
  label: string;
  /** When false, the pill renders with a "soon" indicator and is not clickable. */
  live: boolean;
};

const VIEWS: ReadonlyArray<ViewDef> = [
  { id: 'canvas', label: 'canvas', live: true },
  { id: 'focus', label: 'focus', live: true },
  { id: 'timeline', label: 'timeline', live: false },
  { id: 'graph', label: 'graph', live: false },
  { id: 'mood', label: 'mood', live: false },
  { id: 'chat', label: 'chat', live: false },
];

export interface ViewSwitcherProps {
  view: ViewId;
  onChangeView: (next: ViewId) => void;
  className?: string;
}

/**
 * Lens toggle for the single synthesis shell. Six views, only canvas + focus
 * are live today — the rest carry a "soon" affordance so the architectural
 * promise is visible without blowing scope. No route splits; the switch is a
 * state change on the shell.
 */
export function ViewSwitcher({ view, onChangeView, className }: ViewSwitcherProps) {
  return (
    <div
      role="tablist"
      aria-label="workspace view"
      data-taxonomy="navigation"
      className={cn(
        'inline-flex items-center gap-0.5 rounded-pill border border-border-soft bg-surface-panel-muted p-0.5',
        className
      )}
    >
      {VIEWS.map((v) => {
        const active = v.id === view;
        return (
          <button
            key={v.id}
            type="button"
            role="tab"
            aria-current={active ? 'page' : undefined}
            aria-selected={active}
            disabled={!v.live}
            onClick={v.live ? () => onChangeView(v.id) : undefined}
            className={cn(
              'relative inline-flex items-center gap-1 rounded-pill px-2 py-0.5 font-mono text-2xs uppercase tracking-wide',
              'transition-colors duration-fast ease-quick',
              active
                ? 'bg-surface-panel text-ink shadow-sm'
                : 'text-ink-dim hover:text-ink',
              !v.live && 'cursor-not-allowed text-ink-faint hover:text-ink-faint'
            )}
          >
            <span>{v.label}</span>
            {!v.live ? (
              <span
                aria-hidden
                className="font-mono text-[9px] uppercase tracking-wider text-ink-faint"
              >
                · soon
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
