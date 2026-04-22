'use client';

import { forwardRef, useCallback, useRef, useState } from 'react';
import type {
  ClipboardEvent as ReactClipboardEvent,
  DragEvent as ReactDragEvent,
  FormEvent,
  KeyboardEvent,
} from 'react';
import { ArrowUp, ImagePlus, Loader2, Sparkles, X } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

export interface PromptComposerProps {
  /** Which input set is currently driving generation. Undefined / empty
   * means there is no pinned material — the prompt will run with no refs. */
  activeInputSet?: string;
  /** Count of pinned inputs (refs + brand + product + brief items). Drives the chip label. */
  inputCount?: number;
  /** Called when the creator clicks the input-set chip — typically opens the input-set rail. */
  onOpenInputSet?: () => void;
  /** Invoked with the prompt string (and any ad-hoc reference images dropped into
   * the composer, as base64 data URLs) on submit. */
  onSubmit?: (prompt: string, refs?: string[]) => void | Promise<void>;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

const MAX_REFS = 6;
const MAX_REF_BYTES = 8 * 1024 * 1024; // 8 MB per ref — stays well under request-body limits.

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.readAsDataURL(file);
  });
}

/**
 * The prompt composer — hard rule 4: always at the bottom, with an explicit
 * readout of what the generate action will act on (active input set).
 * Fires onSubmit with the prompt text; the agent loop owns what happens next.
 */
export const PromptComposer = forwardRef<HTMLTextAreaElement, PromptComposerProps>(
  function PromptComposer(
    {
      activeInputSet,
      inputCount = 0,
      onOpenInputSet,
      onSubmit,
      placeholder = 'describe the generation…',
      className,
      disabled,
    },
    forwardedRef
  ) {
    const internalRef = useRef<HTMLTextAreaElement | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const dragDepth = useRef(0);
    const [value, setValue] = useState('');
    const [pending, setPending] = useState(false);
    const [refs, setRefs] = useState<string[]>([]);
    const [dragging, setDragging] = useState(false);
    const [refError, setRefError] = useState<string | null>(null);

    const setRef = (node: HTMLTextAreaElement | null) => {
      internalRef.current = node;
      if (typeof forwardedRef === 'function') forwardedRef(node);
      else if (forwardedRef) forwardedRef.current = node;
    };

    const ingestFiles = useCallback(
      async (files: FileList | File[]) => {
        setRefError(null);
        const images = Array.from(files).filter((f) => f.type.startsWith('image/'));
        if (images.length === 0) return;
        const fresh: string[] = [];
        for (const f of images) {
          if (f.size > MAX_REF_BYTES) {
            setRefError(`${f.name} is over 8 MB — skipped`);
            continue;
          }
          try {
            fresh.push(await readFileAsDataUrl(f));
          } catch (err) {
            setRefError(err instanceof Error ? err.message : 'failed to read image');
          }
        }
        if (fresh.length === 0) return;
        setRefs((prev) => {
          const merged = [...prev, ...fresh];
          if (merged.length > MAX_REFS) {
            setRefError(`keeping the first ${MAX_REFS} references`);
            return merged.slice(0, MAX_REFS);
          }
          return merged;
        });
      },
      []
    );

    const submit = async () => {
      const prompt = value.trim();
      if (!prompt || pending || disabled) return;
      setPending(true);
      try {
        await onSubmit?.(prompt, refs.length > 0 ? refs : undefined);
        setValue('');
        setRefs([]);
      } finally {
        setPending(false);
      }
    };

    const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      void submit();
    };

    const handleKey = (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        void submit();
      }
    };

    const handlePaste = (event: ReactClipboardEvent<HTMLTextAreaElement>) => {
      const items = event.clipboardData?.items;
      if (!items) return;
      const files: File[] = [];
      for (const item of Array.from(items)) {
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          const f = item.getAsFile();
          if (f) files.push(f);
        }
      }
      if (files.length > 0) {
        event.preventDefault();
        void ingestFiles(files);
      }
    };

    const handleDragEnter = (event: ReactDragEvent<HTMLFormElement>) => {
      if (!Array.from(event.dataTransfer?.types ?? []).includes('Files')) return;
      event.preventDefault();
      dragDepth.current += 1;
      setDragging(true);
    };

    const handleDragOver = (event: ReactDragEvent<HTMLFormElement>) => {
      if (!Array.from(event.dataTransfer?.types ?? []).includes('Files')) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    };

    const handleDragLeave = (event: ReactDragEvent<HTMLFormElement>) => {
      event.preventDefault();
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) setDragging(false);
    };

    const handleDrop = (event: ReactDragEvent<HTMLFormElement>) => {
      event.preventDefault();
      dragDepth.current = 0;
      setDragging(false);
      const files = event.dataTransfer?.files;
      if (files && files.length > 0) void ingestFiles(files);
    };

    const removeRef = (idx: number) => {
      setRefs((prev) => prev.filter((_, i) => i !== idx));
    };

    return (
      <form
        onSubmit={handleSubmit}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        data-taxonomy="tool"
        className={cn(
          'relative flex w-full flex-col border-t border-border-soft bg-surface-panel px-4',
          className
        )}
      >
        {refs.length > 0 ? (
          <div
            className="flex flex-wrap items-center gap-1.5 pt-2"
            aria-label={`${refs.length} reference image${refs.length === 1 ? '' : 's'}`}
          >
            {refs.map((dataUrl, i) => (
              <span
                key={i}
                className="relative inline-flex h-10 w-10 overflow-hidden rounded-xs border border-border-soft bg-surface-panel-muted"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={dataUrl}
                  alt={`reference ${i + 1}`}
                  className="h-full w-full object-cover"
                />
                <button
                  type="button"
                  aria-label={`remove reference ${i + 1}`}
                  onClick={() => removeRef(i)}
                  className="absolute right-0 top-0 inline-flex h-4 w-4 items-center justify-center rounded-bl-xs border-b border-l border-border-soft bg-surface-panel text-ink-dim transition-colors hover:text-ink"
                >
                  <X size={9} strokeWidth={2} />
                </button>
              </span>
            ))}
            {refError ? (
              <span className="font-caption text-ink-dim">{refError}</span>
            ) : null}
          </div>
        ) : null}

        <div className="flex w-full items-center gap-2">
          {(() => {
            const hasSet = Boolean(activeInputSet) && inputCount > 0;
            const hasRefs = refs.length > 0;
            const label = hasRefs
              ? `${refs.length} ref${refs.length === 1 ? '' : 's'}${hasSet ? ` · ${inputCount} pinned` : ''}`
              : hasSet
              ? `${activeInputSet} · ${inputCount} pinned`
              : 'no inputs pinned';
            const aria = hasRefs
              ? `${refs.length} ad-hoc reference image${refs.length === 1 ? '' : 's'} attached`
              : hasSet
              ? `active input set · ${activeInputSet} · ${inputCount} pinned · click to view`
              : 'no inputs pinned · click to open input set';
            return (
              <button
                type="button"
                onClick={onOpenInputSet}
                aria-label={aria}
                title={aria}
                className={cn(
                  'inline-flex items-center gap-1 rounded-pill border px-2 py-0.5 font-mono text-2xs uppercase tracking-wide transition-colors duration-fast ease-quick',
                  hasRefs
                    ? 'border-accent/40 bg-accent/10 text-accent'
                    : hasSet
                    ? 'border-accent-secondary/30 bg-accent-secondary/10 text-ink-muted hover:text-ink'
                    : 'border-border-soft bg-surface-panel-muted text-ink-dim hover:text-ink'
                )}
              >
                <Sparkles size={10} strokeWidth={2} />
                {label}
              </button>
            );
          })()}

          <textarea
            ref={setRef}
            rows={1}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKey}
            onPaste={handlePaste}
            placeholder={placeholder}
            disabled={disabled || pending}
            spellCheck={false}
            className={cn(
              'flex-1 resize-none bg-transparent px-1 py-3 text-sm text-ink placeholder:text-ink-faint',
              'focus:outline-none disabled:cursor-not-allowed disabled:opacity-50'
            )}
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            aria-label="add reference image"
            title="drop, paste, or click to attach reference images (max 6)"
            disabled={disabled || pending || refs.length >= MAX_REFS}
            className="inline-flex h-8 w-8 items-center justify-center rounded-sm border border-border-soft text-ink-dim transition-colors duration-fast ease-quick hover:border-border hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ImagePlus size={14} strokeWidth={2} />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) void ingestFiles(e.target.files);
              e.target.value = '';
            }}
          />

          <button
            type="submit"
            disabled={!value.trim() || disabled || pending}
            aria-label={pending ? 'generating' : 'generate'}
            className={cn(
              'inline-flex h-8 w-8 items-center justify-center rounded-sm border border-accent bg-accent text-ink-on-accent',
              'transition-colors duration-fast ease-quick hover:bg-accent-strong',
              'disabled:cursor-not-allowed disabled:opacity-40'
            )}
          >
            {pending ? (
              <Loader2 size={14} strokeWidth={2} className="animate-spin" />
            ) : (
              <ArrowUp size={14} strokeWidth={2} />
            )}
          </button>
        </div>

        {dragging ? (
          <div
            className="pointer-events-none absolute inset-1 flex items-center justify-center rounded-sm border border-dashed border-accent bg-accent/5 font-caption text-accent"
            aria-hidden
          >
            drop images to attach as references
          </div>
        ) : null}
      </form>
    );
  }
);
