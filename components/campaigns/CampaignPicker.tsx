'use client';

import { useMemo, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import {
  Album,
  Flag,
  Leaf,
  Megaphone,
  PackageOpen,
  Rocket,
  Sparkles,
  X,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils/cn';
import {
  DEMO_CREATOR_CONTEXT,
  type CreatorContextModel,
} from '@/lib/context/model';
import { CAMPAIGN_TEMPLATES } from '@/lib/campaigns/templates';
import type {
  CampaignPick,
  CampaignProposal,
  CampaignTemplate,
} from '@/lib/campaigns/types';

/**
 * Campaign-picker dialog. Two-column layout:
 *   • left  (input)  — curated template grid, icon + 3-word label per card
 *   • right (input)  — "let AI propose" with a generate button calling
 *                      /api/campaigns/propose; the proposal renders inline
 *                      and becomes its own pickable card
 *
 * Picking either side resolves into a `CampaignPick` the parent persists.
 * Layout stays restraint-first: no long descriptions on the cards — the
 * strategic intent surfaces only on hover/selection, matching CLAUDE.md
 * hard rule 6 (restraint over labels).
 */

const ICON_BY_NAME: Record<string, LucideIcon> = {
  Rocket,
  PackageOpen,
  Leaf,
  Megaphone,
  Sparkles,
  Album,
  Flag,
};

export interface CampaignPickerProps {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  onPick: (pick: Omit<CampaignPick, 'pickedAt'>) => void;
  /** Override the propose call (tests stub this). */
  propose?: (inputs: ProposeInputs) => Promise<CampaignProposal>;
  /** Creator context pushed into the propose call. */
  context?: CreatorContextModel;
}

interface ProposeInputs {
  offerSnapshot?: CreatorContextModel['offer'];
  signals?: CreatorContextModel['signals'];
  bypassAgent?: boolean;
}

type ProposeState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; proposal: CampaignProposal };

async function defaultPropose(inputs: ProposeInputs): Promise<CampaignProposal> {
  const res = await fetch('/api/campaigns/propose', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(inputs),
  });
  const json = (await res.json()) as {
    ok: boolean;
    proposal?: CampaignProposal;
    error?: string;
  };
  if (!res.ok || !json.ok || !json.proposal) {
    throw new Error(json.error ?? `propose failed: ${res.status}`);
  }
  return json.proposal;
}

function pickFromTemplate(template: CampaignTemplate): Omit<CampaignPick, 'pickedAt'> {
  return {
    template: template.id,
    intent: template.purpose,
    formats: [...template.defaultFormats],
    tone: [...template.suggestedTone],
    briefBody: template.starterBrief,
  };
}

function pickFromProposal(proposal: CampaignProposal): Omit<CampaignPick, 'pickedAt'> {
  return {
    template: 'ai',
    intent: proposal.intent,
    formats: [...proposal.formats],
    tone: [...proposal.tone],
    briefBody: proposal.briefBody,
  };
}

export function CampaignPicker({
  open,
  onOpenChange,
  onPick,
  propose = defaultPropose,
  context = DEMO_CREATOR_CONTEXT,
}: CampaignPickerProps) {
  const [proposeState, setProposeState] = useState<ProposeState>({ kind: 'idle' });

  const bypassAgent = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).get('bypass') === '1';
  }, []);

  const handleProposeClick = async () => {
    setProposeState({ kind: 'loading' });
    try {
      const proposal = await propose({
        offerSnapshot: context.offer,
        signals: context.signals,
        bypassAgent,
      });
      setProposeState({ kind: 'ready', proposal });
    } catch (err) {
      setProposeState({
        kind: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const handleTemplateClick = (template: CampaignTemplate) => {
    onPick(pickFromTemplate(template));
  };

  const handleProposalAccept = () => {
    if (proposeState.kind !== 'ready') return;
    onPick(pickFromProposal(proposeState.proposal));
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/20 backdrop-blur-sm" />
        <Dialog.Content
          data-taxonomy="input"
          data-testid="campaign-picker"
          className={cn(
            'fixed left-1/2 top-1/2 z-50 w-[min(760px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2',
            'rounded-md border border-border bg-surface-panel p-4 shadow-lg'
          )}
        >
          <div className="flex items-center justify-between gap-3">
            <Dialog.Title className="flex items-center gap-2 font-caption text-ink">
              <Flag size={14} strokeWidth={1.75} className="text-accent" />
              pick a campaign
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
            Choose a campaign shape: pick a curated template or ask Claude to propose one
            from your brand and offer context.
          </Dialog.Description>

          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            <section
              aria-label="templates"
              data-testid="campaign-picker-templates"
              className="flex flex-col gap-2"
            >
              <header className="font-caption text-ink-dim">templates</header>
              <ul className="grid grid-cols-2 gap-2">
                {CAMPAIGN_TEMPLATES.map((template) => {
                  const Icon = ICON_BY_NAME[template.iconName] ?? Flag;
                  return (
                    <li key={template.id}>
                      <button
                        type="button"
                        data-testid={`campaign-template-${template.id}`}
                        title={template.purpose}
                        onClick={() => handleTemplateClick(template)}
                        className={cn(
                          'group flex w-full flex-col items-start gap-2 rounded-sm border border-border-soft',
                          'bg-surface-panel-muted p-3 text-left transition-colors duration-fast ease-quick',
                          'hover:border-accent hover:bg-surface-panel focus:border-accent focus:outline-none'
                        )}
                      >
                        <Icon
                          size={18}
                          strokeWidth={1.5}
                          className="text-ink-dim group-hover:text-accent"
                        />
                        <span className="font-caption text-sm text-ink">
                          {template.label}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>

            <section
              aria-label="ai propose"
              data-testid="campaign-picker-propose"
              className="flex flex-col gap-2"
            >
              <header className="font-caption text-ink-dim">let ai propose</header>
              <div className="flex flex-1 flex-col gap-2 rounded-sm border border-dashed border-border-soft bg-surface-panel-muted p-3">
                {proposeState.kind === 'idle' ? (
                  <>
                    <p className="font-caption text-xs text-ink-dim">
                      reads brand + offer + signals · returns a shape you can tweak
                    </p>
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      onClick={handleProposeClick}
                      data-testid="campaign-propose-generate"
                      icon={<Sparkles size={14} strokeWidth={1.75} />}
                      className="self-start"
                    >
                      generate
                    </Button>
                  </>
                ) : null}

                {proposeState.kind === 'loading' ? (
                  <div className="flex items-center gap-2 font-caption text-ink-dim">
                    <span className="inline-block h-1 w-1 animate-pulse rounded-pill bg-accent" />
                    claude is composing a shape…
                  </div>
                ) : null}

                {proposeState.kind === 'error' ? (
                  <>
                    <p className="font-caption text-xs text-signal-error">
                      {proposeState.message}
                    </p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleProposeClick}
                      className="self-start"
                    >
                      retry
                    </Button>
                  </>
                ) : null}

                {proposeState.kind === 'ready' ? (
                  <div
                    data-testid="campaign-propose-result"
                    className="flex flex-col gap-2"
                  >
                    <span className="font-display text-sm text-ink">
                      {proposeState.proposal.name}
                    </span>
                    <span className="font-caption text-xs text-ink-dim">
                      {proposeState.proposal.intent}
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {proposeState.proposal.formats.map((f) => (
                        <span
                          key={f}
                          className="rounded-pill border border-border-soft bg-surface-panel px-2 py-0.5 font-mono text-2xs uppercase tracking-wide text-ink-dim"
                        >
                          {f}
                        </span>
                      ))}
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <Button
                        type="button"
                        variant="primary"
                        size="sm"
                        onClick={handleProposalAccept}
                        data-testid="campaign-propose-accept"
                      >
                        use this
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={handleProposeClick}
                      >
                        regenerate
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            </section>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
