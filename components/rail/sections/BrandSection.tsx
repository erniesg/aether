'use client';

import { Check, Plus, Save, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  DEMO_CREATOR_CONTEXT,
  describeWorkspaceMode,
  type BrandContext,
  type KnowledgeSource,
  type KnowledgeSourceKind,
} from '@/lib/context/model';
import {
  saveBrandContext,
  useBrandContext,
} from '@/lib/context/brand-store';
import { normalizeHttpUrlInput } from '@/lib/url/normalize';
import type {
  BrandIngestKind,
  BrandIngestRequest,
  BrandSnapshot,
  BrandSnapshotSource,
} from '@/lib/brand/types';

/**
 * Brand section body. Surfaces the current brand snapshot (from DEMO context
 * or a freshly ingested one) and exposes a drop zone so creators can paste a
 * URL, a GitHub repo, or drop files. Stays single-column and restraint-first
 * per `CLAUDE.md` hard rules 5 + 6.
 */

interface BrandSectionProps {
  context?: BrandContext;
  workspaceId?: string;
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

type SaveState = 'idle' | 'saved';

const HEX_RE = /^#?(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

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

export function BrandSection({
  context = DEMO_CREATOR_CONTEXT.brand,
  workspaceId,
  workspaceMode = DEMO_CREATOR_CONTEXT.workspaceMode,
  workspaceLabel = DEMO_CREATOR_CONTEXT.workspaceLabel,
  ingest = defaultIngest,
}: BrandSectionProps) {
  const savedContext = useBrandContext(workspaceId);
  const [draft, setDraft] = useState<BrandContext>(savedContext);
  const [state, setState] = useState<IngestState>({ kind: 'idle' });
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');

  useEffect(() => {
    if (dirty) return;
    setDraft(savedContext);
  }, [dirty, savedContext]);

  const validationMessage = useMemo(() => validateDraft(draft), [draft]);

  const updateDraft = (fn: (prev: BrandContext) => BrandContext) => {
    setDraft((prev) => fn(prev));
    setDirty(true);
    setSaveState('idle');
  };

  const onSubmit = async (req: BrandIngestRequest) => {
    setState({ kind: 'loading' });
    try {
      const { snapshot, review } = await ingest(req);
      setDraft((prev) => brandContextFromSnapshot(prev, snapshot));
      setDirty(true);
      setSaveState('idle');
      setState({ kind: 'ok', snapshot, review });
    } catch (err) {
      setState({
        kind: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const onSave = () => {
    const normalized = normalizeDraftForSave(draft);
    if (!normalized) return;
    saveBrandContext(normalized, workspaceId);
    setDraft(normalized);
    setDirty(false);
    setSaveState('saved');
    setState({ kind: 'idle' });
  };

  const modeLabel = workspaceMode === 'venture' ? 'venture' : 'studio';

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <span className="font-caption text-ink-dim">{modeLabel}</span>
        <span className="font-caption text-xs text-ink">{workspaceLabel}</span>
        <input
          aria-label="brand name"
          value={draft.name}
          onChange={(e) => updateDraft((prev) => ({ ...prev, name: e.target.value }))}
          className="rounded-sm border border-transparent bg-transparent px-0 py-0 font-display text-sm text-ink outline-none transition-colors focus:border-accent focus:bg-surface-panel-muted focus:px-1"
        />
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

      {state.kind === 'ok' && state.review ? (
        <div
          role="status"
          data-testid="brand-review-banner"
          className="rounded-sm border border-border-soft bg-surface-panel-muted px-2 py-1.5"
        >
          <span className="font-caption text-xs text-ink-dim">
            low-confidence read ({Math.round(state.snapshot.confidence * 100)}%) · review before saving
          </span>
        </div>
      ) : null}

      <BrandProfileEditor
        draft={draft}
        dirty={dirty}
        saveState={saveState}
        validationMessage={validationMessage}
        onChange={updateDraft}
        onSave={onSave}
        fallback={context}
      />
    </div>
  );
}

function BrandProfileEditor({
  draft,
  dirty,
  saveState,
  validationMessage,
  onChange,
  onSave,
  fallback,
}: {
  draft: BrandContext;
  dirty: boolean;
  saveState: SaveState;
  validationMessage: string | null;
  onChange: (fn: (prev: BrandContext) => BrandContext) => void;
  onSave: () => void;
  fallback: BrandContext;
}) {
  const palette = draft.palette.length > 0 ? draft.palette : fallback.palette;
  const typeText = draft.type.join('\n');

  return (
    <div data-testid="brand-profile-editor" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <span className="font-caption text-ink-dim">knowledge</span>
        <ul className="flex flex-col gap-1.5">
          {draft.knowledgeSources.map((source, index) => (
            <li
              key={source.id}
              className="grid grid-cols-[1fr_auto] gap-1 rounded-sm border border-border-soft bg-surface-panel-muted px-2 py-1.5"
            >
              <div className="grid gap-1">
                <input
                  aria-label={`knowledge source ${index + 1} note`}
                  value={source.note}
                  onChange={(e) =>
                    onChange((prev) => updateKnowledge(prev, index, { note: e.target.value }))
                  }
                  className="rounded-xs border border-transparent bg-transparent font-caption text-xs text-ink outline-none focus:border-accent focus:bg-surface-panel focus:px-1"
                />
                <input
                  aria-label={`knowledge source ${index + 1} label`}
                  value={source.label}
                  onChange={(e) =>
                    onChange((prev) => updateKnowledge(prev, index, { label: e.target.value }))
                  }
                  className="rounded-xs border border-transparent bg-transparent font-caption text-xs text-ink-dim outline-none focus:border-accent focus:bg-surface-panel focus:px-1"
                />
              </div>
              <button
                type="button"
                aria-label={`remove knowledge source ${index + 1}`}
                onClick={() =>
                  onChange((prev) => ({
                    ...prev,
                    knowledgeSources: prev.knowledgeSources.filter((_, i) => i !== index),
                  }))
                }
                className="grid h-6 w-6 place-items-center rounded-sm border border-border-soft text-ink-dim transition-colors hover:text-ink"
              >
                <Trash2 className="h-3 w-3" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() =>
            onChange((prev) => ({
              ...prev,
              knowledgeSources: [
                ...prev.knowledgeSources,
                {
                  id: `source-${Date.now()}`,
                  kind: 'url',
                  note: 'brand source',
                  label: 'https://',
                },
              ],
            }))
          }
          className="inline-flex w-fit items-center gap-1 rounded-sm border border-border-soft px-2 py-1 font-caption text-xs text-ink-dim transition-colors hover:text-ink"
        >
          <Plus className="h-3 w-3" aria-hidden="true" />
          source
        </button>
      </div>

      <div className="flex flex-col gap-1">
        <span className="font-caption text-ink-dim">palette</span>
        <div data-testid="brand-palette" className="flex flex-col gap-1">
          {palette.map((color, index) => (
            <div key={index} className="grid grid-cols-[1.75rem_1fr_auto] items-center gap-1">
              <label className="relative h-7 w-7 overflow-hidden rounded-sm border border-border-soft">
                <span className="sr-only">{`pick colour ${index + 1}`}</span>
                <span
                  data-testid="brand-palette-chip"
                  className="block h-full w-full"
                  style={{ background: normalizeHexForInput(color) ?? '#000000' }}
                />
                <input
                  type="color"
                  aria-label={`pick colour ${index + 1}`}
                  value={normalizeHexForInput(color) ?? '#000000'}
                  onChange={(e) =>
                    onChange((prev) => updatePalette(prev, index, e.target.value))
                  }
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                />
              </label>
              <input
                aria-label={`hex colour ${index + 1}`}
                value={color}
                onChange={(e) => onChange((prev) => updatePalette(prev, index, e.target.value))}
                className="min-w-0 rounded-sm border border-border-soft bg-surface-panel px-2 py-1 font-caption text-xs text-ink outline-none focus:border-accent"
              />
              <button
                type="button"
                aria-label={`remove colour ${index + 1}`}
                onClick={() =>
                  onChange((prev) => ({
                    ...prev,
                    palette: prev.palette.filter((_, i) => i !== index),
                  }))
                }
                className="grid h-7 w-7 place-items-center rounded-sm border border-border-soft text-ink-dim transition-colors hover:text-ink"
              >
                <Trash2 className="h-3 w-3" aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() =>
            onChange((prev) => ({ ...prev, palette: [...prev.palette, '#FFFFFF'] }))
          }
          className="inline-flex w-fit items-center gap-1 rounded-sm border border-border-soft px-2 py-1 font-caption text-xs text-ink-dim transition-colors hover:text-ink"
        >
          <Plus className="h-3 w-3" aria-hidden="true" />
          colour
        </button>
      </div>

      <div className="flex flex-col gap-1">
        <span className="font-caption text-ink-dim">type</span>
        <textarea
          aria-label="brand type"
          rows={Math.max(2, Math.min(4, draft.type.length || 2))}
          value={typeText}
          onChange={(e) =>
            onChange((prev) => ({ ...prev, type: splitLines(e.target.value) }))
          }
          className="resize-none rounded-sm border border-border-soft bg-surface-panel-muted px-2 py-1.5 font-caption text-xs text-ink outline-none focus:border-accent"
        />
      </div>

      <div className="flex flex-col gap-1">
        <span className="font-caption text-ink-dim">voice</span>
        <textarea
          aria-label="brand voice"
          rows={4}
          value={draft.voice}
          onChange={(e) => onChange((prev) => ({ ...prev, voice: e.target.value }))}
          className="resize-none rounded-sm border border-border-soft bg-surface-panel-muted px-2 py-1.5 font-caption text-xs text-ink outline-none focus:border-accent"
        />
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-border-soft pt-2">
        <span
          role={validationMessage ? 'alert' : 'status'}
          className="font-caption text-xs text-ink-dim"
        >
          {validationMessage ?? (saveState === 'saved' ? 'saved' : dirty ? 'unsaved edits' : 'saved')}
        </span>
        <button
          type="button"
          onClick={onSave}
          disabled={!dirty || Boolean(validationMessage)}
          className="inline-flex items-center gap-1 rounded-sm border border-border-soft bg-surface-panel px-2 py-1 font-caption text-xs text-ink transition-colors hover:bg-surface-panel-muted disabled:opacity-50"
        >
          {saveState === 'saved' && !dirty ? (
            <Check className="h-3 w-3" aria-hidden="true" />
          ) : (
            <Save className="h-3 w-3" aria-hidden="true" />
          )}
          save
        </button>
      </div>
    </div>
  );
}

export function brandSectionSummary(context: BrandContext): string {
  return `${context.knowledgeSources.length} sources`;
}

function updatePalette(context: BrandContext, index: number, value: string): BrandContext {
  return {
    ...context,
    palette: context.palette.map((color, i) => (i === index ? value : color)),
  };
}

function updateKnowledge(
  context: BrandContext,
  index: number,
  patch: Partial<KnowledgeSource>
): BrandContext {
  return {
    ...context,
    knowledgeSources: context.knowledgeSources.map((source, i) =>
      i === index ? { ...source, ...patch } : source
    ),
  };
}

function normalizeHexForInput(value: string): string | null {
  const raw = value.trim();
  if (!HEX_RE.test(raw)) return null;
  const body = raw.replace(/^#/, '');
  if (body.length === 3) {
    return `#${body
      .split('')
      .map((ch) => `${ch}${ch}`)
      .join('')}`.toUpperCase();
  }
  return `#${body.toUpperCase()}`;
}

function splitLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function normalizeDraftForSave(context: BrandContext): BrandContext | null {
  const name = context.name.trim();
  if (!name) return null;
  const palette = context.palette
    .map(normalizeHexForInput)
    .filter((color): color is string => color !== null);
  if (palette.length !== context.palette.length) return null;

  return {
    ...context,
    name,
    palette,
    type: context.type.map((entry) => entry.trim()).filter(Boolean),
    voice: context.voice.trim(),
    knowledgeSources: context.knowledgeSources
      .map((source) => ({
        ...source,
        label: source.label.trim(),
        note: source.note.trim(),
      }))
      .filter((source) => source.label || source.note),
  };
}

function validateDraft(context: BrandContext): string | null {
  if (!context.name.trim()) return 'brand name required';
  const invalid = context.palette.find((color) => !normalizeHexForInput(color));
  if (invalid) return `invalid colour ${invalid}`;
  return null;
}

function brandContextFromSnapshot(base: BrandContext, snapshot: BrandSnapshot): BrandContext {
  const palette = snapshot.palette
    .map((entry) => normalizeHexForInput(entry.hex))
    .filter((color): color is string => color !== null);
  const type = snapshot.typography
    .map((entry) => `${entry.family}${entry.role ? ` · ${entry.role}` : ''}`.trim())
    .filter(Boolean);
  const voice = snapshot.voice.samples.join('\n');
  const source = knowledgeSourceFromSnapshot(snapshot.source);

  return {
    ...base,
    palette: palette.length > 0 ? palette : base.palette,
    type: type.length > 0 ? type : base.type,
    voice: voice || base.voice,
    knowledgeSources: source
      ? [source, ...base.knowledgeSources.filter((entry) => entry.id !== source.id)]
      : base.knowledgeSources,
  };
}

function knowledgeSourceFromSnapshot(source: BrandSnapshotSource): KnowledgeSource | null {
  if (!source.url) return null;
  const kind = source.kind === 'repo' ? 'repo' : 'url';
  const label = labelFromSourceUrl(source.url, kind);
  return {
    id: `${kind}-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`,
    kind: kind satisfies KnowledgeSourceKind,
    note: kind === 'repo' ? 'repo' : 'brand site',
    label,
  };
}

function labelFromSourceUrl(raw: string, kind: KnowledgeSourceKind): string {
  try {
    const url = new URL(raw);
    if (kind === 'repo') {
      const parts = url.pathname.split('/').filter(Boolean);
      return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : url.hostname;
    }
    return url.hostname.replace(/^www\./, '');
  } catch {
    return raw;
  }
}
