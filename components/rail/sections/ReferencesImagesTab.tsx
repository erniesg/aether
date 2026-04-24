'use client';

import {
  useCallback,
  useRef,
  useState,
  type ClipboardEvent as ReactClipboardEvent,
  type DragEvent as ReactDragEvent,
  type FormEvent,
} from 'react';
import { X } from 'lucide-react';
import { fileToDataUrl, ingestUrlViaApi } from '@/lib/references/client';
import { addReference, removeReference, useReferences } from '@/lib/references/store';
import { genReferenceId } from '@/lib/providers/reference/og';
import type { ReferenceRecord } from '@/lib/providers/reference/types';
import { cn } from '@/lib/utils/cn';

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
const MAX_FILE_BYTES = 8 * 1024 * 1024;

export function ReferencesImagesTab() {
  const records = useReferences();
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
        addReference(outcome.record);
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
    []
  );

  const ingestFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setStatus({ kind: 'error', message: `${file.name} is not an image` });
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setStatus({ kind: 'error', message: `${file.name} exceeds 8 MB` });
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
      };
      addReference(record);
      setStatus({ kind: 'idle' });
    } catch (err) {
      setStatus({
        kind: 'error',
        message: err instanceof Error ? err.message : 'failed to read file',
      });
    }
  }, []);

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
    </div>
  );
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
