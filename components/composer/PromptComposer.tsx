'use client';

import { forwardRef, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import { ArrowUp, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

export interface PromptComposerProps {
  /** Which input set is currently driving generation. Undefined / empty
   * means there is no pinned material — the prompt will run with no refs. */
  activeInputSet?: string;
  /** Count of pinned inputs (refs + brand + product + brief items). Drives the chip label. */
  inputCount?: number;
  /** Called when the creator clicks the input-set chip — typically opens the input-set rail. */
  onOpenInputSet?: () => void;
  /** Invoked with the prompt string on submit. */
  onSubmit?: (prompt: string) => void | Promise<void>;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
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
    const [value, setValue] = useState('');
    const [pending, setPending] = useState(false);

    const setRef = (node: HTMLTextAreaElement | null) => {
      internalRef.current = node;
      if (typeof forwardedRef === 'function') forwardedRef(node);
      else if (forwardedRef) forwardedRef.current = node;
    };

    const submit = async () => {
      const prompt = value.trim();
      if (!prompt || pending || disabled) return;
      setPending(true);
      try {
        await onSubmit?.(prompt);
        setValue('');
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

    return (
      <form
        onSubmit={handleSubmit}
        data-taxonomy="tool"
        className={cn(
          'flex w-full items-center gap-2 border-t border-border-soft bg-surface-panel px-4',
          className
        )}
      >
        {(() => {
          const hasSet = Boolean(activeInputSet) && inputCount > 0;
          const label = hasSet
            ? `${activeInputSet} · ${inputCount} pinned`
            : 'no inputs pinned';
          const aria = hasSet
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
                hasSet
                  ? 'border-accent-secondary/30 bg-accent-secondary/10 text-ink-muted hover:text-ink'
                  : 'border-border-soft bg-surface-panel-muted text-ink-dim hover:text-ink'
              )}
            >
              <Sparkles size={10} strokeWidth={2} className="text-accent" />
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
          placeholder={placeholder}
          disabled={disabled || pending}
          spellCheck={false}
          className={cn(
            'flex-1 resize-none bg-transparent px-1 py-3 text-sm text-ink placeholder:text-ink-faint',
            'focus:outline-none disabled:cursor-not-allowed disabled:opacity-50'
          )}
        />

        <button
          type="submit"
          disabled={!value.trim() || disabled || pending}
          aria-label={pending ? 'generating' : 'generate'}
          className={cn(
            'inline-flex h-8 w-8 items-center justify-center rounded-sm border',
            'transition-colors duration-fast ease-quick',
            'disabled:cursor-not-allowed disabled:opacity-40',
            pending
              ? 'border-accent bg-accent text-ink-on-accent'
              : 'border-accent bg-accent text-ink-on-accent hover:bg-accent-strong'
          )}
        >
          <ArrowUp size={14} strokeWidth={2} />
        </button>
      </form>
    );
  }
);
