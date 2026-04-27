'use client';

import { useEffect, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils/cn';
import type { SkillManifest } from '@/lib/agent/skills/types';

export interface SkillAcceptDialogProps {
  /**
   * When non-null, the dialog opens and drafts a SKILL.md for this prompt
   * via /api/capability/draft-skill. Set to null to close the dialog.
   */
  pendingPrompt: string | null;
  onAccept: (manifest: SkillManifest) => void;
  onReject: () => void;
  /**
   * Forwarded to the draft-skill endpoint as `bypassAgent`. The workspace
   * shell sets this to true when the URL has `?bypass=1`, so demos / e2e
   * runs work without an Anthropic key.
   */
  bypassAgent?: boolean;
}

type LoadState = 'idle' | 'loading' | 'ready' | 'error';

/**
 * AC5 — accept/reject modal for a Claude-drafted SKILL.md.
 *
 * Fetches `/api/capability/draft-skill` when `pendingPrompt` is set, shows the
 * draft (front-matter + collapsible instructions body), and accept/reject
 * buttons. The creator can rename the skill before accepting; everything else
 * is read-only in this slice — re-prompting is the editing affordance.
 */
export function SkillAcceptDialog({
  pendingPrompt,
  onAccept,
  onReject,
  bypassAgent,
}: SkillAcceptDialogProps) {
  const [state, setState] = useState<LoadState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [manifest, setManifest] = useState<SkillManifest | null>(null);
  const [showInstructions, setShowInstructions] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!pendingPrompt) {
      setState('idle');
      setManifest(null);
      setError(null);
      setShowInstructions(false);
      return;
    }
    setState('loading');
    setError(null);
    setManifest(null);
    setShowInstructions(false);
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    (async () => {
      try {
        const res = await fetch('/api/capability/draft-skill', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: pendingPrompt, bypassAgent }),
          signal: ctrl.signal,
        });
        const json = (await res.json()) as {
          ok: boolean;
          manifest?: SkillManifest;
          error?: string;
        };
        if (!res.ok || !json.ok || !json.manifest) {
          throw new Error(json.error ?? `draft-skill failed (${res.status})`);
        }
        setManifest(json.manifest);
        setState('ready');
      } catch (err) {
        if ((err as { name?: string }).name === 'AbortError') return;
        setError(err instanceof Error ? err.message : String(err));
        setState('error');
      }
    })();

    return () => ctrl.abort();
  }, [pendingPrompt, bypassAgent]);

  const handleAccept = () => {
    if (!manifest) return;
    onAccept(manifest);
  };

  const open = pendingPrompt !== null;

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && onReject()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/20 backdrop-blur-sm" />
        <Dialog.Content
          data-taxonomy="tool"
          data-testid="skill-accept-dialog"
          className={cn(
            'fixed left-1/2 top-1/2 z-[1000] w-[min(640px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 opacity-100',
            'rounded-md border border-border bg-surface-panel p-4 shadow-lg'
          )}
        >
          <div className="flex items-center justify-between gap-3">
            <Dialog.Title className="flex items-center gap-2 font-caption text-ink">
              <Sparkles size={14} strokeWidth={1.75} className="text-accent" />
              author skill
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="close"
                className="rounded-sm p-1 text-ink-dim transition-colors hover:bg-surface-panel-muted hover:text-ink"
              >
                <X size={14} strokeWidth={1.75} />
              </button>
            </Dialog.Close>
          </div>

          <Dialog.Description className="sr-only">
            Review the SKILL.md Claude drafted for the requested move. Accept to
            pin it as a reusable canvas chip; reject to discard.
          </Dialog.Description>

          <div className="mt-3 flex flex-col gap-3">
            {state === 'loading' ? (
              <div
                className="flex items-center gap-2 font-caption text-ink-dim"
                data-testid="skill-accept-loading"
              >
                <span className="inline-block h-1 w-1 animate-pulse rounded-pill bg-accent" />
                claude is drafting SKILL.md…
              </div>
            ) : null}

            {state === 'error' ? (
              <div
                className="font-caption text-signal-error"
                data-testid="skill-accept-error"
              >
                {error}
              </div>
            ) : null}

            {state === 'ready' && manifest ? (
              <>
                <label className="flex flex-col gap-1">
                  <span className="font-caption text-ink-dim">name</span>
                  <input
                    type="text"
                    value={manifest.name}
                    onChange={(e) =>
                      setManifest({
                        ...manifest,
                        // Sanitise to kebab-case characters but preserve any
                        // trailing dash the user is mid-typing — the persist
                        // route also re-runs the safety check.
                        name: e.target.value
                          .toLowerCase()
                          .replace(/[^a-z0-9-]+/g, '-'),
                      })
                    }
                    data-testid="skill-accept-name"
                    className="w-full rounded-sm border border-border bg-surface-panel px-2 py-1.5 font-mono text-sm text-ink focus:border-accent focus:outline-none"
                  />
                </label>
                <div className="flex flex-col gap-1">
                  <span className="font-caption text-ink-dim">description</span>
                  <div
                    data-testid="skill-accept-description"
                    className="rounded-sm border border-border-soft bg-surface-panel-muted px-2 py-1.5 font-caption text-ink"
                  >
                    {manifest.description}
                  </div>
                </div>
                <div className="flex items-center gap-2 font-mono text-2xs text-ink-dim">
                  <span>version: {manifest.version}</span>
                  <span aria-hidden>·</span>
                  <span>tools: {manifest.tools.length}</span>
                  <span aria-hidden>·</span>
                  <span>refs: {manifest.referenceFiles.length}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowInstructions((s) => !s)}
                  data-testid="skill-accept-toggle-instructions"
                  className="self-start font-caption text-2xs uppercase tracking-wide text-ink-dim hover:text-ink"
                >
                  {showInstructions ? 'hide instructions' : 'show instructions'}
                </button>
                {showInstructions ? (
                  <pre
                    data-testid="skill-accept-instructions"
                    className="max-h-[40vh] overflow-auto rounded-sm border border-border-soft bg-surface-panel-muted p-2 font-mono text-2xs text-ink"
                  >
                    {manifest.instructions}
                  </pre>
                ) : null}
              </>
            ) : null}
          </div>

          <div className="mt-4 flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onReject}
              data-testid="skill-accept-reject"
            >
              cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              disabled={state !== 'ready' || !manifest}
              onClick={handleAccept}
              data-testid="skill-accept-confirm"
            >
              pin skill
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
