'use client';

import { type PointerEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Maximize2, PanelsTopLeft, Rows3, Square, X } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

type StoryboardMode = 'overview' | 'zoom' | 'share';
type StoryboardAspect = '16:9' | '4:5' | '9:16' | '1:1';
type StoryboardSlideId = 'problem' | 'mask' | 'why-now' | 'adaptive';
type StoryboardTheme = 'aether' | 'codex';
type StoryboardElementKind = 'text' | 'shape' | 'image' | 'video';

type StoryboardElement = {
  id: string;
  kind: StoryboardElementKind;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  text?: string;
  src?: string;
  color?: string;
  fill?: string;
  radius?: number;
  opacity?: number;
  font?: 'display' | 'serif' | 'mono';
};

type StoryboardSlide = {
  id: StoryboardSlideId;
  number: string;
  title: string;
  kicker: string;
  voiceover: string;
  aspect: StoryboardAspect;
  theme: StoryboardTheme;
  elements: StoryboardElement[];
};

const slides: StoryboardSlide[] = [
  {
    id: 'problem',
    number: '01',
    title: 'Problem',
    kicker: 'For 30+ years: one tax.',
    voiceover:
      'For 30+ years, creative tools made one idea pay a tax: rebuild it by hand for every format.',
    aspect: '16:9',
    theme: 'aether',
    elements: [],
  },
  {
    id: 'mask',
    number: '02',
    title: 'Solution: Aether',
    kicker: 'Mask-native canvas.',
    voiceover:
      'Aether is the canvas answer: masks, native variants and editable production without rebuilding the idea by hand.',
    aspect: '16:9',
    theme: 'aether',
    elements: [],
  },
  {
    id: 'why-now',
    number: '03',
    title: 'Why Now',
    kicker: 'Codex + GPT-5.5 + GPT Image 2.',
    voiceover:
      'The question is no longer whether AI can make pixels. It is what agent-native creative software should feel like.',
    aspect: '16:9',
    theme: 'codex',
    elements: [],
  },
  {
    id: 'adaptive',
    number: '04',
    title: 'Aether for socials',
    kicker: 'Click once. Native formats fan out.',
    voiceover:
      'Aether turns intent into an adaptive canvas: one prompt, one click, native formats without rebuilding the idea by hand.',
    aspect: '16:9',
    theme: 'aether',
    elements: [],
  },
];

const aspectClass: Record<StoryboardAspect, string> = {
  '16:9': 'aspect-video',
  '4:5': 'aspect-[4/5]',
  '9:16': 'aspect-[9/16]',
  '1:1': 'aspect-square',
};

const modeLabel: Record<StoryboardMode, string> = {
  overview: 'overview',
  zoom: 'zoom',
  share: '100% share',
};

export interface StoryboardLensProps {
  open?: boolean;
  onClose?: () => void;
  runs?: unknown[];
  references?: unknown[];
  formats?: unknown[];
  scheduledPosts?: unknown[];
  canvasCopyByLocaleFormat?: unknown;
  enabledLocales?: unknown[];
}

export function StoryboardLens({ open = true, onClose }: StoryboardLensProps = {}) {
  const [mode, setMode] = useState<StoryboardMode>('overview');
  const [activeId, setActiveId] = useState<StoryboardSlideId>('problem');
  const [aspect, setAspect] = useState<StoryboardAspect>('16:9');
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [elementEditingEnabled, setElementEditingEnabled] = useState(false);
  const [showColorCodes, setShowColorCodes] = useState(false);
  const [slideDrafts, setSlideDrafts] = useState<Record<StoryboardSlideId, StoryboardSlide>>(() =>
    slides.reduce(
      (acc, slide) => {
        acc[slide.id] = slide;
        return acc;
      },
      {} as Record<StoryboardSlideId, StoryboardSlide>
    )
  );
  const storyboardSlides = useMemo(
    () => slides.map((slide) => slideDrafts[slide.id] ?? slide),
    [slideDrafts]
  );
  const activeSlide = useMemo(
    () => storyboardSlides.find((slide) => slide.id === activeId) ?? storyboardSlides[0],
    [activeId, storyboardSlides]
  );

  useEffect(() => {
    const hasSelection = activeSlide.elements.some((element) => element.id === selectedElementId);
    if (!hasSelection) {
      setSelectedElementId(activeSlide.elements[0]?.id ?? null);
    }
  }, [activeSlide, selectedElementId]);

  function selectSlide(slide: StoryboardSlide, nextMode: StoryboardMode = mode) {
    setActiveId(slide.id);
    setAspect(slide.aspect);
    setMode(nextMode);
    if (nextMode !== 'zoom') {
      setElementEditingEnabled(false);
    }
  }

  function updateSlide(slideId: StoryboardSlideId, patch: Partial<StoryboardSlide>) {
    setSlideDrafts((current) => ({
      ...current,
      [slideId]: { ...(current[slideId] ?? slides.find((slide) => slide.id === slideId)!), ...patch },
    }));
  }

  const isShareMode = mode === 'share';
  const closeStoryboard = () => {
    setMode('overview');
    onClose?.();
  };

  if (!open) return null;

  return (
    <div
      data-testid="storyboard-lens"
      className={cn(
        'z-[1000] overflow-hidden bg-surface-canvas shadow-lg',
        isShareMode
          ? 'fixed inset-0 rounded-none border-0 bg-[#050507]'
          : 'absolute inset-4 rounded-md border border-border'
      )}
    >
      <div
        className={cn(
          'pointer-events-none absolute inset-0',
          isShareMode
            ? 'bg-[#050507]'
            : 'bg-[radial-gradient(circle_at_1px_1px,rgba(15,23,42,0.12)_1px,transparent_0)] [background-size:18px_18px]'
        )}
      />
      {!isShareMode ? (
        <header className="relative z-10 flex h-16 items-center justify-between border-b border-border-soft bg-surface-panel/90 px-5">
          <div className="flex items-center gap-3">
            <div className="flex size-8 items-center justify-center rounded-md border border-border bg-surface-panel">
              <PanelsTopLeft size={16} strokeWidth={1.75} />
            </div>
            <div>
              <div className="font-caption text-ink-dim">canvas lens</div>
              <h2 className="font-display text-xl tracking-tight text-ink">Storyboard</h2>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {(['overview', 'zoom', 'share'] as StoryboardMode[]).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setMode(item)}
                className={cn(
                  'inline-flex h-9 items-center gap-2 rounded-md border px-3 font-mono text-2xs uppercase tracking-wide',
                  mode === item
                    ? 'border-ink bg-ink text-white'
                    : 'border-border bg-surface-panel text-ink hover:border-ink/50'
                )}
              >
                {item === 'overview' ? <Rows3 size={14} /> : item === 'zoom' ? <Square size={13} /> : <Maximize2 size={14} />}
                {modeLabel[item]}
              </button>
            ))}
            <button
              type="button"
              data-testid="storyboard-close"
              onPointerDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                closeStoryboard();
              }}
              onClick={closeStoryboard}
              className="ml-1 inline-flex size-9 items-center justify-center rounded-md border border-border bg-surface-panel text-ink-dim hover:text-ink"
              aria-label="close storyboard"
            >
              <X size={15} strokeWidth={1.75} />
            </button>
          </div>
        </header>
      ) : null}

      {mode === 'overview' ? (
        <OverviewMode slides={storyboardSlides} onSelect={selectSlide} />
      ) : mode === 'zoom' ? (
        <ZoomMode
          slides={storyboardSlides}
          activeSlide={activeSlide}
          aspect={aspect}
          selectedElementId={selectedElementId}
          elementEditingEnabled={elementEditingEnabled}
          showColorCodes={showColorCodes}
          onAspectChange={setAspect}
          onSelect={selectSlide}
          onSelectElement={setSelectedElementId}
          onElementEditingChange={setElementEditingEnabled}
          onShowColorCodesChange={setShowColorCodes}
          onSlideChange={updateSlide}
        />
      ) : (
        <ShareMode
          slides={storyboardSlides}
          activeSlide={activeSlide}
          aspect={aspect}
          onAspectChange={setAspect}
          onSelect={selectSlide}
          onModeChange={setMode}
          onClose={closeStoryboard}
        />
      )}
    </div>
  );
}

function OverviewMode({
  slides: storyboardSlides,
  onSelect,
}: {
  slides: StoryboardSlide[];
  onSelect: (slide: StoryboardSlide, mode?: StoryboardMode) => void;
}) {
  return (
    <main className="relative z-10 grid h-[calc(100%-4rem)] min-h-0 grid-cols-4 grid-rows-1 items-start gap-3 overflow-hidden p-5">
      {storyboardSlides.map((slide) => (
        <button
          key={slide.id}
          data-testid="storyboard-slide-card"
          data-slide-id={slide.id}
          type="button"
          onClick={() => onSelect(slide, 'zoom')}
          className="group flex min-h-0 flex-col overflow-hidden rounded-md border border-border bg-surface-panel p-3 text-left shadow-sm transition hover:border-ink/40 hover:shadow-md"
        >
          <div className="shrink-0 overflow-hidden rounded-sm border border-border-soft bg-ink">
            <SlideClip slide={slide} aspect="16:9" compact />
          </div>
          <div className="mt-3 flex shrink-0 items-baseline gap-3">
            <span className="shrink-0 font-mono text-xs text-ink-faint">{slide.number}</span>
            <h3 className="truncate font-display text-base font-semibold tracking-tight text-ink">
              {slide.title}
            </h3>
          </div>
          <p className="mt-1 shrink-0 truncate font-caption text-xs text-ink-dim">
            {slide.kicker}
          </p>
          <p className="mt-3 line-clamp-3 shrink-0 font-mono text-[11px] leading-relaxed text-ink-muted">
            {slide.voiceover}
          </p>
        </button>
      ))}
    </main>
  );
}

function ZoomMode({
  slides: storyboardSlides,
  activeSlide,
  aspect,
  selectedElementId,
  elementEditingEnabled,
  showColorCodes,
  onAspectChange,
  onSelect,
  onSelectElement,
  onElementEditingChange,
  onShowColorCodesChange,
  onSlideChange,
}: {
  slides: StoryboardSlide[];
  activeSlide: StoryboardSlide;
  aspect: StoryboardAspect;
  selectedElementId: string | null;
  elementEditingEnabled: boolean;
  showColorCodes: boolean;
  onAspectChange: (aspect: StoryboardAspect) => void;
  onSelect: (slide: StoryboardSlide, mode?: StoryboardMode) => void;
  onSelectElement: (elementId: string | null) => void;
  onElementEditingChange: (enabled: boolean) => void;
  onShowColorCodesChange: (show: boolean) => void;
  onSlideChange: (slideId: StoryboardSlideId, patch: Partial<StoryboardSlide>) => void;
}) {
  const selectedElement =
    activeSlide.elements.find((element) => element.id === selectedElementId) ??
    activeSlide.elements[0] ??
    null;

  function updateElement(elementId: string, patch: Partial<StoryboardElement>) {
    onSlideChange(activeSlide.id, {
      elements: activeSlide.elements.map((element) =>
        element.id === elementId ? { ...element, ...patch } : element
      ),
    });
  }

  return (
    <main className="relative z-10 grid h-[calc(100%-4rem)] grid-cols-[220px_minmax(0,1fr)_340px] gap-5 p-5">
      <aside className="flex flex-col gap-2 overflow-auto">
        {storyboardSlides.map((slide) => {
          const active = slide.id === activeSlide.id;
          return (
            <button
              key={slide.id}
              type="button"
              onClick={() => onSelect(slide, 'zoom')}
              className={cn(
                'grid grid-cols-[72px_1fr] gap-3 rounded-md border bg-surface-panel p-2 text-left',
                active ? 'border-ink' : 'border-border hover:border-ink/40'
              )}
            >
              <div className="overflow-hidden rounded-sm bg-ink">
                <SlideClip slide={slide} aspect="16:9" compact />
              </div>
              <div className="self-center">
                <div className="font-mono text-[10px] text-ink-faint">{slide.number}</div>
                <div className="font-caption text-xs font-semibold leading-tight text-ink">
                  {slide.title}
                </div>
                <div className="mt-1 font-mono text-[10px] text-ink-faint">{slide.aspect}</div>
              </div>
            </button>
          );
        })}
      </aside>

      <section className="flex min-w-0 items-center justify-center">
        <div
          data-testid="storyboard-zoom-stage"
          className={cn(
            'max-h-full max-w-full overflow-hidden rounded-md border border-ink bg-ink shadow-lg',
            aspectClass[aspect],
            aspect === '16:9' ? 'w-full max-w-5xl' : 'h-full',
            aspect === '1:1' ? 'max-h-[min(100%,720px)]' : ''
          )}
        >
          <SlideClip
            slide={activeSlide}
            aspect={aspect}
            editable={elementEditingEnabled}
            selectedElementId={selectedElement?.id ?? null}
            onSelectElement={onSelectElement}
            onElementChange={updateElement}
          />
        </div>
      </section>

      <aside className="max-h-full self-center overflow-auto rounded-md border border-border bg-surface-panel/90 p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="font-caption text-xs text-ink-dim">slide script</div>
          <button
            type="button"
            onClick={() => {
              const next = !elementEditingEnabled;
              onElementEditingChange(next);
              if (!next) {
                onSelectElement(null);
                onShowColorCodesChange(false);
              }
            }}
            className={cn(
              'h-8 rounded-md border px-3 font-mono text-[10px] uppercase tracking-wide',
              elementEditingEnabled
                ? 'border-ink bg-ink text-white'
                : 'border-border bg-surface-canvas text-ink-muted hover:border-ink/50'
            )}
          >
            {elementEditingEnabled ? 'done editing' : 'edit elements'}
          </button>
        </div>
        <label className="mt-3 block">
          <span className="font-caption text-[10px] text-ink-faint">heading</span>
          <input
            value={activeSlide.title}
            onChange={(event) => onSlideChange(activeSlide.id, { title: event.target.value })}
            className="mt-1 h-10 w-full rounded-md border border-border bg-surface-canvas px-3 font-display text-xl font-semibold text-ink outline-none focus:border-ink"
          />
        </label>
        <label className="mt-3 block">
          <span className="font-caption text-[10px] text-ink-faint">line</span>
          <input
            value={activeSlide.kicker}
            onChange={(event) => onSlideChange(activeSlide.id, { kicker: event.target.value })}
            className="mt-1 h-9 w-full rounded-md border border-border bg-surface-canvas px-3 font-mono text-xs text-ink-muted outline-none focus:border-ink"
          />
        </label>
        <div className="mt-4">
          <div className="font-caption text-[10px] text-ink-faint">aspect</div>
          <div className="mt-2 grid grid-cols-4 gap-1.5">
            {(['16:9', '4:5', '9:16', '1:1'] as StoryboardAspect[]).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => {
                  onAspectChange(item);
                  onSlideChange(activeSlide.id, { aspect: item });
                }}
                className={cn(
                  'h-8 rounded-md border font-mono text-[10px]',
                  aspect === item
                    ? 'border-ink bg-ink text-white'
                    : 'border-border bg-surface-canvas text-ink-muted hover:border-ink/50'
                )}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-4">
          <div className="font-caption text-[10px] text-ink-faint">theme</div>
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            {(['aether', 'codex'] as StoryboardTheme[]).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => onSlideChange(activeSlide.id, { theme: item })}
                className={cn(
                  'h-8 rounded-md border font-mono text-[10px] uppercase',
                  activeSlide.theme === item
                    ? 'border-ink bg-ink text-white'
                    : 'border-border bg-surface-canvas text-ink-muted hover:border-ink/50'
                )}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
        {elementEditingEnabled ? (
          <div className="mt-4 border-t border-border-soft pt-4">
          <div className="flex items-center justify-between gap-2">
            <div className="font-caption text-[10px] text-ink-faint">elements</div>
            <label className="flex items-center gap-2 font-mono text-[10px] text-ink-muted">
              <input
                type="checkbox"
                checked={showColorCodes}
                onChange={(event) => onShowColorCodesChange(event.target.checked)}
              />
              color codes
            </label>
          </div>
          <div className="mt-2 grid max-h-28 gap-1 overflow-auto">
            {activeSlide.elements.length > 0 ? (
              activeSlide.elements.map((element) => (
              <button
                key={element.id}
                type="button"
                onClick={() => onSelectElement(element.id)}
                className={cn(
                  'flex h-8 items-center justify-between rounded-md border px-2 text-left font-mono text-[10px]',
                  selectedElement?.id === element.id
                    ? 'border-ink bg-ink text-white'
                    : 'border-border bg-surface-canvas text-ink-muted hover:border-ink/50'
                )}
              >
                <span className="truncate">{element.label}</span>
                <span className="uppercase opacity-60">{element.kind}</span>
              </button>
              ))
            ) : (
              <div className="rounded-md border border-border-soft bg-surface-canvas px-3 py-2 font-mono text-[10px] text-ink-faint">
                no overlay elements
              </div>
            )}
          </div>
          {showColorCodes ? (
            <div className="mt-2 grid grid-cols-3 gap-1.5 font-mono text-[9px] text-ink-faint">
              {(activeSlide.theme === 'codex'
                ? ['#f7f9ff', '#0b0c0f', '#dbe8ff']
                : ['#050507', '#f7d66b', '#faf6ef']
              ).map((color) => (
                <div key={color} className="flex items-center gap-1">
                  <span className="size-3 rounded-sm border border-border" style={{ background: color }} />
                  {color}
                </div>
              ))}
            </div>
          ) : null}
          {selectedElement ? (
          <div className="mt-4 rounded-md border border-border-soft bg-surface-canvas/80 p-3">
            <div className="font-caption text-[10px] text-ink-faint">selected element</div>
            {selectedElement.kind === 'text' ? (
              <label className="mt-2 block">
                <span className="font-caption text-[10px] text-ink-faint">text</span>
                <textarea
                  value={selectedElement.text ?? ''}
                  onChange={(event) => updateElement(selectedElement.id, { text: event.target.value })}
                  className="mt-1 min-h-16 w-full resize-none rounded-md border border-border bg-surface-panel px-2 py-1 font-mono text-[11px] leading-relaxed text-ink-muted outline-none focus:border-ink"
                />
              </label>
            ) : null}
            <div className="mt-2 grid grid-cols-2 gap-2">
              <label>
                <span className="font-caption text-[10px] text-ink-faint">color</span>
                <input
                  type="color"
                  value={selectedElement.color ?? '#ffffff'}
                  onChange={(event) => updateElement(selectedElement.id, { color: event.target.value })}
                  className="mt-1 h-8 w-full rounded-md border border-border bg-surface-panel"
                />
              </label>
              <label>
                <span className="font-caption text-[10px] text-ink-faint">fill</span>
                <input
                  type="color"
                  value={selectedElement.fill ?? '#111827'}
                  onChange={(event) => updateElement(selectedElement.id, { fill: event.target.value })}
                  className="mt-1 h-8 w-full rounded-md border border-border bg-surface-panel"
                />
              </label>
            </div>
            {showColorCodes ? (
              <div className="mt-2 font-mono text-[10px] text-ink-faint">
                {selectedElement.color ?? 'no color'} · {selectedElement.fill ?? 'no fill'}
              </div>
            ) : null}
          </div>
          ) : null}
        </div>
        ) : null}
        <label className="mt-4 block">
          <span className="font-caption text-[10px] text-ink-faint">voiceover</span>
          <textarea
            value={activeSlide.voiceover}
            onChange={(event) => onSlideChange(activeSlide.id, { voiceover: event.target.value })}
            className="mt-1 min-h-28 w-full resize-none rounded-md border border-border bg-surface-canvas px-3 py-2 font-mono text-xs leading-relaxed text-ink-muted outline-none focus:border-ink"
          />
        </label>
        <button
          type="button"
          onClick={() => onSelect(activeSlide, 'share')}
          className="mt-6 inline-flex h-10 w-full items-center justify-center rounded-md bg-ink px-3 font-mono text-xs uppercase tracking-wide text-white"
        >
          enter 100% share
        </button>
      </aside>
    </main>
  );
}

function ShareMode({
  slides: storyboardSlides,
  activeSlide,
  aspect,
  onAspectChange,
  onSelect,
  onModeChange,
  onClose,
}: {
  slides: StoryboardSlide[];
  activeSlide: StoryboardSlide;
  aspect: StoryboardAspect;
  onAspectChange: (aspect: StoryboardAspect) => void;
  onSelect: (slide: StoryboardSlide, mode?: StoryboardMode) => void;
  onModeChange: (mode: StoryboardMode) => void;
  onClose?: () => void;
}) {
  return (
    <main className="relative z-10 flex h-full flex-col bg-[#050507] p-5">
      <div className="pointer-events-auto absolute left-5 top-5 z-20 flex gap-2 opacity-0 transition-opacity duration-200 hover:opacity-100">
        <button
          type="button"
          onClick={() => onModeChange('overview')}
          className="h-9 rounded-md border border-white/15 bg-black/55 px-3 font-mono text-[11px] uppercase tracking-wide text-white/80 backdrop-blur-md hover:text-white"
        >
          overview
        </button>
        <button
          type="button"
          onClick={() => onModeChange('zoom')}
          className="h-9 rounded-md border border-white/15 bg-black/55 px-3 font-mono text-[11px] uppercase tracking-wide text-white/80 backdrop-blur-md hover:text-white"
        >
          zoom
        </button>
      </div>
      <button
        type="button"
        data-testid="storyboard-share-close"
        onPointerDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onClose?.();
        }}
        onClick={onClose}
        className="pointer-events-auto absolute right-5 top-5 z-20 inline-flex size-9 items-center justify-center rounded-md border border-white/15 bg-black/55 text-white/70 opacity-0 backdrop-blur-md transition-opacity duration-200 hover:text-white hover:opacity-100 focus:opacity-100"
        aria-label="close storyboard"
      >
        <X size={15} strokeWidth={1.75} />
      </button>
      <div className="pointer-events-auto absolute left-5 right-5 top-16 z-20 flex items-center justify-between gap-3 opacity-0 transition-opacity duration-200 hover:opacity-100">
        <div className="flex gap-2">
          {storyboardSlides.map((slide) => (
            <button
              key={slide.id}
              type="button"
              onClick={() => {
                onSelect(slide, 'share');
                onAspectChange(slide.aspect);
              }}
              className={cn(
                'h-8 rounded-md border px-3 font-mono text-[11px]',
                slide.id === activeSlide.id
                  ? 'border-white bg-white text-black'
                  : 'border-white/15 bg-black/55 text-white/72 backdrop-blur-md'
              )}
            >
              {slide.number}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          {(['16:9', '4:5', '9:16', '1:1'] as StoryboardAspect[]).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => onAspectChange(item)}
              className={cn(
                'h-8 min-w-16 rounded-md border px-3 font-mono text-[11px]',
                aspect === item
                  ? 'border-white bg-white text-black'
                  : 'border-white/15 bg-black/55 text-white/72 backdrop-blur-md'
              )}
            >
              {item}
            </button>
          ))}
        </div>
      </div>
      <section className="flex min-h-0 flex-1 items-center justify-center">
        <div
          className={cn(
            'max-h-full max-w-full overflow-hidden bg-ink shadow-[0_34px_120px_rgba(0,0,0,0.42)]',
            aspectClass[aspect],
            aspect === '9:16' ? 'h-full' : 'w-full',
            aspect === '4:5' ? 'h-full' : '',
            aspect === '1:1' ? 'h-full' : ''
          )}
        >
          <SlideClip slide={activeSlide} aspect={aspect} />
        </div>
      </section>
      <div className="pointer-events-none absolute bottom-5 left-0 right-0 text-center font-caption text-xs text-white/20">
        {activeSlide.number} · {activeSlide.title} · 100% slide share
      </div>
    </main>
  );
}

function SlideClip({
  slide,
  aspect,
  compact = false,
  fill = false,
  editable = false,
  selectedElementId,
  onSelectElement,
  onElementChange,
}: {
  slide: StoryboardSlide;
  aspect: StoryboardAspect;
  compact?: boolean;
  fill?: boolean;
  editable?: boolean;
  selectedElementId?: string | null;
  onSelectElement?: (elementId: string | null) => void;
  onElementChange?: (elementId: string, patch: Partial<StoryboardElement>) => void;
}) {
  return (
    <div
      className={cn(
        'relative w-full overflow-hidden bg-[#f7f1e8]',
        fill ? 'h-full' : aspectClass[aspect]
      )}
      style={{ containerType: 'size' }}
    >
      {slide.id === 'problem' ? (
        <RenderedSceneClip src="/storyboard/problem-opener.mp4" label={slide.title} />
      ) : slide.id === 'mask' ? (
        <RenderedSceneClip src="/storyboard/aether-mask-no-caption.mp4" label={slide.title} />
      ) : slide.id === 'why-now' ? (
        <WhyNowClip compact={compact} aspect={aspect} />
      ) : (
        <AdaptiveClip compact={compact} aspect={aspect} />
      )}
      <EditableElementLayer
        compact={compact}
        editable={editable}
        elements={slide.elements}
        selectedElementId={selectedElementId}
        onSelectElement={onSelectElement}
        onElementChange={onElementChange}
      />
    </div>
  );
}

function RenderedSceneClip({
  src,
  label,
  startTime = 0,
  endTime,
}: {
  src: string;
  label: string;
  startTime?: number;
  endTime?: number;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const seekToStart = () => {
      if (startTime > 0 && Math.abs(video.currentTime - startTime) > 0.12) {
        video.currentTime = startTime;
      }
    };
    const loopSegment = () => {
      if (endTime && video.currentTime >= endTime) {
        video.currentTime = startTime;
        void video.play().catch(() => undefined);
      }
    };

    video.addEventListener('loadedmetadata', seekToStart);
    video.addEventListener('timeupdate', loopSegment);
    seekToStart();

    return () => {
      video.removeEventListener('loadedmetadata', seekToStart);
      video.removeEventListener('timeupdate', loopSegment);
    };
  }, [endTime, src, startTime]);

  return (
    <div className="absolute inset-0 bg-black">
      <video
        ref={videoRef}
        src={src}
        aria-label={label}
        className="absolute inset-0 h-full w-full object-cover"
        muted
        loop
        autoPlay
        playsInline
        preload="auto"
      />
    </div>
  );
}

function EditableElementLayer({
  elements,
  compact,
  editable,
  selectedElementId,
  onSelectElement,
  onElementChange,
}: {
  elements: StoryboardElement[];
  compact: boolean;
  editable: boolean;
  selectedElementId?: string | null;
  onSelectElement?: (elementId: string | null) => void;
  onElementChange?: (elementId: string, patch: Partial<StoryboardElement>) => void;
}) {
  const selected = elements.find((element) => element.id === selectedElementId);
  const showVerticalGuide = selected
    ? Math.abs(selected.x + selected.w / 2 - 50) < 3 || Math.abs(selected.x - 50) < 3
    : false;
  const showHorizontalGuide = selected
    ? Math.abs(selected.y + selected.h / 2 - 50) < 3 || Math.abs(selected.y - 50) < 3
    : false;

  return (
    <div
      className={cn('absolute inset-0', editable ? 'pointer-events-auto' : 'pointer-events-none')}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onSelectElement?.(null);
      }}
    >
      {editable && showVerticalGuide ? (
        <div className="pointer-events-none absolute bottom-0 left-1/2 top-0 z-[90] w-px bg-[#d7e5ff]/85" />
      ) : null}
      {editable && showHorizontalGuide ? (
        <div className="pointer-events-none absolute left-0 right-0 top-1/2 z-[90] h-px bg-[#d7e5ff]/85" />
      ) : null}
      {[...elements]
        .sort((a, b) => a.z - b.z)
        .map((element) => (
          <EditableElementBox
            key={element.id}
            compact={compact}
            editable={editable}
            element={element}
            selected={element.id === selectedElementId}
            onSelect={onSelectElement}
            onChange={onElementChange}
          />
        ))}
    </div>
  );
}

function EditableElementBox({
  element,
  compact,
  editable,
  selected,
  onSelect,
  onChange,
}: {
  element: StoryboardElement;
  compact: boolean;
  editable: boolean;
  selected: boolean;
  onSelect?: (elementId: string | null) => void;
  onChange?: (elementId: string, patch: Partial<StoryboardElement>) => void;
}) {
  function startDrag(event: PointerEvent<HTMLDivElement>) {
    if (!editable || !onChange) return;
    event.preventDefault();
    event.stopPropagation();
    onSelect?.(element.id);

    const parent = event.currentTarget.parentElement?.getBoundingClientRect();
    if (!parent) return;
    const start = { x: event.clientX, y: event.clientY, element };

    const move = (moveEvent: globalThis.PointerEvent) => {
      const dx = ((moveEvent.clientX - start.x) / parent.width) * 100;
      const dy = ((moveEvent.clientY - start.y) / parent.height) * 100;
      onChange(element.id, {
        x: clampValue(start.element.x + dx, 0, 100 - start.element.w),
        y: clampValue(start.element.y + dy, 0, 100 - start.element.h),
      });
    };
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
  }

  function startResize(event: PointerEvent<HTMLDivElement>) {
    if (!editable || !onChange) return;
    event.preventDefault();
    event.stopPropagation();

    const parent = event.currentTarget.parentElement?.parentElement?.getBoundingClientRect();
    if (!parent) return;
    const start = { x: event.clientX, y: event.clientY, element };

    const move = (moveEvent: globalThis.PointerEvent) => {
      const dw = ((moveEvent.clientX - start.x) / parent.width) * 100;
      const dh = ((moveEvent.clientY - start.y) / parent.height) * 100;
      onChange(element.id, {
        w: clampValue(start.element.w + dw, 5, 100 - start.element.x),
        h: clampValue(start.element.h + dh, 4, 100 - start.element.y),
      });
    };
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
  }

  const frameStyle = {
    left: `${element.x}%`,
    top: `${element.y}%`,
    width: `${element.w}%`,
    height: `${element.h}%`,
    zIndex: element.z,
    opacity: element.opacity ?? 1,
  };

  return (
    <div
      className={cn(
        'absolute',
        editable ? 'cursor-move' : '',
        selected && editable ? 'outline outline-1 outline-[#d7e5ff]' : ''
      )}
      style={frameStyle}
      onPointerDown={startDrag}
    >
      {element.kind === 'text' ? (
        <div
          className={cn(
            'flex h-full w-full items-center whitespace-pre-line leading-[0.95]',
            element.font === 'mono'
              ? 'font-mono text-[clamp(7px,1.7cqw,24px)]'
              : element.font === 'serif'
                ? 'font-serif text-[clamp(16px,3.6cqw,58px)] italic'
                : 'font-display text-[clamp(18px,4.7cqw,76px)] font-black tracking-tight',
            compact ? 'text-[clamp(7px,2.1cqw,22px)]' : ''
          )}
          style={{ color: element.color ?? '#ffffff' }}
        >
          {element.text}
        </div>
      ) : element.kind === 'shape' ? (
        <div
          className="h-full w-full border"
          style={{
            background: element.fill ?? '#111827',
            borderColor: element.color ?? 'rgba(255,255,255,0.18)',
            borderRadius: `${element.radius ?? 2}%`,
          }}
        />
      ) : element.kind === 'video' ? (
        <video
          src={element.src ?? ''}
          className="h-full w-full object-cover"
          style={{ borderRadius: `${element.radius ?? 2}%` }}
          muted
          loop
          autoPlay
          playsInline
        />
      ) : (
        <img
          src={element.src ?? ''}
          alt=""
          className="h-full w-full object-cover"
          style={{ borderRadius: `${element.radius ?? 2}%` }}
        />
      )}
      {selected && editable ? (
        <>
          <div className="pointer-events-none absolute -left-2 -top-5 rounded bg-[#d7e5ff] px-1.5 py-0.5 font-mono text-[9px] text-black">
            {element.label}
          </div>
          <div
            className="absolute -bottom-1.5 -right-1.5 size-3 cursor-nwse-resize rounded-sm border border-black bg-[#d7e5ff]"
            onPointerDown={startResize}
          />
        </>
      ) : null}
    </div>
  );
}

function clampValue(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function ProblemClip({ compact }: { compact?: boolean }) {
  return (
    <div className="absolute inset-0 bg-[#060607] text-white">
      <div className="absolute inset-0 animate-[storyboardDrift_7s_ease-in-out_infinite] bg-[radial-gradient(circle_at_30%_34%,rgba(255,226,150,0.24),transparent_24%),radial-gradient(circle_at_72%_62%,rgba(255,255,255,0.14),transparent_28%)]" />
      <div className="absolute inset-x-0 top-[13%] h-[18%] bg-black/55" />
      <div className="absolute inset-x-0 bottom-[13%] h-[18%] bg-black/55" />
      <div className="absolute left-[13%] top-[22%] font-mono text-[clamp(7px,0.95cqw,14px)] uppercase tracking-[0.45em] text-white/42">
        problem
      </div>
      <div className="absolute left-[13%] top-[32%] w-[44%]">
        <div className="font-serif text-[clamp(20px,4.8cqw,72px)] italic leading-[0.95] text-[#f2d66d]">
          For more than
        </div>
        <div className="mt-[1%] font-serif text-[clamp(30px,7.2cqw,112px)] italic leading-[0.92] text-[#f2d66d]">
          30 years.
        </div>
      </div>
      <div className="absolute right-[13%] top-[34%] flex h-[28%] w-[28%] items-center justify-center rounded-md border border-[#f2d66d]/20 bg-black/40 shadow-[0_30px_90px_rgba(0,0,0,0.45)]">
        <div className="font-display text-[clamp(26px,5.4cqw,88px)] font-black uppercase leading-none tracking-[-0.04em] text-[#a99962]">
          one tax.
        </div>
      </div>
      {!compact ? (
        <div className="absolute bottom-[12%] left-[13%] font-mono text-[clamp(8px,1cqw,14px)] uppercase tracking-[0.48em] text-white/45">
          the cost of creative production
        </div>
      ) : null}
    </div>
  );
}

function MaskClip({ compact }: { compact?: boolean }) {
  return (
    <div className="absolute inset-0 bg-[#f4efe6] text-[#050507]">
      <div className="absolute inset-0 animate-[storyboardDrift_8s_ease-in-out_infinite] bg-[radial-gradient(circle_at_18%_28%,rgba(255,255,255,0.95),transparent_30%),radial-gradient(circle_at_82%_72%,rgba(10,14,26,0.08),transparent_30%)]" />
      <div className="absolute left-1/2 top-1/2 flex w-[78%] -translate-x-1/2 -translate-y-1/2 items-center justify-center gap-[3%] rounded-[40px] bg-white/35 px-[6%] py-[7%] shadow-[0_28px_90px_rgba(10,14,26,0.12)]">
        <AetherHouse compact={compact} />
        <div className="bg-[url('/storyboard/canva2.png')] bg-cover bg-center bg-clip-text font-display text-[clamp(48px,14cqw,210px)] font-black leading-none text-transparent [-webkit-text-stroke:1px_rgba(0,0,0,0.08)]">
          Aether
        </div>
      </div>
      <div className="absolute bottom-[13%] left-1/2 -translate-x-1/2 whitespace-nowrap font-mono text-[clamp(7px,1.1cqw,14px)] uppercase tracking-[0.42em] text-[#8b7441]">
        built with · codex · gpt-5.5 · gpt image 2
      </div>
    </div>
  );
}

function WhyNowClip({
  compact,
  aspect,
}: {
  compact?: boolean;
  aspect: StoryboardAspect;
}) {
  const portrait = aspect === '4:5' || aspect === '9:16';
  return (
    <div className="absolute inset-0 overflow-hidden bg-[#f7f9ff] text-[#0b0c0f]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_16%,rgba(219,232,255,0.88),transparent_31%),radial-gradient(circle_at_82%_42%,rgba(255,255,255,0.96),transparent_34%),linear-gradient(180deg,#fbfdff_0%,#eef5ff_100%)]" />
      <div className="absolute inset-0 opacity-[0.28] [background-image:linear-gradient(rgba(75,95,130,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(75,95,130,0.12)_1px,transparent_1px)] [background-size:42px_42px]" />
      <div
        className={cn(
          'absolute z-[5]',
          portrait ? 'left-[8%] top-[8%] w-[84%]' : 'left-[7%] top-[14%] w-[54%]'
        )}
      >
        <div className="font-mono text-[clamp(8px,1.1cqw,14px)] text-[#667085]">
          Why Now
        </div>
        <div className="mt-[3%] font-display text-[clamp(28px,6.2cqw,88px)] font-black leading-[0.92] tracking-tight text-[#0b0c0f]">
          Non-verifiable work became programmable.
        </div>
        <div className="mt-[5%] flex flex-wrap gap-[2%]">
          {['Codex', 'GPT-5.5', 'GPT Image 2'].map((chip) => (
            <span
              key={chip}
              className="rounded-full border border-[#dbe8ff] bg-[#fbfdff]/90 px-[3%] py-[1.2%] font-mono text-[clamp(8px,1.05cqw,14px)] text-[#667085] shadow-[0_10px_26px_rgba(49,72,112,0.10)]"
            >
              {chip}
            </span>
          ))}
        </div>
      </div>
      {!compact ? (
        <>
          <img
            src="/storyboard/social-media-cards.png"
            alt=""
            className={cn(
              'absolute z-[2] object-contain drop-shadow-[0_22px_34px_rgba(45,64,96,0.18)]',
              portrait ? 'right-[3%] top-[45%] w-[42%]' : 'right-[7%] top-[12%] w-[22%]'
            )}
          />
          <img
            src="/storyboard/code-brackets-icon.png"
            alt=""
            className={cn(
              'absolute z-[3] object-contain opacity-90 drop-shadow-[0_16px_22px_rgba(45,64,96,0.16)]',
              portrait ? 'right-[9%] top-[31%] w-[18%]' : 'right-[31%] top-[28%] w-[8%]'
            )}
          />
          <img
            src="/storyboard/cursor-click.png"
            alt=""
            className={cn(
              'absolute z-[6] object-contain drop-shadow-[0_16px_24px_rgba(45,64,96,0.20)]',
              portrait ? 'right-[11%] top-[56%] w-[16%]' : 'right-[34%] top-[57%] w-[7%]'
            )}
          />
          <img
            src="/storyboard/azza_illu.png"
            alt=""
            className={cn(
              'absolute bottom-0 z-[4] object-contain drop-shadow-[0_30px_44px_rgba(45,64,96,0.20)]',
              portrait ? 'right-[-5%] h-[54%]' : 'right-[5%] h-[76%]'
            )}
          />
        </>
      ) : null}
    </div>
  );
}

function AdaptiveClip({
  compact,
  aspect,
}: {
  compact?: boolean;
  aspect: StoryboardAspect;
}) {
  const portrait = aspect === '4:5' || aspect === '9:16';
  return (
    <div className="absolute inset-0 overflow-hidden bg-[#f7f9ff] text-[#050507]">
      {!compact ? (
        <>
          <StoryboardSoundCue src="/storyboard/mouse-click.mp3" delay={2448} />
          <StoryboardSoundCue src="/storyboard/ui-pop.mp3" delay={4176} />
        </>
      ) : null}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(219,232,255,0.95),transparent_42%),radial-gradient(circle_at_18%_22%,rgba(255,255,255,0.86),transparent_28%),linear-gradient(180deg,#fbfdff_0%,#eef5ff_100%)]" />
      <div className="absolute inset-0 opacity-[0.2] [background-image:linear-gradient(rgba(75,95,130,0.11)_1px,transparent_1px),linear-gradient(90deg,rgba(75,95,130,0.11)_1px,transparent_1px)] [background-size:44px_44px]" />

      <div
        className="storyboard-aether-sequence-phase absolute inset-0"
        style={{ animation: 'storyboardAetherPhaseOne 7.2s cubic-bezier(0.22,1,0.36,1) infinite' }}
      >
        <div className="absolute left-1/2 top-1/2 flex w-[70%] -translate-x-1/2 -translate-y-1/2 items-center justify-center gap-[4%] rounded-full bg-[#e8e3d8] px-[6%] py-[5%] shadow-[0_24px_64px_rgba(10,10,10,0.08)]">
          <AetherHouse compact className="text-[#0a0a0a]" />
          <div className="font-display text-[clamp(42px,13cqw,210px)] font-black leading-none tracking-tight">
            Aether
          </div>
        </div>
      </div>

      <div
        className="storyboard-aether-sequence-phase absolute inset-0"
        style={{ animation: 'storyboardAetherPhaseTwo 7.2s cubic-bezier(0.22,1,0.36,1) infinite' }}
      >
        <div className="absolute left-1/2 top-1/2 flex w-[72%] -translate-x-1/2 -translate-y-1/2 items-center justify-center gap-[4%] rounded-full bg-[#e8e3d8] px-[6%] py-[5%] shadow-[0_28px_70px_rgba(10,10,10,0.10)]">
          <AetherHouse compact className="text-[#0a0a0a]" />
          <div className="font-display text-[clamp(42px,13cqw,210px)] font-black leading-none tracking-tight">
            Aether
          </div>
          <div
            className="storyboard-aether-click-pulse pointer-events-none absolute inset-[-8%] rounded-full border border-[#0b0c0f]/20"
            style={{ animation: 'storyboardClickPulse 7.2s cubic-bezier(0.22,1,0.36,1) infinite' }}
          />
        </div>
      </div>

      <div
        className="storyboard-aether-sequence-phase absolute inset-0"
        style={{ animation: 'storyboardAetherPhaseThree 7.2s cubic-bezier(0.22,1,0.36,1) infinite' }}
      >
        <div className="absolute left-1/2 top-1/2 flex w-[70%] -translate-x-1/2 -translate-y-1/2 items-center justify-center gap-[4%] rounded-full bg-[#e8e3d8] px-[6%] py-[4.4%] shadow-[0_20px_42px_rgba(0,0,0,0.10)]">
          <AetherHouse compact className="text-[#0a0a0a]" />
          <div className="font-display text-[clamp(38px,12cqw,194px)] font-black leading-none tracking-tight">
            Aether
          </div>
        </div>
        <div
          className="storyboard-aether-cursor absolute left-[58%] top-[54%] z-[6] drop-shadow-[0_8px_12px_rgba(10,10,10,0.2)]"
          style={{ animation: 'storyboardCursorClick 7.2s cubic-bezier(0.22,1,0.36,1) infinite' }}
        >
          <ChunkyStoryboardCursor />
        </div>
      </div>

      <div
        className="storyboard-aether-sequence-phase storyboard-aether-final absolute inset-0"
        style={{ animation: 'storyboardAetherPhaseFour 7.2s cubic-bezier(0.22,1,0.36,1) infinite' }}
      >
        <div
          className={cn(
            'absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-center font-mono uppercase tracking-[0.48em] text-[#c68e86]/70',
            portrait ? 'top-[12%] text-[clamp(7px,1.8cqw,12px)]' : 'top-[21%] text-[clamp(8px,1.15cqw,18px)]',
            compact ? 'top-[12%] text-[clamp(6px,1.15cqw,10px)]' : ''
          )}
        >
          Native social formats
        </div>
        <div
          className={cn(
            'absolute left-1/2 grid -translate-x-1/2 place-items-center',
            portrait
              ? 'bottom-[17%] top-[31%] w-[70%] grid-rows-[1fr_1.18fr_1.6fr] gap-[4%]'
              : compact
                ? 'bottom-[15%] top-[39%] w-[72%] grid-cols-[1fr_1.08fr_1.05fr] items-end gap-[7%]'
                : 'bottom-[22%] top-[38%] w-[60%] grid-cols-[1fr_1.08fr_1.05fr] items-end gap-[7%]'
          )}
        >
          <AdaptiveFormatTile
            icon="X"
            label="X · 16:9"
            className={cn('bg-[#050507]', portrait ? 'aspect-video h-full' : 'aspect-video h-[58%]')}
          />
          <AdaptiveFormatTile
            icon="▱"
            label="IG · 4x5"
            gradient
            className={cn(portrait ? 'aspect-[4/5] h-full' : 'aspect-[4/5] h-[88%]')}
          />
          <AdaptiveFormatTile
            icon="♪"
            label="TIKTOK · 9x16"
            className={cn('bg-[#050507]', portrait ? 'aspect-[9/16] h-full' : 'aspect-[9/16] h-full')}
          />
        </div>
      </div>
    </div>
  );
}

function StoryboardSoundCue({ src, delay = 0 }: { src: string; delay?: number }) {
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const play = () => {
      const audio = audioRef.current;
      if (!audio) return;
      audio.volume = 0.34;
      audio.currentTime = 0;
      void audio.play().catch(() => undefined);
    };
    let interval: number | undefined;
    const timer = window.setTimeout(() => {
      play();
      interval = window.setInterval(play, 7200);
    }, delay);

    return () => {
      window.clearTimeout(timer);
      if (interval) window.clearInterval(interval);
    };
  }, [delay, src]);

  return <audio ref={audioRef} src={src} preload="auto" />;
}

function ChunkyStoryboardCursor() {
  return (
    <svg width="72" height="72" viewBox="0 0 24 24" aria-hidden>
      <path
        d="M3 2 L3 19 L8 14 L11 21 L14 20 L11 13 L18 13 Z"
        fill="#fff"
        stroke="#0a0a0a"
        strokeWidth="2.4"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

function AdaptiveFormatTile({
  icon,
  label,
  className,
  gradient = false,
}: {
  icon: string;
  label: string;
  className: string;
  gradient?: boolean;
}) {
  return (
    <div
      className={cn(
        'relative min-h-0 max-h-full max-w-full overflow-hidden rounded-[min(2.1cqw,22px)] text-white shadow-[0_24px_55px_rgba(10,14,26,0.16)]',
        gradient ? 'bg-[linear-gradient(135deg,#ffd66b_0%,#f0557a_48%,#6857ff_100%)]' : '',
        className
      )}
    >
      <div className="absolute left-[10%] top-[10%] font-sans text-[clamp(13px,2.4cqw,33px)] leading-none text-white">
        {icon}
      </div>
      <div className="absolute bottom-[10%] left-[10%] whitespace-pre-line font-mono text-[clamp(7px,1.15cqw,16px)] uppercase leading-tight tracking-[0.16em]">
        {label.replace(' · ', ' ·\n')}
      </div>
    </div>
  );
}

function AetherHouse({
  compact = false,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  const size = compact ? 34 : 72;
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={cn('shrink-0 text-current', className)}
      aria-hidden
    >
      <path
        d="M12 18 L52 18 L52 46 L12 46 Z M12 18 L32 6 L52 18"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="4.5"
      />
      <circle cx="32" cy="34" r="6" fill="none" stroke="currentColor" strokeWidth="4.5" />
    </svg>
  );
}
