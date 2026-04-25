'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import {
  ArrowRight,
  Camera,
  Circle,
  Eraser,
  GripVertical,
  Hand,
  Languages,
  LayoutDashboard,
  MousePointer2,
  PenLine,
  Scissors,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Square,
  SquareDashed,
  Type,
  Trash2,
  Wand2,
} from 'lucide-react';
import { IconButton } from '@/components/ui/IconButton';
import type {
  PrimitiveTool,
  SketchBrushState,
} from '@/lib/canvas/sketchBrush';
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

export type ToolbarStyleAction =
  | 'color-black'
  | 'color-white'
  | 'color-blue'
  | 'color-brand-primary'
  | 'color-brand-accent'
  | 'size-small'
  | 'size-medium'
  | 'size-large'
  | 'fill-solid'
  | 'fill-none';

export interface FloatingToolbarProps {
  scope?: Scope;
  onScopeChange?: (next: Scope) => void;
  safeZonesVisible?: boolean;
  onSafeZonesToggle?: (next: boolean) => void;
  layoutGuardEnabled?: boolean;
  onLayoutGuardToggle?: (next: boolean) => void;
  onApplyGuardedLayout?: () => void;
  /** Primary AI entrypoint — usually focuses the composer. */
  onAIPress?: () => void;
  /** Fires when any non-focus AI verb button is pressed. The shell is
   * responsible for prefilling the composer (or dispatching to /api/generate
   * directly) with a matching prompt preset. */
  onVerbPress?: (verb: ToolbarVerb) => void;
  activePrimitiveTool?: PrimitiveTool;
  brushState?: Pick<SketchBrushState, 'color' | 'size'>;
  onPrimitiveToolPress?: (tool: PrimitiveTool) => void;
  onStyleAction?: (action: ToolbarStyleAction) => void;
  onClearCanvas?: () => void;
  airBrushActive?: boolean;
  onAirBrushToggle?: (active: boolean) => void;
  className?: string;
  /** Pinned capability chips lifted into the toolbar via pin-as-capability (Phase 5). */
  pinnedCapabilities?: Array<{ id: string; label: string }>;
  onCapabilityPress?: (id: string) => void;
  /** Voice-mode chip (phase 1). Rendered when provided; see VoiceOrb. */
  voiceSlot?: React.ReactNode;
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
  layoutGuardEnabled = true,
  onLayoutGuardToggle,
  onApplyGuardedLayout,
  onAIPress,
  onVerbPress,
  activePrimitiveTool = 'select',
  brushState,
  onPrimitiveToolPress,
  onStyleAction,
  onClearCanvas,
  airBrushActive = false,
  onAirBrushToggle,
  pinnedCapabilities = [],
  onCapabilityPress,
  voiceSlot,
  className,
}: FloatingToolbarProps) {
  const [pos, setPos] = useState<Pos>({ x: 24, y: 24 });
  const [activeVerb, setActiveVerb] = useState<ToolbarVerb | null>(null);

  const dispatchPrimitive = (tool: PrimitiveTool) => {
    onPrimitiveToolPress?.(tool);
  };
  const dispatchVerb = (verb: ToolbarVerb) => {
    setActiveVerb(verb);
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
        active={activePrimitiveTool === 'select'}
      />
      <IconButton
        label="hand tool"
        icon={<Hand size={14} strokeWidth={1.75} />}
        onClick={() => dispatchPrimitive('hand')}
        active={activePrimitiveTool === 'hand'}
      />
      <IconButton
        label="sketch tool"
        icon={<PenLine size={14} strokeWidth={1.75} />}
        onClick={() => dispatchPrimitive('draw')}
        active={activePrimitiveTool === 'draw'}
      />
      <IconButton
        label={`air brush · ${airBrushActive ? 'on' : 'off'}`}
        icon={<Camera size={14} strokeWidth={1.75} />}
        onClick={() => onAirBrushToggle?.(!airBrushActive)}
        active={airBrushActive}
      />
      <IconButton
        label="clear canvas"
        icon={<Trash2 size={14} strokeWidth={1.75} />}
        onClick={onClearCanvas}
      />
      <IconButton
        label="text tool"
        icon={<Type size={14} strokeWidth={1.75} />}
        onClick={() => dispatchPrimitive('text')}
        active={activePrimitiveTool === 'text'}
      />
      <IconButton
        label="shape tool"
        icon={<Square size={14} strokeWidth={1.75} />}
        onClick={() => dispatchPrimitive('geo')}
        active={activePrimitiveTool === 'geo'}
      />
      <IconButton
        label="arrow tool"
        icon={<ArrowRight size={14} strokeWidth={1.75} />}
        onClick={() => dispatchPrimitive('arrow')}
        active={activePrimitiveTool === 'arrow'}
      />

      <span className="mx-0.5 h-5 w-px bg-border-soft" aria-hidden />

      <IconButton
        label="ink black"
        icon={<Circle size={12} strokeWidth={2.25} className="fill-current" />}
        onClick={() => onStyleAction?.('color-black')}
        active={brushState?.color === 'black'}
      />
      <IconButton
        label="ink white"
        className="text-white"
        icon={<Circle size={12} strokeWidth={2.25} className="fill-current" />}
        onClick={() => onStyleAction?.('color-white')}
        active={brushState?.color === 'white'}
      />
      <IconButton
        label="ink blue"
        icon={<Circle size={12} strokeWidth={2.25} className="fill-blue-500 text-blue-500" />}
        onClick={() => onStyleAction?.('color-blue')}
        active={brushState?.color === 'blue'}
      />
      <IconButton
        label="brand primary"
        icon={<Circle size={12} strokeWidth={2.25} className="fill-sky-400 text-sky-400" />}
        onClick={() => onStyleAction?.('color-brand-primary')}
        active={brushState?.color === 'brand-primary'}
      />
      <IconButton
        label="brand accent"
        icon={
          <Circle size={12} strokeWidth={2.25} className="fill-violet-500 text-violet-500" />
        }
        onClick={() => onStyleAction?.('color-brand-accent')}
        active={brushState?.color === 'brand-accent'}
      />

      <span className="mx-0.5 h-5 w-px bg-border-soft" aria-hidden />

      <IconButton
        label="brush size small"
        icon={<Circle size={8} strokeWidth={2.25} className="fill-current" />}
        onClick={() => onStyleAction?.('size-small')}
        active={brushState?.size === 'small'}
      />
      <IconButton
        label="brush size medium"
        icon={<Circle size={10} strokeWidth={2.25} className="fill-current" />}
        onClick={() => onStyleAction?.('size-medium')}
        active={brushState?.size === 'medium'}
      />
      <IconButton
        label="brush size large"
        icon={<Circle size={12} strokeWidth={2.25} className="fill-current" />}
        onClick={() => onStyleAction?.('size-large')}
        active={brushState?.size === 'large'}
      />

      <span className="mx-0.5 h-5 w-px bg-border-soft" aria-hidden />

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
        active={activeVerb === 'cutout'}
      />
      <IconButton
        label="unmask · reveal under the mask"
        icon={<SquareDashed size={14} strokeWidth={1.75} />}
        onClick={() => dispatchVerb('unmask')}
        active={activeVerb === 'unmask'}
      />
      <IconButton
        label="remove bg · cut the subject out"
        icon={<Eraser size={14} strokeWidth={1.75} />}
        onClick={() => dispatchVerb('removebg')}
        active={activeVerb === 'removebg'}
      />
      <IconButton
        label="relight · bg fill"
        icon={<Wand2 size={14} strokeWidth={1.75} />}
        onClick={() => dispatchVerb('relight')}
        active={activeVerb === 'relight'}
      />
      <IconButton
        label="tone · darker, sharper, warmer"
        icon={<SlidersHorizontal size={14} strokeWidth={1.75} />}
        onClick={() => dispatchVerb('tone')}
        active={activeVerb === 'tone'}
      />
      <IconButton
        label="collage · compose from references"
        icon={<LayoutDashboard size={14} strokeWidth={1.75} />}
        onClick={() => dispatchVerb('collage')}
        active={activeVerb === 'collage'}
      />

      {voiceSlot ? (
        <>
          <span className="mx-0.5 h-5 w-px bg-border-soft" aria-hidden />
          <div data-voice-slot className="flex items-center">
            {voiceSlot}
          </div>
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
      <IconButton
        label={`layout guard · ${layoutGuardEnabled ? 'on' : 'off'}`}
        active={layoutGuardEnabled}
        icon={<ShieldCheck size={14} strokeWidth={1.75} />}
        onClick={() => onLayoutGuardToggle?.(!layoutGuardEnabled)}
      />
      <IconButton
        label="arrange guarded copy"
        icon={<Languages size={14} strokeWidth={1.75} />}
        onClick={onApplyGuardedLayout}
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
