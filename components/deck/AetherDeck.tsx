'use client';

import {
  type CSSProperties,
  type HTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
  type TouchEvent,
  type WheelEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Chip } from '@/components/ui/Chip';
import { IconButton } from '@/components/ui/IconButton';
import { cn } from '@/lib/utils/cn';
import {
  AETHER_DECK_STAGE,
  calculateFixedStageFit,
  clampSlideIndex,
  formatCssPx,
  formatCssScale,
  formatSlideUrl,
  slideIndexFromSearch,
  type StageSize,
} from '@/lib/deck/fixed-stage';
import type {
  DeckFragment,
  DeckHotspot,
  DeckNavigationState,
  DeckPresenterModeState,
  DeckSlideKind,
  DeckSlideProvenance,
  DeckSpeakerNotes,
} from '@/lib/deck/types';

export interface AetherDeckSlide {
  id: string;
  title?: string;
  kind?: DeckSlideKind;
  children: ReactNode;
  className?: string;
  fragments?: DeckFragment[];
  hotspots?: DeckHotspot[];
  speakerNotes?: DeckSpeakerNotes | string;
  provenance?: DeckSlideProvenance;
}

export interface FixedStageViewportProps extends HTMLAttributes<HTMLDivElement> {
  stageSize?: StageSize;
  fitBounds?: StageSize;
  reducedMotion?: boolean;
  children: ReactNode;
}

export interface AetherDeckProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  slides: AetherDeckSlide[];
  initialSlideIndex?: number;
  initialFragmentIndex?: number;
  presenterMode?: DeckPresenterModeState;
  slideParam?: string;
  urlState?: boolean;
  urlMode?: 'push' | 'replace';
  controls?: boolean;
  reducedMotion?: boolean;
  fitBounds?: StageSize;
  onSlideChange?: (state: DeckNavigationState) => void;
}

function readUrlSlideIndex(paramName: string, slideCount: number, fallbackIndex: number) {
  if (typeof window === 'undefined') return clampSlideIndex(fallbackIndex, slideCount);
  return slideIndexFromSearch(window.location.search, paramName, slideCount, fallbackIndex);
}

function usePrefersReducedMotion(override?: boolean) {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(() => {
    if (typeof override === 'boolean') return override;
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });

  useEffect(() => {
    if (typeof override === 'boolean') {
      setPrefersReducedMotion(override);
      return;
    }
    if (typeof window === 'undefined' || !window.matchMedia) return;

    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setPrefersReducedMotion(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, [override]);

  return prefersReducedMotion;
}

export function FixedStageViewport({
  stageSize = AETHER_DECK_STAGE,
  fitBounds,
  reducedMotion = false,
  className,
  children,
  style,
  ...rest
}: FixedStageViewportProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [measuredBounds, setMeasuredBounds] = useState<StageSize>(
    fitBounds ?? { width: stageSize.width, height: stageSize.height }
  );

  useEffect(() => {
    if (fitBounds) {
      setMeasuredBounds(fitBounds);
      return;
    }

    const viewport = viewportRef.current;
    if (!viewport) return;

    const measure = () => {
      const rect = viewport.getBoundingClientRect();
      setMeasuredBounds({
        width: rect.width || stageSize.width,
        height: rect.height || stageSize.height,
      });
    };

    measure();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }

    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [fitBounds, stageSize.height, stageSize.width]);

  const fit = calculateFixedStageFit(fitBounds ?? measuredBounds, stageSize);
  const scale = formatCssScale(fit.scale);

  const viewportStyle: CSSProperties = {
    ...style,
    ...(fitBounds ? { width: formatCssPx(fitBounds.width), height: formatCssPx(fitBounds.height) } : null),
  };

  return (
    <div
      ref={viewportRef}
      data-taxonomy="output"
      className={cn(
        'relative flex h-full min-h-0 w-full items-center justify-center overflow-hidden bg-surface-bg-muted',
        className
      )}
      data-aether-deck-viewport="true"
      data-stage-width={stageSize.width}
      data-stage-height={stageSize.height}
      data-stage-scale={scale}
      data-reduced-motion={reducedMotion ? 'true' : 'false'}
      style={viewportStyle}
      {...rest}
    >
      <div
        data-aether-deck-frame="true"
        className="relative shrink-0 overflow-hidden shadow-lg"
        style={{
          width: formatCssPx(fit.width),
          height: formatCssPx(fit.height),
        }}
      >
        <div
          data-aether-deck-stage="true"
          className="relative overflow-hidden bg-surface-canvas text-ink"
          style={{
            width: formatCssPx(stageSize.width),
            height: formatCssPx(stageSize.height),
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

interface DeckSlideLayerProps {
  slide: AetherDeckSlide;
  active: boolean;
  index: number;
  reducedMotion: boolean;
}

function renderSpeakerNotes(notes: DeckSpeakerNotes | string) {
  if (typeof notes === 'string') return notes;
  return [notes.summary, ...(notes.bullets ?? [])].filter(Boolean).join('\n');
}

export function DeckSlideLayer({
  slide,
  active,
  index,
  reducedMotion,
}: DeckSlideLayerProps) {
  return (
    <article
      role="group"
      aria-roledescription="slide"
      aria-label={slide.title ?? `Slide ${index + 1}`}
      aria-hidden={active ? undefined : true}
      data-aether-deck-slide="true"
      data-slide-id={slide.id}
      data-slide-kind={slide.kind ?? 'custom'}
      data-active={active ? 'true' : 'false'}
      data-fragment-count={slide.fragments?.length ?? 0}
      data-hotspot-count={slide.hotspots?.length ?? 0}
      className={cn(
        'absolute inset-0 overflow-hidden bg-surface-canvas text-ink',
        reducedMotion ? '' : 'transition-opacity duration-slow ease-out',
        slide.className
      )}
      style={{
        opacity: active ? 1 : 0,
        visibility: active ? 'visible' : 'hidden',
        pointerEvents: active ? 'auto' : 'none',
        transitionDuration: reducedMotion ? '0ms' : undefined,
      }}
    >
      {slide.children}
      {slide.provenance ? (
        <span
          className="sr-only"
          data-taxonomy="metadata"
          data-provenance-type={slide.provenance.type}
          data-provenance-source={slide.provenance.source}
          data-provenance-action-id={slide.provenance.actionId}
        >
          {slide.provenance.type}
        </span>
      ) : null}
      {slide.speakerNotes ? (
        <aside className="sr-only" data-taxonomy="metadata" data-speaker-notes="true">
          {renderSpeakerNotes(slide.speakerNotes)}
        </aside>
      ) : null}
    </article>
  );
}

interface DeckNavigationControlsProps {
  slideIndex: number;
  slideCount: number;
  onPrevious: () => void;
  onNext: () => void;
}

export function DeckNavigationControls({
  slideIndex,
  slideCount,
  onPrevious,
  onNext,
}: DeckNavigationControlsProps) {
  return (
    <nav
      aria-label="deck navigation"
      data-taxonomy="navigation"
      className="flex shrink-0 items-center justify-center gap-2"
    >
      <IconButton
        label="previous slide"
        icon={<ChevronLeft size={16} strokeWidth={1.8} />}
        onClick={onPrevious}
        disabled={slideCount <= 1 || slideIndex <= 0}
      />
      <Chip tone="neutral" variant="outline" className="min-w-16 justify-center">
        {slideCount === 0 ? '0 / 0' : `${slideIndex + 1} / ${slideCount}`}
      </Chip>
      <IconButton
        label="next slide"
        icon={<ChevronRight size={16} strokeWidth={1.8} />}
        onClick={onNext}
        disabled={slideCount <= 1 || slideIndex >= slideCount - 1}
      />
    </nav>
  );
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return (
    tag === 'input' ||
    tag === 'textarea' ||
    tag === 'select' ||
    target.isContentEditable
  );
}

export function AetherDeck({
  slides,
  initialSlideIndex = 0,
  initialFragmentIndex = 0,
  presenterMode,
  slideParam = 'slide',
  urlState = true,
  urlMode = 'push',
  controls = true,
  reducedMotion: reducedMotionOverride,
  fitBounds,
  onSlideChange,
  className,
  ...rest
}: AetherDeckProps) {
  const slideCount = slides.length;
  const [slideIndex, setSlideIndex] = useState(() =>
    urlState
      ? readUrlSlideIndex(slideParam, slideCount, initialSlideIndex)
      : clampSlideIndex(initialSlideIndex, slideCount)
  );
  const [fragmentIndex, setFragmentIndex] = useState(initialFragmentIndex);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const reducedMotion = usePrefersReducedMotion(reducedMotionOverride);

  const writeUrlState = useCallback(
    (nextIndex: number) => {
      if (!urlState || typeof window === 'undefined') return;
      const nextUrl = formatSlideUrl(
        window.location.href,
        nextIndex,
        slideParam,
        slideCount
      );
      const method = urlMode === 'replace' ? 'replaceState' : 'pushState';
      window.history[method](
        { ...(window.history.state ?? {}), aetherDeckSlide: nextIndex + 1 },
        '',
        nextUrl
      );
    },
    [slideCount, slideParam, urlMode, urlState]
  );

  const goToSlide = useCallback(
    (nextIndex: number, options?: { replaceUrl?: boolean }) => {
      if (slideCount <= 0) return;
      const clamped = clampSlideIndex(nextIndex, slideCount);
      setSlideIndex(clamped);
      setFragmentIndex(0);

      if (options?.replaceUrl && typeof window !== 'undefined' && urlState) {
        const nextUrl = formatSlideUrl(window.location.href, clamped, slideParam, slideCount);
        window.history.replaceState(
          { ...(window.history.state ?? {}), aetherDeckSlide: clamped + 1 },
          '',
          nextUrl
        );
        return;
      }
      writeUrlState(clamped);
    },
    [slideCount, slideParam, urlState, writeUrlState]
  );

  const goPrevious = useCallback(() => goToSlide(slideIndex - 1), [goToSlide, slideIndex]);
  const goNext = useCallback(() => goToSlide(slideIndex + 1), [goToSlide, slideIndex]);

  useEffect(() => {
    setSlideIndex((current) => clampSlideIndex(current, slideCount));
  }, [slideCount]);

  useEffect(() => {
    onSlideChange?.({
      slideIndex,
      fragmentIndex,
      slideId: slides[slideIndex]?.id,
      presenterMode,
    });
  }, [fragmentIndex, onSlideChange, presenterMode, slideIndex, slides]);

  useEffect(() => {
    if (!urlState || typeof window === 'undefined') return;

    const onPopState = () => {
      setSlideIndex((current) =>
        readUrlSlideIndex(slideParam, slideCount, current)
      );
      setFragmentIndex(0);
    };

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [slideCount, slideParam, urlState]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (isEditableTarget(event.target)) return;

    if (event.key === 'ArrowRight' || event.key === 'ArrowDown' || event.key === 'PageDown' || event.key === ' ') {
      event.preventDefault();
      goNext();
      return;
    }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp' || event.key === 'PageUp') {
      event.preventDefault();
      goPrevious();
      return;
    }
    if (event.key === 'Home') {
      event.preventDefault();
      goToSlide(0);
      return;
    }
    if (event.key === 'End') {
      event.preventDefault();
      goToSlide(slideCount - 1);
    }
  };

  const onWheel = (event: WheelEvent<HTMLDivElement>) => {
    const dominantDelta =
      Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
    if (Math.abs(dominantDelta) < 24) return;
    event.preventDefault();
    if (dominantDelta > 0) goNext();
    else goPrevious();
  };

  const onTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    if (!touch) return;
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const onTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    const start = touchStartRef.current;
    const touch = event.changedTouches[0];
    touchStartRef.current = null;
    if (!start || !touch) return;

    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
    if (dx < 0) goNext();
    else goPrevious();
  };

  return (
    <div
      role="region"
      aria-label="deck canvas"
      tabIndex={0}
      data-aether-deck="true"
      data-slide-index={slideIndex}
      data-fragment-index={fragmentIndex}
      data-reduced-motion={reducedMotion ? 'true' : 'false'}
      className={cn('flex h-full min-h-0 w-full flex-col gap-3', className)}
      onKeyDown={onKeyDown}
      onWheel={onWheel}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      {...rest}
    >
      <FixedStageViewport fitBounds={fitBounds} reducedMotion={reducedMotion}>
        {slides.map((slide, index) => (
          <DeckSlideLayer
            key={slide.id}
            slide={slide}
            index={index}
            active={index === slideIndex}
            reducedMotion={reducedMotion}
          />
        ))}
      </FixedStageViewport>
      {controls ? (
        <DeckNavigationControls
          slideIndex={slideIndex}
          slideCount={slideCount}
          onPrevious={goPrevious}
          onNext={goNext}
        />
      ) : null}
    </div>
  );
}
