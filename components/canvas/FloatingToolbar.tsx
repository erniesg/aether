'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import {
  ArrowRight,
  Circle,
  Columns3,
  Eraser,
  GripVertical,
  Hand,
  LayoutDashboard,
  MousePointer2,
  Scissors,
  ShieldAlert,
  SlidersHorizontal,
  Sparkles,
  Square,
  SquareDashed,
  Type,
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

export type PrimitiveTool = 'select' | 'hand' | 'text' | 'geo' | 'arrow';

export type ToolbarStyleAction =
  | 'color-black'
  | 'color-blue'
  | 'fill-solid'
  | 'fill-none';

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
  onPrimitiveToolPress?: (tool: PrimitiveTool) => void;
  onStyleAction?: (action: ToolbarStyleAction) => void;
  className?: string;
  /** Pinned capability chips lifted into the toolbar via pin-as-capability (Phase 5). */
  pinnedCapabilities?: Array<{ id: string; label: string }>;
  onCapabilityPress?: (id: string) => void;
  /** Voice-mode chip (phase 1). Rendered when provided; see VoiceOrb. */
  voiceSlot?: React.ReactNode;
  /** Eyes-closed sketch+voice handle (issue #128 / Q7). Sits next to the
   * voice chip — same `tool`-taxonomy slot, hold-to-record affordance. */
  eyesClosedSlot?: React.ReactNode;
  /** Toggles the cluster kanban lens. Lens-switches live on canvas chrome
   * (hard rule #3 — `tool` category) rather than the header, so the lens
   * stays attached to the canvas substrate. */
  clusterLensActive?: boolean;
  onClusterLensToggle?: () => void;
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
  onPrimitiveToolPress,
  onStyleAction,
  pinnedCapabilities = [],
  onCapabilityPress,
  voiceSlot,
  eyesClosedSlot,
  clusterLensActive,
  onClusterLensToggle,
  className,
}: FloatingToolbarProps) {
  const [pos, setPos] = useState<Pos>({ x: 24, y: 24 });
  const [activeTool, setActiveTool] = useState<string>('select');

  const dispatchPrimitive = (tool: PrimitiveTool) => {
    setActiveTool(tool);
    onPrimitiveToolPress?.(tool);
  };
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
        'pointer-events-auto absolute z-10 flex max-w-[calc(100%-16px)] flex-wrap items-center gap-1 rounded-md border border-border bg-surface-panel p-1 shadow-sm',
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

      <IconButton
        label="select tool"
        icon={<MousePointer2 size={14} strokeWidth={1.75} />}
        onClick={() => dispatchPrimitive('select')}
        active={activeTool === 'select'}
      />
      <IconButton
        label="hand tool"
        icon={<Hand size={14} strokeWidth={1.75} />}
        onClick={() => dispatchPrimitive('hand')}
        active={activeTool === 'hand'}
      />
      <IconButton
        label="text tool"
        icon={<Type size={14} strokeWidth={1.75} />}
        onClick={() => dispatchPrimitive('text')}
        active={activeTool === 'text'}
      />
      <IconButton
        label="shape tool"
        icon={<Square size={14} strokeWidth={1.75} />}
        onClick={() => dispatchPrimitive('geo')}
        active={activeTool === 'geo'}
      />
      <IconButton
        label="arrow tool"
        icon={<ArrowRight size={14} strokeWidth={1.75} />}
        onClick={() => dispatchPrimitive('arrow')}
        active={activeTool === 'arrow'}
      />

      <span className="mx-0.5 h-5 w-px bg-border-soft" aria-hidden />

      <IconButton
        label="ink style"
        icon={<Circle size={12} strokeWidth={2.25} className="fill-current" />}
        onClick={() => onStyleAction?.('color-black')}
      />
      <IconButton
        label="accent style"
        icon={<Circle size={12} strokeWidth={2.25} className="fill-blue-500 text-blue-500" />}
        onClick={() => onStyleAction?.('color-blue')}
      />
      <IconButton
        label="fill solid"
        icon={<Square size={14} strokeWidth={1.75} className="fill-current" />}
        onClick={() => onStyleAction?.('fill-solid')}
      />
      <IconButton
        label="fill none"
        icon={<SquareDashed size={14} strokeWidth={1.75} />}
        onClick={() => onStyleAction?.('fill-none')}
      />

      <span className="mx-0.5 h-5 w-px bg-border-soft" aria-hidden />

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

      {voiceSlot || eyesClosedSlot ? (
        <>
          <span className="mx-0.5 h-5 w-px bg-border-soft" aria-hidden />
          {voiceSlot ? (
            <div data-voice-slot className="flex items-center">
              {voiceSlot}
            </div>
          ) : null}
          {eyesClosedSlot ? (
            <div data-eyes-closed-slot className="flex items-center">
              {eyesClosedSlot}
            </div>
          ) : null}
        </>
      ) : null}

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

      {onClusterLensToggle ? (
        <IconButton
          label={`cluster lens · ${clusterLensActive ? 'on' : 'off'}`}
          active={clusterLensActive}
          icon={<Columns3 size={14} strokeWidth={1.75} />}
          onClick={onClusterLensToggle}
          data-testid="toolbar-cluster-lens"
        />
      ) : null}

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
