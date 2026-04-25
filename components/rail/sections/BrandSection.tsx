'use client';

import { useState, type ReactNode } from 'react';
import {
  DEMO_CREATOR_CONTEXT,
  describeWorkspaceMode,
  type BrandContext,
} from '@/lib/context/model';
import { normalizeHttpUrlInput } from '@/lib/url/normalize';
import type {
  BrandIngestKind,
  BrandIngestRequest,
  BrandSnapshot,
} from '@/lib/brand/types';

/**
 * Brand section body. Surfaces the current brand snapshot (from DEMO context
 * or a freshly ingested one) and exposes a drop zone so creators can paste a
 * URL, a GitHub repo, or drop files. Stays single-column and restraint-first
 * per `CLAUDE.md` hard rules 5 + 6.
 */

interface BrandSectionProps {
  context?: BrandContext;
  workspaceMode?: 'venture' | 'studio';
  workspaceLabel?: string;
  /** Override the ingest implementation (tests stub this). */
  ingest?: (req: BrandIngestRequest) => Promise<{
    snapshot: BrandSnapshot;
    review: boolean;
  }>;
}

type IngestState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ok'; snapshot: BrandSnapshot; review: boolean };

function KnowledgeRow({ label, note }: { label: string; note: string }) {
  return (
    <li className="flex items-center justify-between gap-3 rounded-sm border border-border-soft bg-surface-panel-muted px-2 py-1.5">
      <div className="flex flex-col">
        <span className="font-caption text-ink">{note}</span>
        <span className="font-caption text-xs text-ink-dim">{label}</span>
      </div>
    </li>
  );
}

async function defaultIngest(req: BrandIngestRequest) {
  const res = await fetch('/api/brand-ingest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  const json = (await res.json()) as {
    ok: boolean;
    snapshot?: BrandSnapshot;
    review?: boolean;
    error?: string;
  };
  if (!res.ok || !json.ok || !json.snapshot) {
    throw new Error(json.error ?? `ingest failed: ${res.status}`);
  }
  return { snapshot: json.snapshot, review: json.review ?? false };
}

function classifyInput(raw: string): BrandIngestKind | null {
  const trimmed = normalizeHttpUrlInput(raw);
  if (!trimmed) return null;
  if (/^https?:\/\/github\.com\//i.test(trimmed)) return 'repo';
  if (/^https?:\/\//i.test(trimmed)) return 'url';
  return null;
}

function BrandDropZone({
  onSubmit,
  state,
}: {
  onSubmit: (req: BrandIngestRequest) => void;
  state: IngestState;
}) {
  const [value, setValue] = useState('');
  const loading = state.kind === 'loading';

  const submit = () => {
    const kind = classifyInput(value);
    if (!kind) return;
    onSubmit({ kind, source: normalizeHttpUrlInput(value) });
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

  return (
    <div
      data-testid="brand-drop-zone"
      className="flex flex-col gap-2 rounded-sm border border-dashed border-border-soft bg-surface-panel-muted px-2 py-2"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        void onFiles(e.dataTransfer.files);
      }}
    >
      <span className="font-caption text-ink-dim">paste a URL or drop files</span>
      <div className="flex gap-1">
        <input
          type="text"
          aria-label="brand source"
          placeholder="https://brand.example.com"
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

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('file read failed'));
    reader.readAsDataURL(file);
  });
}

function SnapshotBody({
  snapshot,
  review,
}: {
  snapshot: BrandSnapshot;
  review: boolean;
}): ReactNode {
  return (
    <div className="flex flex-col gap-3">
      {review ? (
        <div
          role="status"
          data-testid="brand-review-banner"
          className="rounded-sm border border-border-soft bg-surface-panel-muted px-2 py-1.5"
        >
          <span className="font-caption text-xs text-ink-dim">
            low-confidence read ({Math.round(snapshot.confidence * 100)}%) — review before applying
          </span>
        </div>
      ) : null}
      <div className="flex flex-col gap-1">
        <span className="font-caption text-ink-dim">palette</span>
        <div
          data-testid="brand-palette"
          className="flex flex-wrap gap-1"
        >
          {snapshot.palette.map((entry) => (
            <span
              key={`${entry.hex}-${entry.role ?? ''}`}
              title={entry.role ? `${entry.hex} · ${entry.role}` : entry.hex}
              data-testid="brand-palette-chip"
              className="inline-block h-5 w-5 rounded-xs border border-border-soft"
              style={{ background: entry.hex }}
            />
          ))}
        </div>
      </div>
      {snapshot.typography.length > 0 ? (
        <div className="flex flex-col gap-1">
          <span className="font-caption text-ink-dim">type</span>
          {snapshot.typography.map((entry) => (
            <span key={`${entry.family}-${entry.role ?? ''}`} className="font-caption text-xs text-ink">
              {entry.family}
              {entry.role ? ` · ${entry.role}` : ''}
            </span>
          ))}
        </div>
      ) : null}
      {snapshot.voice.samples.length > 0 ? (
        <div className="flex flex-col gap-1">
          <span className="font-caption text-ink-dim">voice</span>
          <ul
            data-testid="brand-voice-list"
            className="flex flex-col gap-1"
          >
            {snapshot.voice.samples.map((sample, i) => (
              <li key={i} className="font-caption text-xs text-ink">
                “{sample}”
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function BrandSection({
  context = DEMO_CREATOR_CONTEXT.brand,
  workspaceMode = DEMO_CREATOR_CONTEXT.workspaceMode,
  workspaceLabel = DEMO_CREATOR_CONTEXT.workspaceLabel,
  ingest = defaultIngest,
}: BrandSectionProps) {
  const [state, setState] = useState<IngestState>({ kind: 'idle' });

  const onSubmit = async (req: BrandIngestRequest) => {
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

  const modeLabel = workspaceMode === 'venture' ? 'venture' : 'studio';

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <span className="font-caption text-ink-dim">{modeLabel}</span>
        <span className="font-caption text-xs text-ink">{workspaceLabel}</span>
        <span className="font-display text-sm text-ink">{context.name}</span>
        <span className="font-caption text-xs text-ink-dim">
          {describeWorkspaceMode(workspaceMode)}
        </span>
      </div>

      <BrandDropZone onSubmit={onSubmit} state={state} />

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
        <SnapshotBody snapshot={state.snapshot} review={state.review} />
      ) : (
        <BaseBrandBody context={context} />
      )}
    </div>
  );
}

function BaseBrandBody({ context }: { context: BrandContext }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <span className="font-caption text-ink-dim">knowledge</span>
        <ul className="flex flex-col gap-2">
          {context.knowledgeSources.map((source) => (
            <KnowledgeRow key={source.id} label={source.label} note={source.note} />
          ))}
        </ul>
      </div>
      <div className="flex flex-col gap-1">
        <span className="font-caption text-ink-dim">palette</span>
        <div className="flex gap-1">
          {context.palette.map((color) => (
            <span
              key={color}
              title={color}
              className="inline-block h-5 w-5 rounded-xs border border-border-soft"
              style={{ background: color }}
            />
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <span className="font-caption text-ink-dim">type</span>
        {context.type.map((entry) => (
          <span key={entry} className="font-caption text-xs text-ink">
            {entry}
          </span>
        ))}
      </div>
      <div className="flex flex-col gap-1">
        <span className="font-caption text-ink-dim">voice</span>
        <span className="font-caption text-xs text-ink">{context.voice}</span>
      </div>
    </div>
  );
}

export function brandSectionSummary(context: BrandContext): string {
  return `${context.knowledgeSources.length} sources`;
}
