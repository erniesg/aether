'use client';

import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DeckArtifact, DeckBlock, DeckSlide } from '@/lib/deck/types';
import { CodeReferenceBlock, LiveApiCallBlock, MetricsStripBlock, ProductFrameBlock } from './DeckBlocks';

const STAGE_WIDTH = 1920;
const STAGE_HEIGHT = 1080;
const CONTROL_CLEARANCE = 56;
type LiveDemoFocus = DeckArtifact['drawerTabs'][number];

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
  const touchStartX = useRef<number | null>(null);
  const reducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const go = useCallback((next: number) => setIndex(Math.max(0, Math.min(deck.slides.length - 1, next))), [deck.slides.length]);

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
      if (['ArrowRight', 'ArrowDown', ' ', 'PageDown'].includes(event.key)) { event.preventDefault(); go(index + 1); }
      if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(event.key)) { event.preventDefault(); go(index - 1); }
      if (event.key === 'Home') go(0);
      if (event.key === 'End') go(deck.slides.length - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [deck.slides.length, go, index]);

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

  return (
    <div
      data-testid="deck-viewport"
      data-reduced-motion={reducedMotion}
      className="relative h-full min-h-0 flex-1 bg-[#0B0B0E]"
      onWheel={(event) => { if (Math.abs(event.deltaY) >= 20) go(index + (event.deltaY > 0 ? 1 : -1)); }}
      onTouchStart={(event) => { touchStartX.current = event.touches[0]?.clientX ?? null; }}
      onTouchEnd={(event) => { const end = event.changedTouches[0]?.clientX; if (touchStartX.current !== null && end !== undefined && Math.abs(end - touchStartX.current) > 40) go(index + (end < touchStartX.current ? 1 : -1)); touchStartX.current = null; }}
    >
      <DeckStage>
        {deck.slides.map((slide, slideIndex) => (
          <DeckSlideFrame
            key={slide.id}
            slide={slide}
            deck={deck}
            active={slideIndex === index}
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
        <button type="button" aria-label="Previous slide" onClick={() => go(index - 1)} disabled={index === 0} className="grid h-8 w-8 place-items-center rounded-full text-sm disabled:opacity-25">←</button>
        <span className="min-w-16 text-center font-mono text-[10px] uppercase tracking-[0.12em] text-white/60">{index + 1} / {deck.slides.length}</span>
        <button type="button" aria-label="Next slide" onClick={() => go(index + 1)} disabled={index === deck.slides.length - 1} className="grid h-8 w-8 place-items-center rounded-full text-sm disabled:opacity-25">→</button>
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
  reducedMotion,
  liveDemoFocus,
  liveDemoNav,
  pageNumber,
}: {
  slide: DeckSlide;
  deck: DeckArtifact;
  active: boolean;
  reducedMotion: boolean;
  liveDemoFocus: LiveDemoFocus;
  liveDemoNav: ReactNode;
  pageNumber: number;
}) {
  const style = {
    opacity: active ? 1 : 0,
    visibility: active ? 'visible' as const : 'hidden' as const,
    pointerEvents: active ? 'auto' as const : 'none' as const,
    transition: reducedMotion ? 'none' : 'opacity 240ms ease',
    background: deck.styleTokens.background,
    color: deck.styleTokens.foreground,
    fontFamily: deck.styleTokens.bodyFont,
  };
  return (
    <section
      role="group"
      aria-label={slide.title}
      aria-hidden={!active}
      data-active={active}
      data-slide-id={slide.id}
      data-layout={slide.layout}
      data-style={slide.visualVariant ?? 'neo-grid-bold'}
      className="absolute inset-0 overflow-hidden"
      style={style}
    >
      <SlideShell
        slide={slide}
        deck={deck}
        liveDemoFocus={liveDemoFocus}
        liveDemoNav={liveDemoNav}
        pageNumber={pageNumber}
      />
    </section>
  );
}

function SlideShell({
  slide,
  deck,
  liveDemoFocus,
  liveDemoNav,
  pageNumber,
}: {
  slide: DeckSlide;
  deck: DeckArtifact;
  liveDemoFocus: LiveDemoFocus;
  liveDemoNav: ReactNode;
  pageNumber: number;
}) {
  const visibleBlocks = blocksForLiveDemoFocus(slide, liveDemoFocus);
  const content = <>{visibleBlocks.map((block) => <div key={block.id} data-block-id={block.id} className="min-h-0 h-full"><DeckBlockView block={block} deck={deck} /></div>)}</>;
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
