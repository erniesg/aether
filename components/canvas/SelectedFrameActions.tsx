'use client';

import { Download } from 'lucide-react';

export interface SelectedFrameActionsProps {
  rect: { x: number; y: number; w: number; h: number };
  label?: string;
  disabled?: boolean;
  onExport: () => void;
}

export function SelectedFrameActions({
  rect,
  label,
  disabled = false,
  onExport,
}: SelectedFrameActionsProps) {
  return (
    <div
      role="toolbar"
      aria-label="selected artboard actions"
      className="pointer-events-auto absolute z-[18] flex max-w-[calc(100%-16px)] items-center gap-1 rounded-md border border-border bg-surface-panel p-1 shadow-sm"
      style={{
        left: Math.max(8, rect.x + 8),
        top: Math.max(8, rect.y + 8),
      }}
    >
      <button
        type="button"
        onClick={onExport}
        disabled={disabled}
        className="inline-flex items-center gap-1 rounded-sm border border-accent bg-accent/10 px-2 py-1 font-caption text-xs text-accent transition-colors hover:bg-accent/15 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Download size={13} strokeWidth={1.75} />
        export{label ? ` ${label}` : ''}
      </button>
    </div>
  );
}
