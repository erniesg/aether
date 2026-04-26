'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ClipboardEvent as ReactClipboardEvent,
  type DragEvent as ReactDragEvent,
  type FormEvent,
} from 'react';
import { Plus, X } from 'lucide-react';
import { fileToDataUrl, ingestUrlViaApi } from '@/lib/references/client';
import {
  addReference,
  removeReference,
  updateReference,
  useReferences,
} from '@/lib/references/store';
import { genReferenceId } from '@/lib/providers/reference/og';
import type { ReferenceKind, ReferenceRecord } from '@/lib/providers/reference/types';
import { cn } from '@/lib/utils/cn';
import { MAX_REF_BYTES, formatRefSizeError } from '@/lib/refs/limits';

/**
 * Images sub-tab of the References rail section. Drop zone that accepts:
 *  - URL paste (Pinterest / IG / XHS / TikTok / generic — routed server-side)
 *  - Clipboard image bytes
 *  - File uploads
 *
 * Ingested records show as chips; fallback (link-only) ingests are marked and
 * keep the URL pinned rather than swallowing the paste silently.
 */

type ZoneStatus =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'notice'; message: string };

const URL_RE = /^https?:\/\/\S+$/i;

export function ReferencesImagesTab({ workspaceId }: { workspaceId?: string }) {
  const records = useReferences(workspaceId).filter(
    (record) =>
      record.kind === 'image' || record.kind === 'video' || record.kind === 'embed'
  );
  const [status, setStatus] = useState<ZoneStatus>({ kind: 'idle' });
  const [draft, setDraft] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dragDepth = useRef(0);
  const [dragging, setDragging] = useState(false);

  const submitUrl = useCallback(
    async (url: string) => {
      const trimmed = url.trim();
      if (!URL_RE.test(trimmed)) {
        setStatus({ kind: 'error', message: 'paste an http(s) URL' });
        return;
      }
      setStatus({ kind: 'loading' });
      try {
        const outcome = await ingestUrlViaApi(trimmed);
        addReference(withReferenceDefaults(outcome.record), workspaceId);
        if (outcome.fallback) {
          setStatus({
            kind: 'notice',
            message: 'no preview found — kept as link-only reference',
          });
        } else {
          setStatus({ kind: 'idle' });
        }
        setDraft('');
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setStatus({ kind: 'error', message });
      }
    },
    [workspaceId]
  );

  const ingestFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setStatus({ kind: 'error', message: `${file.name} is not an image` });
      return;
    }
    if (file.size > MAX_REF_BYTES) {
      setStatus({ kind: 'error', message: formatRefSizeError(file) });
      return;
    }
    try {
      const dataUrl = await fileToDataUrl(file);
      const record: ReferenceRecord = {
        id: genReferenceId('ref_up'),
        kind: 'image',
        previewUrl: dataUrl,
        attribution: { source: 'upload', url: file.name },
        capturedAt: new Date().toISOString(),
        title: file.name.replace(/\.[^.]+$/, ''),
        usageIntent: 'visual anchor',
        tags: [],
      };
      addReference(record, workspaceId);
      setStatus({ kind: 'idle' });
    } catch (err) {
      setStatus({
        kind: 'error',
        message: err instanceof Error ? err.message : 'failed to read file',
      });
    }
  }, [workspaceId]);

  const onPaste = useCallback(
    (event: ReactClipboardEvent<HTMLInputElement>) => {
      const clip = event.clipboardData;
      if (!clip) return;
      // Image bytes take priority — avoids a text/plain data-URL string
      // arriving through the URL ingest path when a real bitmap is on hand.
      const files: File[] = [];
      for (const item of Array.from(clip.items ?? [])) {
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          const f = item.getAsFile();
          if (f) files.push(f);
        }
      }
      if (files.length > 0) {
        event.preventDefault();
        for (const file of files) void ingestFile(file);
        return;
      }
      const text = clip.getData('text/plain');
      if (text && URL_RE.test(text.trim())) {
        event.preventDefault();
        void submitUrl(text);
      }
    },
    [ingestFile, submitUrl]
  );

  const onDragEnter = (event: ReactDragEvent<HTMLDivElement>) => {
    if (!Array.from(event.dataTransfer?.types ?? []).includes('Files')) return;
    event.preventDefault();
    dragDepth.current += 1;
    setDragging(true);
  };
  const onDragOver = (event: ReactDragEvent<HTMLDivElement>) => {
    if (!Array.from(event.dataTransfer?.types ?? []).includes('Files')) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  };
  const onDragLeave = (event: ReactDragEvent<HTMLDivElement>) => {
    event.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  };
  const onDrop = (event: ReactDragEvent<HTMLDivElement>) => {
    event.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      for (const file of Array.from(files)) void ingestFile(file);
    }
  };

  const onFormSubmit = (e: FormEvent) => {
    e.preventDefault();
    void submitUrl(draft);
  };

  return (
    <div className="flex flex-col gap-2">
      <div
        data-testid="references-drop-zone"
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={cn(
          'relative flex flex-col gap-2 rounded-sm border border-dashed border-border-soft bg-surface-panel-muted px-2 py-2',
          dragging && 'border-accent bg-accent/5'
        )}
      >
        <span className="font-caption text-ink-dim">
          paste a pin · post · share link, or drop an image
        </span>
        <form onSubmit={onFormSubmit} className="flex gap-1">
          <input
            type="text"
            aria-label="reference source"
            placeholder="https://pin.it/…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onPaste={onPaste}
            disabled={status.kind === 'loading'}
            className="flex-1 rounded-sm border border-border-soft bg-surface-panel px-2 py-1 font-caption text-xs text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
          />
          <button
            type="submit"
            disabled={status.kind === 'loading' || !URL_RE.test(draft.trim())}
            className="rounded-sm border border-border-soft bg-surface-panel px-2 py-1 font-caption text-xs text-ink transition-colors hover:bg-surface-panel-muted disabled:opacity-50"
          >
            {status.kind === 'loading' ? 'ingest…' : 'ingest'}
          </button>
        </form>
        <label className="cursor-pointer font-caption text-xs text-ink-dim hover:text-ink">
          <span>or pick files</span>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              const files = e.target.files;
              if (files) for (const f of Array.from(files)) void ingestFile(f);
              e.currentTarget.value = '';
            }}
          />
        </label>
        {status.kind === 'error' ? (
          <div
            role="alert"
            data-testid="references-toast"
            className="rounded-sm border border-border-soft bg-surface-panel px-2 py-1 font-caption text-xs text-ink-dim"
          >
            {status.message}
          </div>
        ) : status.kind === 'notice' ? (
          <div
            role="status"
            data-testid="references-toast"
            className="rounded-sm border border-border-soft bg-surface-panel px-2 py-1 font-caption text-xs text-ink-dim"
          >
            {status.message}
          </div>
        ) : null}
      </div>
      {records.length === 0 ? (
        <span className="font-caption text-xs text-ink-faint">
          drop or paste reference images to pin
        </span>
      ) : (
        <ul
          data-testid="references-grid"
          className="grid grid-cols-3 gap-1.5"
          role="list"
        >
          {records.map((record) => (
            <ReferenceChip key={record.id} record={record} />
          ))}
        </ul>
      )}
      {records.length > 0 ? <ReferenceMetadataList records={records} /> : null}
    </div>
  );
}

function withReferenceDefaults(record: ReferenceRecord): ReferenceRecord {
  return {
    ...record,
    title:
      record.title ??
      record.attribution.author ??
      record.attribution.source ??
      'reference',
    usageIntent: record.usageIntent ?? (record.kind === 'embed' ? 'source note' : 'visual anchor'),
    tags: record.tags ?? [],
  };
}

function ReferenceChip({ record }: { record: ReferenceRecord }) {
  const author = record.attribution.author;
  const label = author
    ? `${record.attribution.source} · ${author}`
    : record.attribution.source;
  return (
    <li
      role="listitem"
      data-testid="reference-chip"
      data-reference-source={record.attribution.source}
      data-reference-kind={record.kind}
      className="group relative flex flex-col overflow-hidden rounded-xs border border-border-soft bg-surface-panel-muted"
    >
      {record.kind === 'embed' ? (
        <a
          href={record.fullUrl ?? record.previewUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="flex h-16 items-center justify-center px-1 font-mono text-2xs uppercase tracking-wide text-ink-dim"
          title={record.fullUrl ?? record.previewUrl}
        >
          link
        </a>
      ) : (
        <a
          href={record.fullUrl ?? record.previewUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="block"
          title={label}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={record.previewUrl}
            alt={label}
            className="h-16 w-full object-cover"
          />
        </a>
      )}
      <div className="flex items-center justify-between gap-1 border-t border-border-soft px-1 py-0.5">
        <span
          className="truncate font-mono text-2xs uppercase tracking-wide text-ink-dim"
          title={label}
        >
          {record.attribution.source}
        </span>
        <button
          type="button"
          aria-label={`remove reference ${label}`}
          onClick={() => removeReference(record.id)}
          className="rounded-xs text-ink-dim transition-colors hover:text-ink"
        >
          <X size={10} />
        </button>
      </div>
    </li>
  );
}

function ReferenceMetadataList({ records }: { records: ReferenceRecord[] }) {
  return (
    <ul className="flex flex-col gap-2" aria-label="reference metadata">
      {records.map((record, index) => (
        <ReferenceMetadataCard key={record.id} record={record} index={index} />
      ))}
    </ul>
  );
}

function ReferenceMetadataCard({
  record,
  index,
}: {
  record: ReferenceRecord;
  index: number;
}) {
  const label =
    record.title ??
    record.attribution.author ??
    record.attribution.source ??
    `reference ${index + 1}`;
  const [tagDraft, setTagDraft] = useState((record.tags ?? []).join(', '));

  useEffect(() => {
    setTagDraft((record.tags ?? []).join(', '));
  }, [record.id]);

  return (
    <li
      className="flex flex-col gap-1 rounded-sm border border-border-soft bg-surface-panel-muted px-2 py-2"
      data-reference-meta-id={record.id}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 truncate font-caption text-xs text-ink">{label}</span>
        <button
          type="button"
          aria-label={`remove reference ${label}`}
          onClick={() => removeReference(record.id)}
          className="rounded-xs text-ink-dim transition-colors hover:text-ink"
        >
          <X size={12} />
        </button>
      </div>
      <input
        aria-label={`reference title ${index + 1}`}
        value={record.title ?? ''}
        placeholder="title"
        onChange={(e) => updateReference(record.id, { title: e.target.value })}
        className="rounded-sm border border-border-soft bg-surface-panel px-2 py-1 font-caption text-xs text-ink placeholder:text-ink-faint outline-none focus:border-accent"
      />
      <div className="grid grid-cols-2 gap-1">
        <input
          aria-label={`source label ${index + 1}`}
          value={record.attribution.source}
          onChange={(e) => updateReference(record.id, { source: e.target.value })}
          className="min-w-0 rounded-sm border border-border-soft bg-surface-panel px-2 py-1 font-caption text-xs text-ink outline-none focus:border-accent"
        />
        <input
          aria-label={`reference attribution ${index + 1}`}
          value={record.attribution.author ?? ''}
          placeholder="author"
          onChange={(e) => updateReference(record.id, { author: e.target.value })}
          className="min-w-0 rounded-sm border border-border-soft bg-surface-panel px-2 py-1 font-caption text-xs text-ink placeholder:text-ink-faint outline-none focus:border-accent"
        />
      </div>
      <select
        aria-label={`reference usage ${index + 1}`}
        value={record.usageIntent ?? ''}
        onChange={(e) => updateReference(record.id, { usageIntent: e.target.value })}
        className="rounded-sm border border-border-soft bg-surface-panel px-2 py-1 font-caption text-xs text-ink outline-none focus:border-accent"
      >
        <option value="">usage intent</option>
        <option value="visual anchor">visual anchor</option>
        <option value="layout cue">layout cue</option>
        <option value="product truth">product truth</option>
        <option value="texture">texture</option>
        <option value="avoid">avoid</option>
      </select>
      <input
        aria-label={`reference tags ${index + 1}`}
        value={tagDraft}
        placeholder="tags"
        onChange={(e) => {
          setTagDraft(e.target.value);
          updateReference(record.id, {
            tags: e.target.value
              .split(',')
              .map((tag) => tag.trim())
              .filter(Boolean),
          });
        }}
        className="rounded-sm border border-border-soft bg-surface-panel px-2 py-1 font-caption text-xs text-ink placeholder:text-ink-faint outline-none focus:border-accent"
      />
      <textarea
        aria-label={`reference notes ${index + 1}`}
        value={record.notes ?? ''}
        rows={2}
        placeholder="notes"
        onChange={(e) => updateReference(record.id, { notes: e.target.value })}
        className="resize-none rounded-sm border border-border-soft bg-surface-panel px-2 py-1 font-caption text-xs text-ink placeholder:text-ink-faint outline-none focus:border-accent"
      />
    </li>
  );
}

export function ReferencesManualTab({
  kind,
  workspaceId,
}: {
  kind: Extract<ReferenceKind, 'template' | 'element'>;
  workspaceId?: string;
}) {
  const records = useReferences(workspaceId).filter((record) => record.kind === kind);
  const [title, setTitle] = useState('');
  const [source, setSource] = useState('');
  const label = kind === 'template' ? 'template' : 'element';

  const addManual = () => {
    const cleanTitle = title.trim();
    if (!cleanTitle) return;
    const id = genReferenceId(kind === 'template' ? 'ref_tpl' : 'ref_el');
    const cleanSource = source.trim();
    addReference(
      {
        id,
        kind,
        previewUrl: cleanSource || `aether:${kind}:${id}`,
        fullUrl: cleanSource || undefined,
        attribution: {
          source: cleanSource ? 'link' : 'manual',
          url: cleanSource || cleanTitle,
        },
        capturedAt: new Date().toISOString(),
        title: cleanTitle,
        usageIntent: kind === 'template' ? 'layout cue' : 'visual anchor',
        tags: [],
      },
      workspaceId
    );
    setTitle('');
    setSource('');
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="rounded-sm border border-dashed border-border-soft bg-surface-panel-muted px-2 py-2">
        <span className="font-caption text-ink-dim">save a {label}</span>
        <div className="mt-2 flex flex-col gap-1">
          <input
            aria-label={`${label} title`}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={`${label} title`}
            className="rounded-sm border border-border-soft bg-surface-panel px-2 py-1 font-caption text-xs text-ink placeholder:text-ink-faint outline-none focus:border-accent"
          />
          <div className="flex gap-1">
            <input
              aria-label={`${label} source`}
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="source link"
              className="min-w-0 flex-1 rounded-sm border border-border-soft bg-surface-panel px-2 py-1 font-caption text-xs text-ink placeholder:text-ink-faint outline-none focus:border-accent"
            />
            <button
              type="button"
              onClick={addManual}
              disabled={!title.trim()}
              className="inline-flex items-center gap-1 rounded-sm border border-border-soft bg-surface-panel px-2 py-1 font-caption text-xs text-ink transition-colors hover:bg-surface-panel-muted disabled:opacity-50"
            >
              <Plus className="h-3 w-3" aria-hidden="true" />
              add
            </button>
          </div>
        </div>
      </div>
      {records.length > 0 ? (
        <ReferenceMetadataList records={records} />
      ) : (
        <span className="font-caption text-xs text-ink-faint">
          saved {label}s become reusable canvas material
        </span>
      )}
    </div>
  );
}
