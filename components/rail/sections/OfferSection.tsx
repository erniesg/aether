'use client';

import { useState, type ReactNode } from 'react';
import {
  DEMO_CREATOR_CONTEXT,
  type OfferContext,
} from '@/lib/context/model';
import type {
  OfferIngestKind,
  OfferIngestRequest,
  OfferSnapshot,
} from '@/lib/offer/types';

/**
 * Offer section body. Surfaces the current offer snapshot (from DEMO context
 * or a freshly ingested one) and exposes a drop zone so creators can paste a
 * product URL, drop files, or paste rich text / a URL via the clipboard zone.
 * Stays single-column + restraint-first per `CLAUDE.md` hard rules 5 + 6.
 */

interface OfferSectionProps {
  context?: OfferContext;
  /** Override the ingest implementation (tests stub this). */
  ingest?: (req: OfferIngestRequest) => Promise<{
    snapshot: OfferSnapshot;
    review: boolean;
  }>;
}

type IngestState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ok'; snapshot: OfferSnapshot; review: boolean };

async function defaultIngest(req: OfferIngestRequest) {
  const res = await fetch('/api/offer-ingest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  const json = (await res.json()) as {
    ok: boolean;
    snapshot?: OfferSnapshot;
    review?: boolean;
    error?: string;
  };
  if (!res.ok || !json.ok || !json.snapshot) {
    throw new Error(json.error ?? `ingest failed: ${res.status}`);
  }
  return { snapshot: json.snapshot, review: json.review ?? false };
}

function classifyInput(raw: string): OfferIngestKind | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return 'url';
  return null;
}

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('file read failed'));
    reader.readAsDataURL(file);
  });
}

function OfferDropZone({
  onSubmit,
  state,
}: {
  onSubmit: (req: OfferIngestRequest) => void;
  state: IngestState;
}) {
  const [value, setValue] = useState('');
  const loading = state.kind === 'loading';

  const submit = () => {
    const kind = classifyInput(value);
    if (!kind) return;
    onSubmit({ kind, source: value.trim() });
  };

  const onFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const texts: string[] = [];
    const images: Array<{ url: string; alt?: string }> = [];
    await Promise.all(
      Array.from(files).map(async (file) => {
        if (file.type.startsWith('image/')) {
          const dataUrl = await fileToDataUrl(file);
          images.push({ url: dataUrl, alt: file.name });
        } else {
          const text = await file.text();
          texts.push(text);
        }
      })
    );
    onSubmit({ kind: 'files', source: { texts, images } });
  };

  const onPaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    const html = event.clipboardData.getData('text/html');
    const text = event.clipboardData.getData('text/plain');
    if (!html && !text) return;
    event.preventDefault();
    onSubmit({
      kind: 'clipboard',
      source: {
        ...(html ? { html } : {}),
        ...(text ? { text } : {}),
      },
    });
  };

  return (
    <div
      data-testid="offer-drop-zone"
      className="flex flex-col gap-2 rounded-sm border border-dashed border-border-soft bg-surface-panel-muted px-2 py-2"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        void onFiles(e.dataTransfer.files);
      }}
      onPaste={onPaste}
    >
      <span className="font-caption text-ink-dim">paste a URL · drop files · paste rich text</span>
      <div className="flex gap-1">
        <input
          type="text"
          aria-label="offer source"
          placeholder="https://shop.example.com/product"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
          disabled={loading}
          className="flex-1 rounded-sm border border-border-soft bg-surface-panel px-2 py-1 font-caption text-xs text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
        />
        <button
          type="button"
          onClick={submit}
          disabled={loading || !classifyInput(value)}
          className="rounded-sm border border-border-soft bg-surface-panel px-2 py-1 font-caption text-xs text-ink transition-colors hover:bg-surface-panel-muted disabled:opacity-50"
        >
          {loading ? 'reading…' : 'ingest'}
        </button>
      </div>
      <label className="cursor-pointer font-caption text-xs text-ink-dim hover:text-ink">
        <span>or pick files</span>
        <input
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            void onFiles(e.target.files);
            e.currentTarget.value = '';
          }}
        />
      </label>
    </div>
  );
}

function ClaimChips({
  claims,
  onChange,
}: {
  claims: string[];
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState('');

  const update = (i: number, value: string) => {
    const next = [...claims];
    next[i] = value;
    onChange(next);
  };
  const remove = (i: number) => {
    const next = claims.filter((_, idx) => idx !== i);
    onChange(next);
  };
  const add = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    onChange([...claims, trimmed]);
    setDraft('');
  };

  return (
    <div className="flex flex-col gap-1">
      <span className="font-caption text-ink-dim">claims</span>
      <ul
        data-testid="offer-claims-list"
        className="flex flex-wrap gap-1"
      >
        {claims.map((claim, i) => (
          <li
            key={i}
            className="group flex items-center gap-1 rounded-pill border border-border-soft bg-surface-panel-muted px-2 py-0.5"
          >
            <input
              type="text"
              aria-label={`claim ${i + 1}`}
              value={claim}
              onChange={(e) => update(i, e.target.value)}
              className="bg-transparent font-caption text-xs text-ink focus:outline-none"
              style={{ width: `${Math.max(claim.length, 4)}ch` }}
            />
            <button
              type="button"
              onClick={() => remove(i)}
              className="font-mono text-2xs text-ink-dim opacity-0 transition-opacity group-hover:opacity-100 hover:text-ink"
            >
              <span className="sr-only">Remove claim {i + 1}</span>
              <span aria-hidden="true">×</span>
            </button>
          </li>
        ))}
        <li className="flex items-center">
          <input
            type="text"
            aria-label="add claim"
            placeholder="+ add claim"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                add();
              }
            }}
            className="rounded-pill border border-dashed border-border-soft bg-transparent px-2 py-0.5 font-caption text-xs text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
          />
        </li>
      </ul>
    </div>
  );
}

function SnapshotBody({
  snapshot,
  review,
  onClaimsChange,
}: {
  snapshot: OfferSnapshot;
  review: boolean;
  onClaimsChange: (claims: string[]) => void;
}): ReactNode {
  return (
    <div className="flex flex-col gap-3">
      {review ? (
        <div
          role="status"
          data-testid="offer-review-banner"
          className="rounded-sm border border-border-soft bg-surface-panel-muted px-2 py-1.5"
        >
          <span className="font-caption text-xs text-ink-dim">
            low-confidence read ({Math.round(snapshot.confidence * 100)}%) — review before applying
          </span>
        </div>
      ) : null}
      <div className="flex flex-col gap-1">
        <span className="font-caption text-ink-dim">offer</span>
        <span className="font-display text-sm text-ink">{snapshot.name}</span>
        {snapshot.tagline ? (
          <span className="font-caption text-xs text-ink-dim">{snapshot.tagline}</span>
        ) : null}
      </div>
      <ClaimChips claims={snapshot.claims} onChange={onClaimsChange} />
      {snapshot.priceTiers && snapshot.priceTiers.length > 0 ? (
        <div className="flex flex-col gap-1">
          <span className="font-caption text-ink-dim">price</span>
          <ul data-testid="offer-price-list" className="flex flex-col gap-0.5">
            {snapshot.priceTiers.map((tier, i) => (
              <li key={`${i}-${tier.label}`} className="font-caption text-xs text-ink">
                {tier.label} · {tier.price}{tier.period ? ` / ${tier.period}` : ''}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {snapshot.launchWindow ? (
        <div className="flex flex-col gap-1">
          <span className="font-caption text-ink-dim">launch</span>
          <span className="font-caption text-xs text-ink">
            {snapshot.launchWindow.startAt ?? '—'}
            {snapshot.launchWindow.endAt ? ` → ${snapshot.launchWindow.endAt}` : ''}
          </span>
        </div>
      ) : null}
      {snapshot.proof && snapshot.proof.length > 0 ? (
        <div className="flex flex-col gap-1">
          <span className="font-caption text-ink-dim">proof</span>
          <ul data-testid="offer-proof-list" className="flex flex-col gap-1">
            {snapshot.proof.map((p, i) => (
              <li key={i} className="font-caption text-xs text-ink">
                “{p}”
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {snapshot.heroImages.length > 0 ? (
        <div className="flex flex-col gap-1">
          <span className="font-caption text-ink-dim">hero</span>
          <div data-testid="offer-hero-list" className="flex flex-wrap gap-1">
            {snapshot.heroImages.map((hero, i) => (
              <span
                key={`${i}-${hero.url}`}
                className="truncate rounded-sm border border-border-soft bg-surface-panel px-2 py-0.5 font-mono text-2xs text-ink-dim"
                style={{ maxWidth: '10rem' }}
                title={hero.alt ?? hero.url}
              >
                {hero.alt ?? hero.url}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function BaseOfferBody({ context }: { context: OfferContext }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <span className="font-caption text-ink-dim">offer</span>
        <span className="font-display text-sm text-ink">{context.name}</span>
        <span className="font-caption text-xs text-ink-dim">{context.summary}</span>
      </div>
      <div className="flex flex-col gap-1">
        <span className="font-caption text-ink-dim">claims</span>
        <div className="flex flex-wrap gap-1">
          {context.claims.map((claim) => (
            <span
              key={claim}
              className="rounded-pill border border-border-soft bg-surface-panel-muted px-2 py-0.5 font-caption text-xs text-ink"
            >
              {claim}
            </span>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <span className="font-caption text-ink-dim">hero asset</span>
        <span className="font-caption text-xs text-ink">{context.heroAsset}</span>
      </div>
    </div>
  );
}

export function OfferSection({
  context = DEMO_CREATOR_CONTEXT.offer,
  ingest = defaultIngest,
}: OfferSectionProps) {
  const [state, setState] = useState<IngestState>({ kind: 'idle' });

  const onSubmit = async (req: OfferIngestRequest) => {
    setState({ kind: 'loading' });
    try {
      const { snapshot, review } = await ingest(req);
      setState({ kind: 'ok', snapshot, review });
    } catch (err) {
      setState({
        kind: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const onClaimsChange = (claims: string[]) => {
    setState((prev) =>
      prev.kind === 'ok'
        ? { ...prev, snapshot: { ...prev.snapshot, claims } }
        : prev
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <OfferDropZone onSubmit={onSubmit} state={state} />

      {state.kind === 'error' ? (
        <div
          role="alert"
          className="rounded-sm border border-border-soft bg-surface-panel-muted px-2 py-1.5"
        >
          <span className="font-caption text-xs text-ink-dim">
            could not read source · {state.message}
          </span>
        </div>
      ) : null}

      {state.kind === 'ok' ? (
        <SnapshotBody
          snapshot={state.snapshot}
          review={state.review}
          onClaimsChange={onClaimsChange}
        />
      ) : (
        <BaseOfferBody context={context} />
      )}
    </div>
  );
}

export function offerSectionSummary(context: OfferContext): string {
  return `${context.claims.length} claims`;
}
