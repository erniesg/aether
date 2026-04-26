'use client';

/**
 * SettingsPopover — workspace-scoped provider overrides.
 *
 * Lives in the header (navigation taxonomy). Opens a small popover
 * (<300×220px) with three provider rows: voice, image, segmentation.
 * Persists to Convex on every change; shows a "saved" chip after save.
 *
 * Hard rules respected:
 * - No API key fields — provider keys remain wrangler secrets.
 * - Restraint: no subtitles, no descriptions. Layout carries meaning.
 * - Header = navigation taxonomy.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from 'react';
import { cn } from '@/lib/utils/cn';
import type { WorkspaceProviderPrefs } from '@/lib/providers/prefs';
import type { VoiceProviderId } from '@/lib/voice/types';

// ─── static option lists ─────────────────────────────────────────────────────

const VOICE_OPTIONS: Array<{ value: VoiceProviderId; label: string }> = [
  { value: 'gemini-live', label: 'gemini-live' },
  { value: 'openai-realtime', label: 'openai-realtime' },
];

const IMAGE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'openai', label: 'openai' },
  { value: 'gemini', label: 'gemini' },
  { value: 'replicate', label: 'replicate' },
  { value: 'volcengine', label: 'volcengine' },
];

const SEGMENTATION_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'sam3', label: 'sam3' },
  { value: 'sam2', label: 'sam2' },
];

const GEMINI_LIVE_MODEL_DEFAULT = 'gemini-3.1-flash-live-preview';

// ─── types ───────────────────────────────────────────────────────────────────

export interface SettingsPopoverProps {
  prefs: WorkspaceProviderPrefs;
  onSave: (next: WorkspaceProviderPrefs) => Promise<void> | void;
  className?: string;
}

// ─── component ───────────────────────────────────────────────────────────────

export function SettingsPopover({ prefs, onSave, className }: SettingsPopoverProps) {
  const [open, setOpen] = useState(false);
  const [local, setLocal] = useState<WorkspaceProviderPrefs>(prefs);
  const [saved, setSaved] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Sync local state when prefs prop changes (Convex reactive update)
  useEffect(() => {
    setLocal(prefs);
  }, [prefs]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  const commit = useCallback(
    async (next: WorkspaceProviderPrefs) => {
      setLocal(next);
      setSaved(false);
      await onSave(next);
      setSaved(true);
      // auto-clear "saved" indicator after 2 s
      setTimeout(() => setSaved(false), 2000);
    },
    [onSave]
  );

  const handleVoiceChange = useCallback(
    async (e: ChangeEvent<HTMLSelectElement>) => {
      const voiceProviderId = e.target.value as VoiceProviderId;
      const next: WorkspaceProviderPrefs = {
        ...local,
        voiceProviderId,
        // reset model to default when switching to gemini-live
        voiceModel:
          voiceProviderId === 'gemini-live'
            ? local.voiceModel ?? GEMINI_LIVE_MODEL_DEFAULT
            : undefined,
      };
      await commit(next);
    },
    [local, commit]
  );

  const handleModelChange = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const next: WorkspaceProviderPrefs = {
        ...local,
        voiceModel: e.target.value || undefined,
      };
      await commit(next);
    },
    [local, commit]
  );

  const handleImageChange = useCallback(
    async (e: ChangeEvent<HTMLSelectElement>) => {
      const next: WorkspaceProviderPrefs = {
        ...local,
        imageProviderId: e.target.value || undefined,
      };
      await commit(next);
    },
    [local, commit]
  );

  const handleSegmentationChange = useCallback(
    async (e: ChangeEvent<HTMLSelectElement>) => {
      const next: WorkspaceProviderPrefs = {
        ...local,
        segmentationProviderId: e.target.value || undefined,
      };
      await commit(next);
    },
    [local, commit]
  );

  const effectiveVoice = local.voiceProviderId ?? 'gemini-live';
  const showModelField = effectiveVoice === 'gemini-live';

  return (
    <div className={cn('relative', className)}>
      {/* Trigger chip */}
      <button
        ref={triggerRef}
        type="button"
        aria-label="settings"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          'inline-flex items-center gap-1 rounded-pill border border-border-soft px-1.5 py-0.5',
          'font-mono text-2xs uppercase tracking-wide',
          'transition-colors duration-fast ease-quick',
          open
            ? 'border-accent/50 bg-surface-panel text-ink'
            : 'bg-surface-panel-muted text-ink-dim hover:text-ink'
        )}
      >
        <svg
          aria-hidden
          width="10"
          height="10"
          viewBox="0 0 16 16"
          fill="currentColor"
          className="shrink-0 opacity-70"
        >
          <path d="M8 10.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5ZM8 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" />
          <path
            fillRule="evenodd"
            d="M6.257 1.14a1.25 1.25 0 0 1 3.486 0l.366.64a.625.625 0 0 0 .857.23l.64-.37a1.25 1.25 0 0 1 1.742 1.742l-.37.64a.625.625 0 0 0 .23.857l.64.366a1.25 1.25 0 0 1 0 3.486l-.64.366a.625.625 0 0 0-.23.857l.37.64a1.25 1.25 0 0 1-1.742 1.742l-.64-.37a.625.625 0 0 0-.857.23l-.366.64a1.25 1.25 0 0 1-3.486 0l-.366-.64a.625.625 0 0 0-.857-.23l-.64.37a1.25 1.25 0 0 1-1.742-1.742l.37-.64a.625.625 0 0 0-.23-.857l-.64-.366a1.25 1.25 0 0 1 0-3.486l.64-.366a.625.625 0 0 0 .23-.857l-.37-.64a1.25 1.25 0 0 1 1.742-1.742l.64.37a.625.625 0 0 0 .857-.23l.366-.64Zm2.093.433a.25.25 0 0 0-.7 0l-.366.64a1.625 1.625 0 0 1-2.228.595l-.64-.37a.25.25 0 0 0-.348.349l.37.64a1.625 1.625 0 0 1-.595 2.228l-.64.366a.25.25 0 0 0 0 .7l.64.366a1.625 1.625 0 0 1 .595 2.228l-.37.64a.25.25 0 0 0 .349.348l.64-.37a1.625 1.625 0 0 1 2.228.595l.366.64a.25.25 0 0 0 .7 0l.366-.64a1.625 1.625 0 0 1 2.228-.595l.64.37a.25.25 0 0 0 .348-.348l-.37-.64a1.625 1.625 0 0 1 .595-2.228l.64-.366a.25.25 0 0 0 0-.7l-.64-.366a1.625 1.625 0 0 1-.595-2.228l.37-.64a.25.25 0 0 0-.348-.349l-.64.37a1.625 1.625 0 0 1-2.228-.595l-.366-.64Z"
          />
        </svg>
        <span>providers</span>
        {saved ? (
          <span className="text-signal-ok opacity-90">· saved</span>
        ) : null}
      </button>

      {/* Popover */}
      {open ? (
        <div
          ref={popoverRef}
          role="dialog"
          aria-label="workspace provider settings"
          className={cn(
            // size constraint: <300×220px
            'w-[280px]',
            'absolute right-0 top-full z-50 mt-1',
            'rounded-md border border-border bg-surface-panel shadow-md',
            'flex flex-col gap-2 p-3'
          )}
        >
          {/* Voice row */}
          <Row label="voice" htmlFor="wp-voice">
            <select
              id="wp-voice"
              aria-label="voice"
              value={effectiveVoice}
              onChange={handleVoiceChange}
              className={selectCls}
            >
              {VOICE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </Row>

          {/* Model field — gemini-live only */}
          {showModelField ? (
            <Row label="model" htmlFor="wp-voice-model">
              <input
                id="wp-voice-model"
                aria-label="model"
                type="text"
                value={local.voiceModel ?? GEMINI_LIVE_MODEL_DEFAULT}
                onChange={handleModelChange}
                className={inputCls}
                spellCheck={false}
              />
            </Row>
          ) : null}

          {/* Image row */}
          <Row label="image" htmlFor="wp-image">
            <select
              id="wp-image"
              aria-label="image"
              value={local.imageProviderId ?? ''}
              onChange={handleImageChange}
              className={selectCls}
            >
              <option value="">default</option>
              {IMAGE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </Row>

          {/* Segmentation row */}
          <Row label="segmentation" htmlFor="wp-seg">
            <select
              id="wp-seg"
              aria-label="segmentation"
              value={local.segmentationProviderId ?? ''}
              onChange={handleSegmentationChange}
              className={selectCls}
            >
              <option value="">default</option>
              {SEGMENTATION_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </Row>
        </div>
      ) : null}
    </div>
  );
}

// ─── sub-components ──────────────────────────────────────────────────────────

function Row({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <label
        htmlFor={htmlFor}
        className="w-[76px] shrink-0 font-mono text-2xs uppercase tracking-wide text-ink-dim"
      >
        {label}
      </label>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

const selectCls = cn(
  'w-full rounded border border-border-soft bg-surface-panel-muted',
  'px-1.5 py-0.5 font-mono text-2xs text-ink',
  'focus:outline-none focus:ring-1 focus:ring-accent/50'
);

const inputCls = cn(
  'w-full rounded border border-border-soft bg-surface-panel-muted',
  'px-1.5 py-0.5 font-mono text-2xs text-ink',
  'focus:outline-none focus:ring-1 focus:ring-accent/50',
  'placeholder:text-ink-faint'
);
