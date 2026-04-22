'use client';

import { useEffect, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Sparkles, X } from 'lucide-react';
import type { CapabilityRunRecord } from '@/lib/store/runs';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils/cn';

export interface ProposedCapability {
  name: string;
  trigger: string;
  paramSchema: Record<string, unknown>;
  notes?: string;
}

export interface PinDialogProps {
  run: CapabilityRunRecord | null;
  open: boolean;
  onAccept: (proposal: ProposedCapability, run: CapabilityRunRecord) => void;
  onReject: () => void;
}

type LoadState = 'idle' | 'loading' | 'ready' | 'error';

/**
 * Pin-as-capability dialog. Fetches `/api/capability/propose`, shows Claude's
 * proposal with inline editing on name + trigger, accept/reject buttons. The
 * proposal paramSchema + notes are shown read-only for now — the creator can
 * edit a definition later from the toolbar chip's context menu (future slice).
 */
export function PinDialog({ run, open, onAccept, onReject }: PinDialogProps) {
  const [state, setState] = useState<LoadState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<ProposedCapability | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!open || !run) return;
    setState('loading');
    setError(null);
    setProposal(null);
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    (async () => {
      try {
        // `?bypass=1` lets the demo run with an empty / throttled Anthropic
        // key — /api/capability/propose falls back to a deterministic local
        // proposal instead of calling Claude.
        const bypassAgent =
          typeof window !== 'undefined' &&
          new URLSearchParams(window.location.search).get('bypass') === '1';
        const res = await fetch('/api/capability/propose', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ run, bypassAgent }),
          signal: ctrl.signal,
        });
        const json = (await res.json()) as { ok: boolean; proposal?: ProposedCapability; error?: string };
        if (!res.ok || !json.ok || !json.proposal) {
          throw new Error(json.error ?? `proposal failed (${res.status})`);
        }
        setProposal(json.proposal);
        setState('ready');
      } catch (err) {
        if ((err as { name?: string }).name === 'AbortError') return;
        setError(err instanceof Error ? err.message : String(err));
        setState('error');
      }
    })();

    return () => ctrl.abort();
  }, [open, run]);

  const handleAccept = () => {
    if (!proposal || !run) return;
    onAccept(proposal, run);
  };

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && onReject()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/20 backdrop-blur-sm" />
        <Dialog.Content
          data-taxonomy="tool"
          className={cn(
            'fixed left-1/2 top-1/2 z-50 w-[min(520px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2',
            'rounded-md border border-border bg-surface-panel p-4 shadow-lg'
          )}
        >
          <div className="flex items-center justify-between gap-3">
            <Dialog.Title className="flex items-center gap-2 font-caption text-ink">
              <Sparkles size={14} strokeWidth={1.75} className="text-accent" />
              pin as skill
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
            Review the capability definition Claude proposed for this run.
          </Dialog.Description>

          <div className="mt-3 flex flex-col gap-3">
            {state === 'loading' ? (
              <div className="flex items-center gap-2 font-caption text-ink-dim">
                <span className="inline-block h-1 w-1 animate-pulse rounded-pill bg-accent" />
                claude is distilling the run…
              </div>
            ) : null}

            {state === 'error' ? (
              <div className="font-caption text-signal-error">{error}</div>
            ) : null}

            {state === 'ready' && proposal ? (
              <>
                <label className="flex flex-col gap-1">
                  <span className="font-caption text-ink-dim">name</span>
                  <input
                    type="text"
                    value={proposal.name}
                    onChange={(e) => setProposal({ ...proposal, name: e.target.value })}
                    className="w-full rounded-sm border border-border bg-surface-panel px-2 py-1.5 font-caption text-ink focus:border-accent focus:outline-none"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="font-caption text-ink-dim">trigger</span>
                  <textarea
                    value={proposal.trigger}
                    onChange={(e) => setProposal({ ...proposal, trigger: e.target.value })}
                    rows={2}
                    className="w-full rounded-sm border border-border bg-surface-panel px-2 py-1.5 font-caption text-ink focus:border-accent focus:outline-none"
                  />
                </label>
                {proposal.notes ? (
                  <div className="rounded-sm border border-border-soft bg-surface-panel-muted p-2 font-caption text-ink-dim">
                    {proposal.notes}
                  </div>
                ) : null}
              </>
            ) : null}
          </div>

          <div className="mt-4 flex items-center justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={onReject}>
              cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              disabled={state !== 'ready' || !proposal}
              onClick={handleAccept}
            >
              pin skill
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
