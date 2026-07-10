'use client';

import { useMemo, useState } from 'react';
import type { DeckArtifact, DeckBlock } from '@/lib/deck/types';
import {
  buildRequestSnippets,
  executeDeckRequest,
  type DeckRequestAuthMode,
  type DeckRequestResult,
} from '@/lib/deck/liveDemo';

export function ProductFrameBlock({ block }: { block: DeckBlock }) {
  const url = block.productUrl ?? '/';
  const artwork = block.artwork;
  const sameOrigin = useMemo(() => {
    if (typeof window === 'undefined') return url.startsWith('/');
    return new URL(url, window.location.origin).origin === window.location.origin;
  }, [url]);

  if (sameOrigin) {
    return (
      <section className="grid h-full min-h-0 grid-rows-[72px_1fr] bg-[#151519] text-white">
        <div className="flex items-center justify-between border-b-2 border-white/20 px-7 font-mono text-[17px] uppercase tracking-[0.1em]">
          <span>{block.title ?? 'Product'}</span>
          <a href={url} target="_blank" rel="noreferrer" className="bg-[#D946EF] px-4 py-2 text-white">open ↗</a>
        </div>
        <iframe title={block.title ?? 'Product frame'} src={url} className="min-h-0 w-full border-0 bg-white" />
      </section>
    );
  }

  return (
    <section aria-label="Static product preview" className="grid h-full min-h-0 grid-cols-12 grid-rows-6 gap-3">
      {artwork ? (
        <div
          role="img"
          aria-label={`${artwork.title} by ${artwork.artist}`}
          className="relative col-span-7 row-span-6 min-h-0 min-w-0 overflow-hidden bg-[#0B0B0E] bg-contain bg-center bg-no-repeat"
          style={{ backgroundImage: `url(${JSON.stringify(artwork.imageUrl)})` }}
        >
          <div className="absolute inset-x-0 top-0 flex items-center justify-between bg-[#0B0B0E]/95 px-6 py-4 font-mono text-[14px] uppercase tracking-[0.12em] text-white">
            <span>Public collection record</span>
            <span>{artwork.institution}</span>
          </div>
        </div>
      ) : (
        <div className="col-span-7 row-span-6 flex items-end bg-[#0B0B0E] p-9 text-white">
          <p className="max-w-[640px] text-[48px] font-bold uppercase leading-[0.95]">{block.title ?? 'External product surface'}</p>
        </div>
      )}
      <article className="col-span-5 row-span-4 min-h-0 overflow-hidden bg-[#FFFAF2] p-8 text-[#171717]">
        <p className="font-mono text-[15px] uppercase tracking-[0.12em] text-[#A21CAF]">Featured public record</p>
        <h3 className="mt-5 text-[52px] font-bold uppercase leading-[0.92] tracking-[-0.025em]">{artwork?.title ?? block.title ?? 'Product surface'}</h3>
        {artwork ? <p className="mt-6 text-[25px]">{artwork.artist} · {artwork.year}</p> : null}
        {artwork ? (
          <dl className="mt-7 grid grid-cols-2 gap-x-6 gap-y-4 border-t-2 border-black/20 pt-5 font-mono text-[14px] uppercase tracking-[0.08em]">
            <div><dt className="text-black/45">Accession</dt><dd className="mt-1">{artwork.accessionNumber}</dd></div>
            <div><dt className="text-black/45">Medium</dt><dd className="mt-1">{artwork.medium}</dd></div>
            <div className="col-span-2"><dt className="text-black/45">Dimensions</dt><dd className="mt-1">{artwork.dimensions}</dd></div>
          </dl>
        ) : null}
      </article>
      <a href={artwork?.sourceUrl ?? url} target="_blank" rel="noreferrer" className="col-span-3 row-span-2 flex flex-col justify-between bg-[#101014] p-7 font-mono text-[16px] uppercase tracking-[0.1em] text-white">
        <span>Source record</span>
        <span>Roots ↗</span>
      </a>
      <a href={url} target="_blank" rel="noreferrer" className="col-span-2 row-span-2 flex flex-col justify-between bg-[#151519] p-7 font-mono text-[16px] uppercase tracking-[0.1em] text-white">
        <span>Product</span>
        <span>Open ↗</span>
      </a>
    </section>
  );
}

function endpointFor(deck: DeckArtifact, endpointId?: string) {
  return deck.liveDemo.endpoints.find((endpoint) => endpoint.id === endpointId) ?? null;
}

export function LiveApiCallBlock({ block, deck }: { block: DeckBlock; deck: DeckArtifact }) {
  const endpointIds = block.endpointIds?.length
    ? block.endpointIds
    : block.endpointId
      ? [block.endpointId]
      : [];
  const [activeEndpointId, setActiveEndpointId] = useState(endpointIds[0] ?? '');
  const endpoint = endpointFor(deck, activeEndpointId);
  const isImageRequest = block.requestMode === 'image';
  const [bodyText, setBodyText] = useState(() => JSON.stringify(block.requestBody ?? { query: 'batik or songket textile pattern', topK: 10, minScore: 0.2 }, null, 2));
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [topK, setTopK] = useState(8);
  const [minScore, setMinScore] = useState(0.3);
  const [authMode, setAuthMode] = useState<DeckRequestAuthMode>(block.authMode ?? endpoint?.authModes[0] ?? 'public');
  const [credential, setCredential] = useState('');
  const [result, setResult] = useState<DeckRequestResult | null>(null);
  const [status, setStatus] = useState<'idle' | 'running' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  if (!endpoint) {
    return <div className="h-full bg-[#0B0B0E] p-8 text-[24px] text-white">Demo endpoint is unavailable.</div>;
  }

  const request = {
    endpointId: endpoint.id,
    method: endpoint.method,
    path: endpoint.path,
    authMode,
    body: endpoint.method === 'POST' && !isImageRequest ? safeBody(bodyText) : undefined,
    formData: isImageRequest
      ? {
          fileField: 'image',
          file: imageFile ?? undefined,
          fields: { topK, minScore },
        }
      : undefined,
    signedIn: false,
    presenterCredential: credential || undefined,
  };

  async function run() {
    setStatus('running');
    setError(null);
    try {
      const next = await executeDeckRequest(deck.liveDemo, request);
      setResult(next);
      setStatus(next.ok ? 'idle' : 'error');
      if (!next.ok) setError(next.responseSummary);
    } catch (cause) {
      setStatus('error');
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  function copy(kind: 'curl' | 'fetch') {
    try {
      const snippets = buildRequestSnippets(deck.liveDemo, request);
      void navigator.clipboard?.writeText(snippets[kind]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  function selectEndpoint(endpointId: string) {
    const nextEndpoint = endpointFor(deck, endpointId);
    setActiveEndpointId(endpointId);
    setAuthMode(nextEndpoint?.authModes[0] ?? 'public');
    setResult(null);
    setError(null);
    setStatus('idle');
  }

  return (
    <section className="grid h-full min-h-0 grid-cols-12 grid-rows-6 gap-3">
      <header className="col-span-4 row-span-2 flex flex-col justify-between bg-[#F7F4EF] p-8 text-[#171717]">
        <p className="font-mono text-[15px] uppercase tracking-[0.12em]">Allowlisted live route</p>
        <h3 className="text-[44px] font-bold uppercase leading-[0.92] tracking-[-0.02em]">{endpoint.label}</h3>
      </header>
      <div className="col-span-8 row-span-2 flex flex-col justify-between bg-[#0B0B0E] p-8 text-white">
        {endpointIds.length > 1 ? (
          <select aria-label="Demo endpoint" value={activeEndpointId} onChange={(event) => selectEndpoint(event.target.value)} className="w-fit border border-white/25 bg-[#101014] px-4 py-2 font-mono text-[14px] uppercase tracking-[0.08em]">
            {endpointIds.map((endpointId) => {
              const option = endpointFor(deck, endpointId);
              return option ? <option key={endpointId} value={endpointId}>{option.label}</option> : null;
            })}
          </select>
        ) : null}
        <p className="break-all font-mono text-[18px] uppercase tracking-[0.08em]">{endpoint.method} · {endpoint.path}</p>
      </div>
      <div className="col-span-7 row-span-4 flex min-h-0 flex-col bg-[#101014] p-7 text-white">
          {endpoint.method === 'POST' && isImageRequest ? (
            <div className="grid min-h-0 flex-1 grid-cols-[1fr_180px] gap-4 border-2 border-white/20 p-6">
              <label className="flex min-h-0 cursor-pointer flex-col justify-between border border-dashed border-white/30 p-5 hover:border-[#D946EF]">
                <input
                  aria-label="Image search file"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  onChange={(event) => setImageFile(event.target.files?.[0] ?? null)}
                />
                <span className="font-mono text-[14px] uppercase tracking-[0.1em] text-[#F0ABFC]">Query image</span>
                <span className="break-all text-[24px] leading-tight">{imageFile?.name ?? 'Choose JPEG, PNG, or WebP'}</span>
                <span className="font-mono text-[12px] uppercase tracking-[0.08em] text-white/45">10 MB maximum</span>
              </label>
              <div className="grid content-start gap-5 font-mono text-[13px] uppercase tracking-[0.08em]">
                <label className="grid gap-2">
                  <span className="text-white/50">Top K</span>
                  <input aria-label="Image search top K" type="number" min={1} max={100} value={topK} onChange={(event) => setTopK(Number(event.target.value))} className="h-12 border border-white/30 bg-transparent px-3" />
                </label>
                <label className="grid gap-2">
                  <span className="text-white/50">Min score</span>
                  <input aria-label="Image search minimum score" type="number" min={0} max={1} step={0.05} value={minScore} onChange={(event) => setMinScore(Number(event.target.value))} className="h-12 border border-white/30 bg-transparent px-3" />
                </label>
              </div>
            </div>
          ) : endpoint.method === 'POST' ? (
            <textarea aria-label={`${endpoint.label} JSON body`} value={bodyText} onChange={(event) => setBodyText(event.target.value)} className="min-h-0 flex-1 resize-none border-2 border-white/20 bg-transparent p-6 font-mono text-[19px] leading-relaxed outline-none focus:border-[#D946EF]" />
          ) : (
            <div className="flex min-h-0 flex-1 flex-col justify-between border border-white/15 p-6">
              <p className="font-mono text-[14px] uppercase tracking-[0.1em] text-[#F0ABFC]">Auth boundary</p>
              <p className="max-w-[640px] text-[28px] leading-tight">{endpoint.authModes.includes('public') ? 'Public route—safe to run without a viewer account.' : 'Private route—requires the existing Logto session or a presenter-provided Paillette key.'}</p>
            </div>
          )}
          <div className="mt-4 flex items-center gap-3 font-mono text-[15px] uppercase tracking-[0.06em]">
            <select aria-label="Demo auth mode" value={authMode} onChange={(event) => setAuthMode(event.target.value as DeckRequestAuthMode)} className="h-12 border-2 border-white/30 bg-[#0B0B0E] px-4">
              {endpoint.authModes.map((mode) => <option key={mode} value={mode}>{mode}</option>)}
            </select>
            {authMode === 'presenter-provided' ? <input aria-label="Presenter credential" type="password" value={credential} onChange={(event) => setCredential(event.target.value)} placeholder="session only" className="h-12 min-w-0 flex-1 border-2 border-white/30 bg-transparent px-4 font-mono text-[15px]" /> : null}
            <button type="button" onClick={() => void run()} disabled={status === 'running'} className="ml-auto h-12 bg-[#D946EF] px-8 font-bold text-white disabled:opacity-50">{status === 'running' ? 'running…' : 'run'}</button>
          </div>
      </div>
      <div className="col-span-5 row-span-4 min-h-0 overflow-auto bg-[#FFFAF2] p-7 text-[#171717]">
          <p className="font-mono text-[15px] uppercase tracking-[0.12em]">Response</p>
          <p className="mt-4 text-[25px] leading-tight">{error ?? result?.responseSummary ?? 'Ready to run. Checked-in public evidence remains available offline.'}</p>
          {result ? <MetricsInline result={result} /> : null}
          <details className="mt-6 border-t-2 border-black/20 pt-5 font-mono text-[14px]"><summary className="cursor-pointer uppercase tracking-[0.08em]">raw JSON</summary><pre className="mt-3 whitespace-pre-wrap">{JSON.stringify(result?.response ?? block.mockResponse ?? endpoint.staticFallback, null, 2)}</pre></details>
          <div className="mt-5 flex gap-5 font-mono text-[14px] uppercase tracking-[0.08em] text-[#F0ABFC]"><button type="button" onClick={() => copy('curl')} className="border-b-2 border-[#D946EF]">copy curl</button><button type="button" onClick={() => copy('fetch')} className="border-b-2 border-[#D946EF]">copy fetch</button></div>
      </div>
    </section>
  );
}

function safeBody(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function MetricsInline({ result }: { result: DeckRequestResult }) {
  const metrics = [
    `${result.metrics.durationMs} ms`,
    result.metrics.resultCount === undefined ? null : `${result.metrics.resultCount} results`,
    result.metrics.cache ? `cache ${result.metrics.cache}` : null,
    result.metrics.rateLimit ? `rate ${result.metrics.rateLimit}` : null,
    result.metrics.serverTiming ?? null,
  ].filter(Boolean);
  return <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2 font-mono text-[14px] uppercase tracking-[0.08em]">{metrics.map((metric) => <span key={metric} className="bg-[#D946EF] px-2 py-1 text-white">{metric}</span>)}</div>;
}

export function CodeReferenceBlock({ block, deck }: { block: DeckBlock; deck: DeckArtifact }) {
  const references = deck.codeReferences.filter((reference) => block.codeReferenceIds?.includes(reference.id));
  return <section className="grid h-full min-h-0 grid-cols-2 gap-3 overflow-auto [&>*:only-child]:col-span-2">{references.map((reference, index) => <div key={reference.id} className={`relative overflow-hidden p-8 ${index % 2 === 0 ? 'bg-[#101014] text-white' : 'bg-[#F7F4EF] text-[#171717]'}`}><p className={`break-all font-mono text-[15px] uppercase tracking-[0.08em] ${index % 2 === 0 ? 'text-[#F0ABFC]' : 'text-[#A21CAF]'}`}>{reference.filePath}</p><h3 className="mt-7 max-w-[620px] text-[38px] font-bold uppercase leading-[0.95]">{reference.label}</h3><p className="mt-5 max-w-[620px] text-[21px] leading-snug opacity-70">{reference.whyItMatters}</p><span aria-hidden="true" className={`absolute bottom-3 right-7 text-[156px] font-bold leading-none tracking-[-0.06em] ${index % 2 === 0 ? 'text-[#D946EF]' : 'text-[#A855F7]'}`}>{String(index + 1).padStart(2, '0')}</span></div>)}</section>;
}

export function MetricsStripBlock({ block }: { block: DeckBlock }) {
  return <div className="grid h-full grid-cols-5 gap-3">{(block.items ?? []).map((item, index) => <div key={item} className={`flex items-end p-6 ${index % 2 === 0 ? 'bg-[#101014] text-white' : 'bg-[#F7F4EF] text-[#171717]'}`}><p className="text-[32px] font-bold uppercase leading-[0.95]">{item}</p></div>)}</div>;
}
