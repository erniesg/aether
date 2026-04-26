'use client';

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type {
  ClipboardEvent as ReactClipboardEvent,
  DragEvent as ReactDragEvent,
  FormEvent,
  KeyboardEvent,
} from 'react';
import { ArrowUp, ChevronDown, ImagePlus, Loader2, Sparkles, X } from 'lucide-react';
import { ingestUrlViaApi } from '@/lib/references/client';
import { addReference } from '@/lib/references/store';
import { cn } from '@/lib/utils/cn';
import { MAX_REF_BYTES, formatRefSizeError } from '@/lib/refs/limits';

/**
 * Imperative API the composer exposes to its parent. `focus` drives the
 * "AI · focus composer" entrypoint; `setPrompt` is how AI verbs on the
 * floating toolbar prefill the textarea with a prompt preset.
 */
export interface ComposerHandle {
  focus: () => void;
  setPrompt: (next: string) => void;
}

/**
 * Format-fanout scope for a single generation. `all` dispatches the prompt
 * against every linked artboard so the key visual fans out. `single` is a
 * one-shot override (typically via ⇧+Enter) that keeps the generation
 * scoped to the currently-focused artboard without changing the sticky
 * preference.
 */
export type PromptScope = 'all' | 'single';

/**
 * How multiple format variants are rendered.
 *   crop    — one hero render, geometric crop to every format (default / "responsive")
 *   fanout  — N separate renders, one per format ("variants")
 */
export type RenderMode = 'crop' | 'fanout';

export interface PromptSubmitOptions {
  /** Ad-hoc reference images as data URLs, only present when creators drop / paste / pick. */
  refs?: string[];
  /** Whether this generation should fan out to every linked format or scope to one. */
  scope: PromptScope;
  /** Active target artboard when scope resolves to a single format. */
  targetId?: string;
  /** How to execute the multi-format render. */
  renderMode: RenderMode;
}

export interface PromptFormatOption {
  id: string;
  label: string;
}

export interface PromptComposerProps {
  /** Which input set is currently driving generation. Undefined / empty
   * means there is no pinned material — the prompt will run with no refs. */
  activeInputSet?: string;
  /** Count of pinned inputs (refs + brand + offer + campaign items). Drives the chip label. */
  inputCount?: number;
  /** Number of linked formats on the canvas — drives the "apply to all · N formats" chip. */
  formatCount?: number;
  /** Available linked formats the creator can target directly in single scope. */
  formats?: ReadonlyArray<PromptFormatOption>;
  /** Active format id when scope is single. */
  activeFormatId?: string;
  /** Sticky scope; defaults to 'all'. Clicking the scope chip toggles this state. */
  defaultScope?: PromptScope;
  /** Initial render mode. Defaults to 'crop' (responsive by default per demo thesis). */
  defaultRenderMode?: RenderMode;
  /** Called when the creator picks a different single-format target. */
  onActiveFormatChange?: (formatId: string) => void;
  /** Called when the creator changes the render mode chip. */
  onRenderModeChange?: (mode: RenderMode) => void;
  /** Called when the creator clicks the input-set chip — typically opens the input-set rail. */
  onOpenInputSet?: () => void;
  /** Invoked with the prompt string and a submit-options bundle
   * (refs + scope) on submit. */
  onSubmit?: (prompt: string, options: PromptSubmitOptions) => void | Promise<void>;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

const MAX_REFS = 6;

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
export const PromptComposer = forwardRef<ComposerHandle, PromptComposerProps>(
  function PromptComposer(
    {
      activeInputSet,
      inputCount = 0,
      formatCount = 0,
      formats = [],
      activeFormatId,
      defaultScope = 'all',
      defaultRenderMode = 'crop',
      onActiveFormatChange,
      onRenderModeChange,
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
    const [scope, setScope] = useState<PromptScope>(defaultScope);
    const [renderMode, setRenderMode] = useState<RenderMode>(defaultRenderMode);
    const activeFormat =
      formats.find((format) => format.id === activeFormatId) ?? formats[0];
    const resolvedActiveFormatId = activeFormat?.id;

    useImperativeHandle(
      forwardedRef,
      () => ({
        focus: () => internalRef.current?.focus(),
        setPrompt: (next: string) => {
          setValue(next);
          // Focus after write so the creator can immediately edit the preset.
          requestAnimationFrame(() => internalRef.current?.focus());
        },
      }),
      []
    );

    const ingestFiles = useCallback(
      async (files: FileList | File[]) => {
        setRefError(null);
        const images = Array.from(files).filter((f) => f.type.startsWith('image/'));
        if (images.length === 0) return;
        const fresh: string[] = [];
        for (const f of images) {
          if (f.size > MAX_REF_BYTES) {
            setRefError(formatRefSizeError(f));
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

    // Window-level drag-drop capture — the composer is only h-composer (56px)
    // tall, so a creator dragging a file from desktop usually drops over the
    // canvas instead. tldraw's own drop handler then intercepts and inserts
    // the file as a canvas asset, which is the OPPOSITE of what we want. By
    // capturing dragenter/dragover/drop at the window with `capture:true` and
    // calling preventDefault on file drags, we route ALL file drops anywhere
    // on the page into `ingestFiles` — matching creator intent ("attach this
    // image as a reference").
    useEffect(() => {
      const hasFiles = (e: DragEvent) =>
        Array.from(e.dataTransfer?.types ?? []).includes('Files');

      const claimFileDrag = (e: DragEvent) => {
        if (!hasFiles(e)) return false;
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        return true;
      };

      const onWindowDragEnter = (e: DragEvent) => {
        if (!claimFileDrag(e)) return;
        dragDepth.current += 1;
        setDragging(true);
      };
      const onWindowDragOver = (e: DragEvent) => {
        if (!claimFileDrag(e)) return;
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
      };
      const onWindowDragLeave = (e: DragEvent) => {
        if (!claimFileDrag(e)) return;
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setDragging(false);
      };
      const onWindowDrop = (e: DragEvent) => {
        if (!claimFileDrag(e)) return;
        dragDepth.current = 0;
        setDragging(false);
        const files = e.dataTransfer?.files;
        if (files && files.length > 0) void ingestFiles(files);
      };

      window.addEventListener('dragenter', onWindowDragEnter, { capture: true });
      window.addEventListener('dragover', onWindowDragOver, { capture: true });
      window.addEventListener('dragleave', onWindowDragLeave, { capture: true });
      window.addEventListener('drop', onWindowDrop, { capture: true });
      return () => {
        window.removeEventListener('dragenter', onWindowDragEnter, { capture: true });
        window.removeEventListener('dragover', onWindowDragOver, { capture: true });
        window.removeEventListener('dragleave', onWindowDragLeave, { capture: true });
        window.removeEventListener('drop', onWindowDrop, { capture: true });
      };
    }, [ingestFiles]);

    const submit = async (overrideScope?: PromptScope) => {
      const prompt = value.trim();
      if (!prompt || pending || disabled) return;
      setPending(true);
      try {
        await onSubmit?.(prompt, {
          refs: refs.length > 0 ? refs : undefined,
          scope: overrideScope ?? scope,
          targetId: (overrideScope ?? scope) === 'single' ? resolvedActiveFormatId : undefined,
          renderMode,
        });
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
      if (event.key !== 'Enter') return;
      // ⇧+Enter is the one-shot single-format override. Plain Enter uses the
      // sticky scope preference (click the chip to flip it persistently).
      if (event.shiftKey) {
        event.preventDefault();
        void submit('single');
        return;
      }
      event.preventDefault();
      void submit();
    };

    const handlePaste = (event: ReactClipboardEvent<HTMLTextAreaElement>) => {
      const clip = event.clipboardData;
      if (!clip) return;
      // Image bytes beat URL paste — real bitmap trumps a share link.
      const files: File[] = [];
      for (const item of Array.from(clip.items ?? [])) {
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          const f = item.getAsFile();
          if (f) files.push(f);
        }
      }
      if (files.length > 0) {
        event.preventDefault();
        void ingestFiles(files);
        return;
      }
      const text = clip.getData('text/plain').trim();
      if (text && /^https?:\/\/\S+$/i.test(text)) {
        event.preventDefault();
        void (async () => {
          setRefError(null);
          try {
            const outcome = await ingestUrlViaApi(text);
            addReference(outcome.record);
            if (outcome.record.kind === 'image' && outcome.record.previewUrl) {
              setRefs((prev) => {
                if (prev.length >= MAX_REFS) {
                  setRefError(`keeping the first ${MAX_REFS} references`);
                  return prev;
                }
                return [...prev, outcome.record.previewUrl];
              });
            }
            if (outcome.fallback) {
              setRefError('no preview — kept as link-only reference');
            }
          } catch (err) {
            setRefError(err instanceof Error ? err.message : 'ingest failed');
          }
        })();
      }
    };

    const handleDragEnter = (event: ReactDragEvent<HTMLFormElement>) => {
      if (!Array.from(event.dataTransfer?.types ?? []).includes('Files')) return;
      event.preventDefault();
      event.stopPropagation();
      event.nativeEvent.stopImmediatePropagation();
      dragDepth.current += 1;
      setDragging(true);
    };

    const handleDragOver = (event: ReactDragEvent<HTMLFormElement>) => {
      if (!Array.from(event.dataTransfer?.types ?? []).includes('Files')) return;
      event.preventDefault();
      event.stopPropagation();
      event.nativeEvent.stopImmediatePropagation();
      event.dataTransfer.dropEffect = 'copy';
    };

    const handleDragLeave = (event: ReactDragEvent<HTMLFormElement>) => {
      if (!Array.from(event.dataTransfer?.types ?? []).includes('Files')) return;
      event.preventDefault();
      event.stopPropagation();
      event.nativeEvent.stopImmediatePropagation();
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) setDragging(false);
    };

    const handleDrop = (event: ReactDragEvent<HTMLFormElement>) => {
      event.preventDefault();
      event.stopPropagation();
      event.nativeEvent.stopImmediatePropagation();
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
          'relative flex w-full items-center gap-2 border-t border-border-soft bg-surface-panel px-4',
          className
        )}
      >
        {refs.length > 0 ? (
          // Float the ref-thumb tray above the composer so the fixed
          // h-composer footprint stays stable and refs don't bleed into the
          // canvas area. Reads as an extension of the composer upward —
          // same panel tone, rounded top corners, no gap between tray and
          // composer body.
          <div
            className="pointer-events-none absolute bottom-full left-2 right-2 flex justify-start"
            aria-hidden={false}
          >
            <div
              role="list"
              aria-label={`${refs.length} reference image${refs.length === 1 ? '' : 's'}`}
              className="pointer-events-auto flex max-w-full flex-wrap items-center gap-1.5 rounded-t-md border border-b-0 border-border-soft bg-surface-panel px-2 py-1.5"
            >
              {refs.map((dataUrl, i) => (
                <span
                  key={i}
                  role="listitem"
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
              ? `input set · ${refs.length} ad-hoc reference image${refs.length === 1 ? '' : 's'} attached`
              : hasSet
              ? `input set · ${activeInputSet} · ${inputCount} pinned · click to view`
              : 'input set · no inputs pinned · click to open';
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

          {(() => {
            const scopeLabel =
              scope === 'all'
                ? `apply to all · ${formatCount} format${formatCount === 1 ? '' : 's'}`
                : 'only this format';
            const aria = `format scope · ${scopeLabel}${activeFormat ? ` · active ${activeFormat.label}` : ''} · click to toggle (⇧+Enter for one-shot single-format)`;
            return (
              <button
                type="button"
                aria-label={aria}
                title={aria}
                onClick={() => setScope((prev) => (prev === 'all' ? 'single' : 'all'))}
                className={cn(
                  'inline-flex items-center gap-1 rounded-pill border px-2 py-0.5 font-mono text-2xs uppercase tracking-wide transition-colors duration-fast ease-quick',
                  scope === 'all'
                    ? 'border-border-soft bg-surface-panel-muted text-ink-dim hover:text-ink'
                    : 'border-accent bg-accent text-ink-on-accent'
                )}
              >
                {scopeLabel}
              </button>
            );
          })()}

          {(() => {
            // C2: unified "variants" naming — "crop" (one hero, geometric crop)
            // vs "variants" (N separate renders, one per format). No "responsive"
            // terminology — that was ambiguous with CSS responsive breakpoints.
            const label = renderMode === 'crop' ? 'crop' : 'variants';
            const aria = `render mode · ${label} · click to toggle between crop (one render, cropped to each format) and variants (separate render per format)`;
            return (
              <button
                type="button"
                aria-label={aria}
                title={aria}
                onClick={() => {
                  const next: RenderMode = renderMode === 'crop' ? 'fanout' : 'crop';
                  setRenderMode(next);
                  onRenderModeChange?.(next);
                }}
                className={cn(
                  'inline-flex items-center gap-1 rounded-pill border px-2 py-0.5 font-mono text-2xs uppercase tracking-wide transition-colors duration-fast ease-quick',
                  renderMode === 'crop'
                    ? 'border-border-soft bg-surface-panel-muted text-ink-dim hover:text-ink'
                    : 'border-accent-secondary/50 bg-accent-secondary/10 text-ink-muted hover:text-ink'
                )}
              >
                {label}
              </button>
            );
          })()}

          {scope === 'single' && activeFormat ? (
            <label className="relative inline-flex items-center">
              <span className="sr-only">active format</span>
              <select
                aria-label="active format"
                value={activeFormat.id}
                onChange={(event) => onActiveFormatChange?.(event.target.value)}
                className={cn(
                  'appearance-none rounded-pill border border-border-soft bg-surface-panel-muted py-0.5 pl-2 pr-7 font-mono text-2xs uppercase tracking-wide text-ink',
                  'transition-colors duration-fast ease-quick hover:border-border focus:border-accent focus:outline-none'
                )}
              >
                {formats.map((format) => (
                  <option key={format.id} value={format.id}>
                    {format.label}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={12}
                strokeWidth={2}
                className="pointer-events-none absolute right-2 text-ink-dim"
              />
            </label>
          ) : null}

          <textarea
            ref={internalRef}
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
