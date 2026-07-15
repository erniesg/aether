'use client';

import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DeckArtifact, DeckBlock, DeckFragment, DeckSlide } from '@/lib/deck/types';
import { CodeReferenceBlock, LiveApiCallBlock, MetricsStripBlock, ProductFrameBlock } from './DeckBlocks';

const STAGE_WIDTH = 1920;
const STAGE_HEIGHT = 1080;
const CONTROL_CLEARANCE = 56;
const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';
const SLIDE_MS = 400;
const BLOCK_MS = 320;
const STAGGER_BASE_MS = 100;
const STAGGER_STEP_MS = 80;
type LiveDemoFocus = DeckArtifact['drawerTabs'][number];

// Live-demo slides delegate progressive disclosure to the Product/API/Code
// focus nav (one proof surface at a time), so their fragments stay inert here.
function orderedFragments(slide: DeckSlide): DeckFragment[] {
  if (slide.layout === 'live-demo' || !slide.fragments?.length) return [];
  return [...slide.fragments].sort((a, b) => a.order - b.order);
}

// Entrance choreography: copy leads, the primary artifact follows, supporting
// panels settle last.
function staggerRank(kind: DeckBlock['kind']): number {
  if (kind === 'copy') return 0;
  if (kind === 'product-frame' || kind === 'api-call') return 1;
  return 2;
}

export function DeckStage({ children }: { children: ReactNode }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const updateScale = useCallback(() => {
    const bounds = viewportRef.current?.getBoundingClientRect();
    if (!bounds?.width || !bounds.height) return;
    setScale(Math.min(bounds.width / STAGE_WIDTH, Math.max(0, bounds.height - CONTROL_CLEARANCE) / STAGE_HEIGHT));
  }, []);
  useEffect(() => {
    updateScale();
    const observer =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(updateScale);
    if (viewportRef.current) observer?.observe(viewportRef.current);
    window.addEventListener('resize', updateScale);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', updateScale);
    };
  }, [updateScale]);

  return (
    <div ref={viewportRef} data-testid="deck-stage-viewport" className="relative h-full min-h-0 w-full min-w-0 overflow-hidden">
      <div data-testid="deck-stage" className="absolute left-1/2 origin-center overflow-hidden" style={{ width: STAGE_WIDTH, height: STAGE_HEIGHT, top: `calc(50% - ${CONTROL_CLEARANCE / 2}px)`, transform: `translate(-50%, -50%) scale(${scale})` }}>
        {children}
      </div>
    </div>
  );
}

function slideIndexFromUrl(deck: DeckArtifact) {
  if (typeof window === 'undefined') return 0;
  const slideId = new URLSearchParams(window.location.search).get('slide');
  const index = deck.slides.findIndex((slide) => slide.id === slideId);
  return index < 0 ? 0 : index;
}

export function DeckPresentation({
  deck,
  presenterMode = true,
  liveDemoFocus = 'Product',
  onLiveDemoFocusChange,
}: {
  deck: DeckArtifact;
  presenterMode?: boolean;
  liveDemoFocus?: LiveDemoFocus;
  onLiveDemoFocusChange?: (focus: LiveDemoFocus) => void;
}) {
  const [index, setIndex] = useState(() => slideIndexFromUrl(deck));
  // Fragment reveal counts per slide id. A direct jump (deep link, hotspot,
  // branch chip, Home/End) lands fully revealed; stepping forward starts at 0.
  const [revealed, setRevealed] = useState<Record<string, number>>(() => {
    const entry = deck.slides[slideIndexFromUrl(deck)];
    return entry ? { [entry.id]: orderedFragments(entry).length } : {};
  });
  const touchStartX = useRef<number | null>(null);
  const reducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const revealedCountFor = useCallback(
    (slide: DeckSlide) => Math.min(revealed[slide.id] ?? 0, orderedFragments(slide).length),
    [revealed]
  );

  const advance = useCallback(() => {
    const slide = deck.slides[index];
    if (!slide) return;
    const count = revealedCountFor(slide);
    if (count < orderedFragments(slide).length) {
      setRevealed((prev) => ({ ...prev, [slide.id]: count + 1 }));
      return;
    }
    if (index >= deck.slides.length - 1) return;
    const next = deck.slides[index + 1];
    setRevealed((prev) => ({ ...prev, [next.id]: 0 }));
    setIndex(index + 1);
  }, [deck.slides, index, revealedCountFor]);

  const retreat = useCallback(() => {
    const slide = deck.slides[index];
    if (!slide) return;
    const count = revealedCountFor(slide);
    if (count > 0) {
      setRevealed((prev) => ({ ...prev, [slide.id]: count - 1 }));
      return;
    }
    if (index <= 0) return;
    const previous = deck.slides[index - 1];
    setRevealed((prev) => ({ ...prev, [previous.id]: orderedFragments(previous).length }));
    setIndex(index - 1);
  }, [deck.slides, index, revealedCountFor]);

  const jump = useCallback(
    (targetSlideId: string, targetBlockId?: string) => {
      const targetIndex = deck.slides.findIndex((slide) => slide.id === targetSlideId);
      if (targetIndex < 0) return;
      const target = deck.slides[targetIndex];
      const fragments = orderedFragments(target);
      const fragmentPosition = targetBlockId
        ? fragments.findIndex((fragment) => fragment.targetBlockId === targetBlockId)
        : -1;
      setRevealed((prev) => ({
        ...prev,
        [target.id]: fragmentPosition >= 0 ? fragmentPosition + 1 : fragments.length,
      }));
      setIndex(targetIndex);
      if (targetBlockId && target.layout === 'live-demo') {
        const block = target.blocks.find((candidate) => candidate.id === targetBlockId);
        const focus = block ? focusForBlock(block) : null;
        if (focus) onLiveDemoFocusChange?.(focus);
      }
    },
    [deck.slides, onLiveDemoFocusChange]
  );

  useEffect(() => {
    const slide = deck.slides[index];
    if (!slide || typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    url.searchParams.set('slide', slide.id);
    window.history.replaceState(window.history.state, '', url);
  }, [deck.slides, index]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((event.target as HTMLElement | null)?.tagName ?? '')) return;
      if (['ArrowRight', 'ArrowDown', ' ', 'PageDown'].includes(event.key)) { event.preventDefault(); advance(); }
      if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(event.key)) { event.preventDefault(); retreat(); }
      if (event.key === 'Home') jump(deck.slides[0]?.id ?? '');
      if (event.key === 'End') jump(deck.slides[deck.slides.length - 1]?.id ?? '');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [advance, deck.slides, jump, retreat]);

  const activeSlide = deck.slides[index];
  const activeFocuses = useMemo(
    () => (activeSlide ? availableLiveDemoFocuses(activeSlide) : []),
    [activeSlide]
  );

  useEffect(() => {
    if (!activeSlide || activeSlide.layout !== 'live-demo') return;
    if (activeFocuses.length > 0 && !activeFocuses.includes(liveDemoFocus)) {
      onLiveDemoFocusChange?.(activeFocuses[0]);
    }
  }, [activeFocuses, activeSlide, liveDemoFocus, onLiveDemoFocusChange]);

  const activeRevealed = activeSlide ? revealedCountFor(activeSlide) : 0;
  const activeFragmentTotal = activeSlide ? orderedFragments(activeSlide).length : 0;

  return (
    <div
      data-testid="deck-viewport"
      data-reduced-motion={reducedMotion}
      className="relative h-full min-h-0 flex-1 bg-[#0B0B0E]"
      onWheel={(event) => { if (Math.abs(event.deltaY) >= 20) { if (event.deltaY > 0) advance(); else retreat(); } }}
      onTouchStart={(event) => { touchStartX.current = event.touches[0]?.clientX ?? null; }}
      onTouchEnd={(event) => { const end = event.changedTouches[0]?.clientX; if (touchStartX.current !== null && end !== undefined && Math.abs(end - touchStartX.current) > 40) { if (end < touchStartX.current) advance(); else retreat(); } touchStartX.current = null; }}
    >
      <DeckStage>
        {deck.slides.map((slide, slideIndex) => (
          <DeckSlideFrame
            key={slide.id}
            slide={slide}
            deck={deck}
            active={slideIndex === index}
            offset={slideIndex - index}
            revealedCount={Math.min(revealed[slide.id] ?? 0, orderedFragments(slide).length)}
            onNavigate={jump}
            reducedMotion={reducedMotion}
            liveDemoFocus={liveDemoFocus}
            pageNumber={slideIndex + 1}
            liveDemoNav={slideIndex === index && slide.layout === 'live-demo' ? (
              <LiveDemoFocusNav
                deck={deck}
                availableFocuses={activeFocuses}
                selectedFocus={liveDemoFocus}
                onChange={onLiveDemoFocusChange}
              />
            ) : null}
          />
        ))}
      </DeckStage>
      <nav aria-label="deck navigation" data-taxonomy="navigation" data-testid="deck-navigation" className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/10 bg-[#151519]/95 px-1.5 py-1 text-white shadow-sm">
        <button type="button" aria-label="Previous slide" onClick={retreat} disabled={index === 0 && activeRevealed === 0} className="grid h-8 w-8 place-items-center rounded-full text-sm disabled:opacity-25">←</button>
        <span className="min-w-16 text-center font-mono text-[10px] uppercase tracking-[0.12em] text-white/60">{index + 1} / {deck.slides.length}</span>
        <button type="button" aria-label="Next slide" onClick={advance} disabled={index === deck.slides.length - 1 && activeRevealed >= activeFragmentTotal} className="grid h-8 w-8 place-items-center rounded-full text-sm disabled:opacity-25">→</button>
      </nav>
      {presenterMode && activeSlide ? <aside data-testid="deck-presenter-notes" data-taxonomy="metadata" className="absolute bottom-5 right-5 max-w-sm rounded-2xl border border-white/10 bg-[#101014]/95 px-5 py-4 text-sm text-white shadow-xl"><p className="font-mono text-[10px] uppercase tracking-widest text-white/45">presenter · {activeSlide.presenterLabel ?? activeSlide.title}</p><p className="mt-2 leading-relaxed text-white/75">{activeSlide.speakerNotes}</p></aside> : null}
    </div>
  );
}

function LiveDemoFocusNav({
  deck,
  availableFocuses,
  selectedFocus,
  onChange,
}: {
  deck: DeckArtifact;
  availableFocuses: LiveDemoFocus[];
  selectedFocus: LiveDemoFocus;
  onChange?: (focus: LiveDemoFocus) => void;
}) {
  return (
    <nav
      aria-label="live demo focus"
      data-taxonomy="tool"
      data-testid="live-demo-focus-nav"
      className="flex h-full items-stretch bg-[#0B0B0E]"
    >
      {deck.drawerTabs.map((focus) => {
        const available = availableFocuses.includes(focus);
        const selected = focus === selectedFocus;
        return (
          <button
            key={focus}
            type="button"
            aria-pressed={selected}
            disabled={!available}
            onClick={() => onChange?.(focus)}
            className={`flex-1 border-r border-white/20 px-5 font-mono text-[16px] uppercase tracking-[0.12em] last:border-r-0 ${
              selected
                ? 'bg-[#D946EF] text-white'
                : available
                  ? 'text-white hover:bg-white/10'
                  : 'text-white/20'
            }`}
          >
            {focus}
          </button>
        );
      })}
    </nav>
  );
}

function DeckSlideFrame({
  slide,
  deck,
  active,
  offset,
  revealedCount,
  onNavigate,
  reducedMotion,
  liveDemoFocus,
  liveDemoNav,
  pageNumber,
}: {
  slide: DeckSlide;
  deck: DeckArtifact;
  active: boolean;
  offset: number;
  revealedCount: number;
  onNavigate: (targetSlideId: string, targetBlockId?: string) => void;
  reducedMotion: boolean;
  liveDemoFocus: LiveDemoFocus;
  liveDemoNav: ReactNode;
  pageNumber: number;
}) {
  const fragmentTotal = orderedFragments(slide).length;
  // Slides rest slightly toward their side of the active slide, so movement
  // in either direction eases in from that direction. Transform only — the
  // fixed stage never reflows. Inactive slides keep visibility for the fade
  // duration so the outgoing slide can ease out.
  const style = {
    opacity: active ? 1 : 0,
    visibility: active ? 'visible' as const : 'hidden' as const,
    pointerEvents: active ? 'auto' as const : 'none' as const,
    transform: active ? 'none' : `translateX(${offset < 0 ? -48 : 48}px) scale(0.985)`,
    transition: reducedMotion
      ? 'none'
      : active
        ? `opacity ${SLIDE_MS}ms ${EASE}, transform ${SLIDE_MS}ms ${EASE}`
        : `opacity ${BLOCK_MS}ms ${EASE}, transform ${BLOCK_MS}ms ${EASE}, visibility 0s linear ${BLOCK_MS}ms`,
    background: deck.styleTokens.background,
    color: deck.styleTokens.foreground,
    fontFamily: deck.styleTokens.bodyFont,
  };
  const branchChips = [
    ...(slide.branchTargets ?? []).map((targetSlideId) => ({ key: `branch-${targetSlideId}`, label: targetSlideId, targetSlideId, targetBlockId: undefined as string | undefined })),
    ...(slide.hotspots ?? []).filter((hotspot) => !hotspot.region).map((hotspot) => ({ key: `hotspot-${hotspot.id}`, label: hotspot.label, targetSlideId: hotspot.targetSlideId, targetBlockId: hotspot.targetBlockId })),
  ];
  return (
    <section
      role="group"
      aria-label={slide.title}
      aria-hidden={!active}
      data-active={active}
      data-slide-id={slide.id}
      data-layout={slide.layout}
      data-style={slide.visualVariant ?? 'neo-grid-bold'}
      data-fragments-revealed={revealedCount}
      data-fragments-total={fragmentTotal}
      className="absolute inset-0 overflow-hidden"
      style={style}
    >
      <SlideShell
        slide={slide}
        deck={deck}
        active={active}
        revealedCount={revealedCount}
        reducedMotion={reducedMotion}
        liveDemoFocus={liveDemoFocus}
        liveDemoNav={liveDemoNav}
        pageNumber={pageNumber}
      />
      {(slide.hotspots ?? []).map((hotspot) =>
        hotspot.region ? (
          <button
            key={hotspot.id}
            type="button"
            aria-label={`Go to ${hotspot.label}`}
            data-testid={`deck-hotspot-${hotspot.id}`}
            data-taxonomy="tool"
            onClick={() => onNavigate(hotspot.targetSlideId, hotspot.targetBlockId)}
            className="group absolute z-20 border border-transparent bg-transparent p-0 hover:border-[#D946EF]/60 focus-visible:border-[#D946EF] focus-visible:outline-none"
            style={{
              left: hotspot.region.x,
              top: hotspot.region.y,
              width: hotspot.region.width,
              height: hotspot.region.height,
              transition: reducedMotion ? 'none' : `border-color 200ms ${EASE}`,
            }}
          >
            <span
              aria-hidden="true"
              className="absolute left-2 top-2 h-3 w-3 bg-[#D946EF]/35 group-hover:bg-[#D946EF] group-focus-visible:bg-[#D946EF]"
              style={{ transition: reducedMotion ? 'none' : `background-color 200ms ${EASE}` }}
            />
          </button>
        ) : null
      )}
      {branchChips.length > 0 ? (
        <nav aria-label="branch jumps" data-testid="deck-branch-jumps" data-taxonomy="tool" className="absolute bottom-[52px] right-[52px] z-20 flex items-center gap-2">
          {branchChips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={() => onNavigate(chip.targetSlideId, chip.targetBlockId)}
              className="border border-white/25 bg-[#151519]/95 px-4 py-2 font-mono text-[15px] uppercase tracking-[0.12em] text-white/70 hover:border-[#D946EF] hover:text-white focus-visible:border-[#D946EF] focus-visible:outline-none"
            >
              ↳ {chip.label}
            </button>
          ))}
        </nav>
      ) : null}
    </section>
  );
}

function SlideShell({
  slide,
  deck,
  active,
  revealedCount,
  reducedMotion,
  liveDemoFocus,
  liveDemoNav,
  pageNumber,
}: {
  slide: DeckSlide;
  deck: DeckArtifact;
  active: boolean;
  revealedCount: number;
  reducedMotion: boolean;
  liveDemoFocus: LiveDemoFocus;
  liveDemoNav: ReactNode;
  pageNumber: number;
}) {
  const visibleBlocks = blocksForLiveDemoFocus(slide, liveDemoFocus);
  const fragments = orderedFragments(slide);
  const fragmentPositions = new Map(fragments.map((fragment, position) => [fragment.targetBlockId, position + 1] as const));
  const blockStyle = (block: DeckBlock) => {
    const fragmentPosition = fragmentPositions.get(block.id);
    const isFragment = fragmentPosition !== undefined;
    const shown = active && (!isFragment || fragmentPosition <= revealedCount);
    // Fragments reveal on demand (no stagger lag); non-fragment blocks enter
    // with a copy -> artifact -> supporting-panel stagger when the slide lands.
    const delay = isFragment ? 0 : STAGGER_BASE_MS + staggerRank(block.kind) * STAGGER_STEP_MS;
    return {
      opacity: shown ? 1 : 0,
      transform: shown ? 'none' : 'translateY(14px)',
      pointerEvents: shown ? 'auto' as const : 'none' as const,
      transition: reducedMotion
        ? 'none'
        : `opacity ${BLOCK_MS}ms ${EASE} ${delay}ms, transform ${BLOCK_MS}ms ${EASE} ${delay}ms`,
    };
  };
  const content = (
    <>
      {visibleBlocks.map((block) => {
        const fragmentPosition = fragmentPositions.get(block.id);
        return (
          <div
            key={block.id}
            data-block-id={block.id}
            data-fragment-revealed={fragmentPosition === undefined ? undefined : fragmentPosition <= revealedCount}
            className="min-h-0 h-full"
            style={blockStyle(block)}
          >
            <DeckBlockView block={block} deck={deck} />
          </div>
        );
      })}
    </>
  );
  const shellProps = { title: slide.title, pageNumber, totalPages: deck.slides.length };
  if (slide.layout === 'title') return <TitleSlideShell {...shellProps}>{content}</TitleSlideShell>;
  if (slide.layout === 'section') return <SectionSlideShell {...shellProps}>{content}</SectionSlideShell>;
  if (slide.layout === 'split-proof') return <SplitProofSlideShell {...shellProps}>{content}</SplitProofSlideShell>;
  if (slide.layout === 'diagram') return <DiagramSlideShell {...shellProps}>{content}</DiagramSlideShell>;
  if (slide.layout === 'live-demo' && slide.visualVariant === 'editorial-evidence') return <EditorialEvidenceSlideShell {...shellProps} nav={liveDemoNav}>{content}</EditorialEvidenceSlideShell>;
  if (slide.layout === 'live-demo') return <LiveDemoSlideShell {...shellProps} nav={liveDemoNav}>{content}</LiveDemoSlideShell>;
  if (slide.layout === 'code-reference') return <CodeReferenceSlideShell {...shellProps}>{content}</CodeReferenceSlideShell>;
  if (slide.layout === 'metric-strip') return <MetricStripSlideShell {...shellProps}>{content}</MetricStripSlideShell>;
  return <ClosingSlideShell {...shellProps}>{content}</ClosingSlideShell>;
}

function BlockMark({ className = '' }: { className?: string }) {
  return (
    <span aria-hidden="true" className={`grid grid-cols-2 grid-rows-2 gap-1 ${className}`}>
      <span className="bg-current" />
      <span className="bg-current" />
      <span className="bg-current" />
      <span />
    </span>
  );
}

function PageNumber({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) {
  return (
    <span className="absolute bottom-0 left-0 z-20 bg-[#D946EF] px-[22px] py-[14px] font-mono text-[24px] tracking-[0.04em] text-white">
      {String(pageNumber).padStart(2, '0')} / {String(totalPages).padStart(2, '0')}
    </span>
  );
}

function Shell({
  title,
  children,
  pageNumber,
  totalPages,
  bodyClass = 'grid grid-cols-2 gap-3 [&>*:only-child]:col-span-2',
}: {
  title: string;
  children: ReactNode;
  pageNumber: number;
  totalPages: number;
  bodyClass?: string;
}) {
  return (
    <div data-testid="neo-grid-frame" className="absolute inset-[40px] grid grid-cols-12 grid-rows-8 gap-3">
      <header className="relative col-span-8 row-span-3 flex items-end bg-[#F7F4EF] p-9 text-[#171717]">
        <h2 className="max-w-[1100px] text-[88px] font-bold uppercase leading-[0.9] tracking-[-0.035em]">{title}</h2>
        <BlockMark className="absolute right-6 top-6 h-9 w-9" />
      </header>
      <div className="col-span-4 row-span-2 flex items-end bg-[#151519] p-8 font-mono text-[20px] uppercase tracking-[0.1em] text-white">
        Paillette / public evidence
      </div>
      <div className="col-span-4 row-span-1 bg-[#151519] p-6 text-white">
        <BlockMark className="h-12 w-12" />
      </div>
      <div className={`col-span-12 row-span-5 min-h-0 ${bodyClass}`}>{children}</div>
      <PageNumber pageNumber={pageNumber} totalPages={totalPages} />
    </div>
  );
}

type SlideShellProps = { title: string; children: ReactNode; pageNumber: number; totalPages: number };

export function TitleSlideShell(props: SlideShellProps) { return <Shell {...props} />; }
export function SectionSlideShell(props: SlideShellProps) { return <Shell {...props} />; }
export function SplitProofSlideShell(props: SlideShellProps) { return <Shell {...props} />; }
export function DiagramSlideShell(props: SlideShellProps) { return <Shell {...props} bodyClass="grid min-h-0 grid-cols-2 gap-3 [&>*:only-child]:col-span-2" />; }
export function LiveDemoSlideShell({ title, children, nav, pageNumber, totalPages }: SlideShellProps & { nav: ReactNode }) {
  return (
    <div data-testid="neo-grid-frame" className="absolute inset-[40px] grid grid-cols-12 grid-rows-8 gap-3">
      <header className="relative col-span-8 row-span-2 flex items-center bg-[#F7F4EF] px-9 py-7 text-[#171717]">
        <div>
          <p className="font-mono text-[16px] uppercase tracking-[0.12em]">Paillette / live evidence</p>
          <h2 data-testid="live-demo-title" className="mt-3 max-w-[1160px] text-[88px] font-bold uppercase leading-[0.86] tracking-[-0.04em]">{title}</h2>
        </div>
        <BlockMark className="absolute right-6 top-6 h-9 w-9" />
      </header>
      <div className="col-span-4 row-span-1 min-h-0">{nav}</div>
      <div data-testid="live-demo-source-strip" className="col-span-4 row-span-1 flex items-center justify-between bg-[#151519] px-7 font-mono text-[15px] uppercase tracking-[0.1em] text-white">
        <span>Verified public source</span>
        <span>NGS / source</span>
      </div>
      <div className="col-span-12 row-span-6 min-h-0">{children}</div>
      <PageNumber pageNumber={pageNumber} totalPages={totalPages} />
    </div>
  );
}
export function EditorialEvidenceSlideShell({ title, children, nav, pageNumber, totalPages }: SlideShellProps & { nav: ReactNode }) {
  return (
    <div data-testid="editorial-evidence-frame" className="absolute inset-[40px] grid grid-cols-12 grid-rows-8 gap-3">
      <header className="col-span-4 row-span-7 flex min-h-0 flex-col justify-between bg-[#FFFAF2] p-10 text-[#171717]">
        <div>
          <div className="flex items-center justify-between font-mono text-[15px] uppercase tracking-[0.12em] text-[#A21CAF]">
            <span>Paillette / evidence study</span>
            <span>{String(pageNumber).padStart(2, '0')} / {String(totalPages).padStart(2, '0')}</span>
          </div>
          <h2 data-testid="editorial-evidence-title" className="mt-16 text-[76px] font-bold uppercase leading-[0.88] tracking-[-0.04em]">{title}</h2>
        </div>
        <div className="border-t-2 border-black/20 pt-7">
          <p className="max-w-[470px] text-[26px] leading-tight text-black/65">One public artwork, read through the product, request, and source code.</p>
          <div className="mt-8 flex items-center gap-4 font-mono text-[14px] uppercase tracking-[0.1em]">
            <span className="h-3 w-3 bg-[#D946EF]" />
            <span>Product · API · Code</span>
          </div>
        </div>
      </header>
      <div className="col-span-8 row-span-1 flex items-center justify-between bg-[#151519] px-8 font-mono text-[15px] uppercase tracking-[0.1em] text-white">
        <span>Verified public collection record</span>
        <span>National Gallery Singapore / Roots</span>
      </div>
      <div className="col-span-8 row-span-7 min-h-0 overflow-hidden">{children}</div>
      <div className="col-span-4 row-span-1 min-h-0">{nav}</div>
    </div>
  );
}
export function CodeReferenceSlideShell(props: SlideShellProps) { return <Shell {...props} bodyClass="grid min-h-0 grid-cols-2 gap-3 [&>*:only-child]:col-span-2" />; }
export function MetricStripSlideShell(props: SlideShellProps) { return <Shell {...props} bodyClass="grid min-h-0 gap-3" />; }
export function ClosingSlideShell(props: SlideShellProps) { return <Shell {...props} />; }

function DeckBlockView({ block, deck }: { block: DeckBlock; deck: DeckArtifact }) {
  if (block.kind === 'product-frame') return <ProductFrameBlock block={block} />;
  if (block.kind === 'api-call') return <LiveApiCallBlock block={block} deck={deck} />;
  if (block.kind === 'code-reference') return <CodeReferenceBlock block={block} deck={deck} />;
  if (block.kind === 'metrics') return <MetricsStripBlock block={block} />;
  if (block.kind === 'links') return <div className="h-full bg-[#101014] p-9 text-white"><h3 className="text-[44px] font-bold uppercase leading-none">{block.title}</h3><div className="mt-8 grid gap-4 break-all font-mono text-[18px] uppercase tracking-[0.06em] text-[#F0ABFC]">{block.items?.map((item) => <p key={item}>{item}</p>)}</div></div>;
  return <article className="h-full bg-[#FFFAF2] p-9 text-[#171717]"><p className="font-mono text-[16px] uppercase tracking-[0.12em] text-[#A21CAF]">{block.eyebrow ?? 'Paillette'}</p>{block.title ? <h3 className="mt-4 text-[44px] font-bold uppercase leading-[0.95] tracking-[-0.02em]">{block.title}</h3> : null}{block.body ? <p className="mt-6 max-w-[800px] text-[25px] leading-[1.35] text-black/65">{block.body}</p> : null}{block.items ? <ul className="mt-7 grid gap-3 text-[21px]">{block.items.map((item, itemIndex) => <li key={item} className="flex items-baseline gap-4 border-t border-black/20 pt-3"><span className="font-mono text-[14px] text-[#A21CAF]">{String(itemIndex + 1).padStart(2, '0')}</span><span>{item}</span></li>)}</ul> : null}</article>;
}

function focusForBlock(block: DeckBlock): LiveDemoFocus | null {
  if (block.kind === 'product-frame') return 'Product';
  if (block.kind === 'api-call' || block.kind === 'metrics' || block.kind === 'copy') return 'API';
  if (block.kind === 'code-reference') return 'Code';
  return null;
}

function availableLiveDemoFocuses(slide: DeckSlide): LiveDemoFocus[] {
  if (slide.layout !== 'live-demo') return [];
  const focuses = new Set(slide.blocks.map(focusForBlock).filter((focus): focus is LiveDemoFocus => focus !== null));
  return (['Product', 'API', 'Code'] as LiveDemoFocus[]).filter((focus) => focuses.has(focus));
}

function blocksForLiveDemoFocus(slide: DeckSlide, focus: LiveDemoFocus): DeckBlock[] {
  if (slide.layout !== 'live-demo') return slide.blocks;
  const requested = slide.blocks.filter((block) => focusForBlock(block) === focus);
  if (requested.length > 0) return requested;
  const fallback = availableLiveDemoFocuses(slide)[0];
  return fallback ? slide.blocks.filter((block) => focusForBlock(block) === fallback) : [];
}
