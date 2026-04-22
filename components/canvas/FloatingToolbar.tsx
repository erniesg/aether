'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import {
  Eraser,
  GripVertical,
  LayoutDashboard,
  Scissors,
  ShieldAlert,
  SlidersHorizontal,
  Sparkles,
  SquareDashed,
  Wand2,
} from 'lucide-react';
import { IconButton } from '@/components/ui/IconButton';
import { cn } from '@/lib/utils/cn';

const STORAGE_KEY = 'aether.toolbar.pos';

type Pos = { x: number; y: number };

export type Scope = 'global' | 'local';

/**
 * The AI verbs the floating toolbar exposes today. "focus" opens the composer
 * — it's the primary entrypoint. The remainder carry prompt presets when the
 * shell wires them up; today each press notifies onVerbPress and the shell
 * prefills the composer + focuses it.
 */
export type ToolbarVerb =
  | 'cutout'
  | 'unmask'
  | 'removebg'
  | 'relight'
  | 'tone'
  | 'collage';

export interface FloatingToolbarProps {
  scope?: Scope;
  onScopeChange?: (next: Scope) => void;
  safeZonesVisible?: boolean;
  onSafeZonesToggle?: (next: boolean) => void;
  /** Primary AI entrypoint — usually focuses the composer. */
  onAIPress?: () => void;
  /** Fires when any non-focus AI verb button is pressed. The shell is
   * responsible for prefilling the composer (or dispatching to /api/generate
   * directly) with a matching prompt preset. */
  onVerbPress?: (verb: ToolbarVerb) => void;
  className?: string;
  /** Pinned capability chips lifted into the toolbar via pin-as-capability (Phase 5). */
  pinnedCapabilities?: Array<{ id: string; label: string }>;
  onCapabilityPress?: (id: string) => void;
}

function readStoredPos(): Pos | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Pos;
    if (typeof parsed.x === 'number' && typeof parsed.y === 'number') return parsed;
  } catch {
    // ignore
  }
  return null;
}

/**
 * The Aether capability toolbar: lives ON the canvas, draggable, icons-only.
 * It is the single primary tool palette — per hard rule 6 (CLAUDE.md). tldraw's
 * native toolbar (when enabled) stays at the bottom; this one owns the AI /
 * capability surface.
 */
export function FloatingToolbar({
  scope = 'global',
  onScopeChange,
  safeZonesVisible = false,
  onSafeZonesToggle,
  onAIPress,
  onVerbPress,
  pinnedCapabilities = [],
  onCapabilityPress,
  className,
}: FloatingToolbarProps) {
  const [pos, setPos] = useState<Pos>({ x: 24, y: 24 });
  const [activeTool, setActiveTool] = useState<string>('select');

  const dispatchVerb = (verb: ToolbarVerb) => {
    setActiveTool(verb);
    onVerbPress?.(verb);
  };
  const dragDelta = useRef<Pos | null>(null);
  const barRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const stored = readStoredPos();
    if (stored) setPos(stored);
  }, []);

  useEffect(() => {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(pos));
    } catch {
      // ignore
    }
  }, [pos]);

  const clamp = useCallback((x: number, y: number) => {
    const w = barRef.current?.offsetWidth ?? 360;
    const h = barRef.current?.offsetHeight ?? 44;
    const parent = barRef.current?.parentElement?.getBoundingClientRect();
    const maxX = (parent?.width ?? window.innerWidth) - w - 8;
    const maxY = (parent?.height ?? window.innerHeight) - h - 8;
    return {
      x: Math.min(Math.max(8, x), Math.max(8, maxX)),
      y: Math.min(Math.max(8, y), Math.max(8, maxY)),
    };
  }, []);

  const onHandleDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!barRef.current) return;
    const parent = barRef.current.parentElement;
    if (!parent) return;
    const parentRect = parent.getBoundingClientRect();
    // Pointer in the parent's coord space (same space as pos.x/pos.y, which
    // drive the absolute `left`/`top` style). Record the offset from pointer
    // to the toolbar's top-left so we can keep that offset stable during drag.
    const pointerInParentX = event.clientX - parentRect.left;
    const pointerInParentY = event.clientY - parentRect.top;
    dragDelta.current = {
      x: pointerInParentX - pos.x,
      y: pointerInParentY - pos.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  useEffect(() => {
    const onMove = (event: globalThis.PointerEvent) => {
      if (!dragDelta.current || !barRef.current) return;
      const parent = barRef.current.parentElement;
      if (!parent) return;
      const parentRect = parent.getBoundingClientRect();
      const pointerInParentX = event.clientX - parentRect.left;
      const pointerInParentY = event.clientY - parentRect.top;
      const next = clamp(
        pointerInParentX - dragDelta.current.x,
        pointerInParentY - dragDelta.current.y
      );
      setPos(next);
    };
    const onUp = () => {
      dragDelta.current = null;
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [clamp]);

  return (
    <div
      ref={barRef}
      role="toolbar"
      aria-label="canvas tools"
      data-taxonomy="tool"
      className={cn(
        'pointer-events-auto absolute z-10 flex items-center gap-1 rounded-md border border-border bg-surface-panel p-1 shadow-sm',
        className
      )}
      style={{ left: pos.x, top: pos.y }}
    >
      <button
        type="button"
        tabIndex={-1}
        onPointerDown={onHandleDown}
        className="flex h-8 w-5 cursor-grab items-center justify-center rounded-xs text-ink-faint transition-colors hover:bg-surface-panel-muted hover:text-ink-dim active:cursor-grabbing focus:shadow-none focus-visible:shadow-none"
        aria-label="drag toolbar"
      >
        <GripVertical size={12} strokeWidth={1.75} />
      </button>

      <span className="mx-0.5 h-5 w-px bg-border-soft" aria-hidden />

      {/*
        Aether's floating toolbar is the AI/capability palette: focus-composer,
        cutout, relight, pinned skills, safe-zones, scope. tldraw's native
        bottom toolbar owns primitives (select, text, shape, draw, eraser,
        hand, etc.), so reproducing them here was dead UI — the placeholder
        select/text/shape buttons only set local activeTool state, never
        drove the editor. Removed to keep "one button, one meaning".
      */}
      <IconButton
        label="AI · focus composer"
        variant="outline"
        icon={<Sparkles size={14} strokeWidth={1.75} />}
        onClick={onAIPress}
      />
      <IconButton
        label="cutout · mask a region"
        icon={<Scissors size={14} strokeWidth={1.75} />}
        onClick={() => dispatchVerb('cutout')}
        active={activeTool === 'cutout'}
      />
      <IconButton
        label="unmask · reveal under the mask"
        icon={<SquareDashed size={14} strokeWidth={1.75} />}
        onClick={() => dispatchVerb('unmask')}
        active={activeTool === 'unmask'}
      />
      <IconButton
        label="remove bg · cut the subject out"
        icon={<Eraser size={14} strokeWidth={1.75} />}
        onClick={() => dispatchVerb('removebg')}
        active={activeTool === 'removebg'}
      />
      <IconButton
        label="relight · bg fill"
        icon={<Wand2 size={14} strokeWidth={1.75} />}
        onClick={() => dispatchVerb('relight')}
        active={activeTool === 'relight'}
      />
      <IconButton
        label="tone · darker, sharper, warmer"
        icon={<SlidersHorizontal size={14} strokeWidth={1.75} />}
        onClick={() => dispatchVerb('tone')}
        active={activeTool === 'tone'}
      />
      <IconButton
        label="collage · compose from references"
        icon={<LayoutDashboard size={14} strokeWidth={1.75} />}
        onClick={() => dispatchVerb('collage')}
        active={activeTool === 'collage'}
      />

      {pinnedCapabilities.length > 0 ? (
        <>
          <span className="mx-0.5 h-5 w-px bg-border-soft" aria-hidden />
          {pinnedCapabilities.map((cap) => (
            <IconButton
              key={cap.id}
              label={`pinned · ${cap.label}`}
              icon={<Sparkles size={13} strokeWidth={1.75} className="text-accent" />}
              onClick={() => onCapabilityPress?.(cap.id)}
            />
          ))}
        </>
      ) : null}

      <span className="mx-0.5 h-5 w-px bg-border-soft" aria-hidden />

      <IconButton
        label={`safe zones · ${safeZonesVisible ? 'on' : 'off'}`}
        active={safeZonesVisible}
        icon={<ShieldAlert size={14} strokeWidth={1.75} />}
        onClick={() => onSafeZonesToggle?.(!safeZonesVisible)}
      />

      <button
        type="button"
        aria-label={`scope · ${scope} · click to toggle`}
        onClick={() => onScopeChange?.(scope === 'global' ? 'local' : 'global')}
        className={cn(
          'ml-1 inline-flex cursor-pointer select-none items-center gap-1 rounded-pill border px-2 py-0.5 font-mono text-2xs uppercase tracking-wide',
          'transition-colors duration-fast ease-quick',
          scope === 'global'
            ? 'border-accent-secondary/30 bg-accent-secondary/10 text-ink-muted'
            : 'border-accent bg-accent text-ink-on-accent'
        )}
      >
        {scope}
      </button>
    </div>
  );
}
