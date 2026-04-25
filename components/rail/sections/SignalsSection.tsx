'use client';

import { useState, type FormEvent } from 'react';
import { BellOff, Bell, X } from 'lucide-react';
import {
  addSignal,
  updateSignal,
  muteSignal,
  removeSignal,
  unmuteSignal,
  useSignals,
  summarizeSignals,
  isMuted,
  displaySignalValue,
  normalizeSignalValue,
  type SignalKind,
  type SignalRecord,
} from '@/lib/signals/store';
import {
  displaySignalSuggestion,
  suggestSignalsFromContext,
} from '@/lib/signals/suggestions';
import {
  useBrandContext,
  useCampaignContext,
  useOfferContext,
} from '@/lib/context/creator-store';
import { useReferences } from '@/lib/references/store';
import { cn } from '@/lib/utils/cn';

/**
 * Signals section body. Creators add / edit / mute / remove the keywords,
 * hashtags, and accounts they want the system to listen to. Grouped by kind
 * so each group has its own add-input and empty hint; restraint rule 6 keeps
 * the empty state to a single line per group.
 */

interface GroupSpec {
  kind: SignalKind;
  label: string;
  placeholder: string;
  hint: string;
}

const GROUPS: ReadonlyArray<GroupSpec> = [
  {
    kind: 'keyword',
    label: 'keywords',
    placeholder: 'topic term',
    hint: 'add a topic to track',
  },
  {
    kind: 'hashtag',
    label: 'hashtags',
    placeholder: '#hashtag',
    hint: 'add a platform tag to track',
  },
  {
    kind: 'account',
    label: 'accounts',
    placeholder: '@handle',
    hint: 'add a handle to watch',
  },
];

export function SignalsSection({ workspaceId }: { workspaceId?: string }) {
  const signals = useSignals(workspaceId);
  const brand = useBrandContext(workspaceId);
  const offer = useOfferContext(workspaceId);
  const campaign = useCampaignContext(workspaceId);
  const references = useReferences(workspaceId);
  const suggestions = suggestSignalsFromContext({
    brand,
    offer,
    campaign,
    references,
    existing: signals,
  });
  const grouped: Record<SignalKind, SignalRecord[]> = {
    keyword: [],
    hashtag: [],
    account: [],
  };
  for (const s of signals) grouped[s.kind].push(s);

  return (
    <div className="flex flex-col gap-4" data-testid="signals-section">
      {suggestions.length > 0 ? (
        <section aria-label="suggested signals" className="flex flex-col gap-1.5">
          <span className="font-caption text-ink-dim">suggested</span>
          <div className="flex flex-wrap gap-1">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion.id}
                type="button"
                onClick={() =>
                  addSignal(suggestion.kind, suggestion.value, workspaceId)
                }
                className="rounded-pill border border-border-soft bg-surface-panel-muted px-2 py-0.5 text-left font-caption text-xs text-ink transition-colors hover:border-accent hover:text-accent"
                title={suggestion.reason}
              >
                {displaySignalSuggestion(suggestion)}
              </button>
            ))}
          </div>
        </section>
      ) : null}
      {GROUPS.map((group) => (
        <SignalGroup
          key={group.kind}
          spec={group}
          records={grouped[group.kind]}
          workspaceId={workspaceId}
        />
      ))}
    </div>
  );
}

function SignalGroup({
  spec,
  records,
  workspaceId,
}: {
  spec: GroupSpec;
  records: SignalRecord[];
  workspaceId?: string;
}) {
  const [value, setValue] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!value.trim()) return;
    addSignal(spec.kind, value, workspaceId);
    setValue('');
  };

  return (
    <section
      aria-label={spec.label}
      data-signal-group={spec.kind}
      className="flex flex-col gap-1.5"
    >
      <span className="font-caption text-ink-dim">{spec.label}</span>
      <form onSubmit={submit} className="flex gap-1">
        <input
          type="text"
          aria-label={`add ${spec.kind}`}
          placeholder={spec.placeholder}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="flex-1 rounded-sm border border-border-soft bg-surface-panel px-2 py-1 font-caption text-xs text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
        />
        <button
          type="submit"
          disabled={!value.trim()}
          className="rounded-sm border border-border-soft bg-surface-panel px-2 py-1 font-caption text-xs text-ink transition-colors hover:bg-surface-panel-muted disabled:opacity-50"
        >
          add
        </button>
      </form>
      {records.length === 0 ? (
        <span className="font-caption text-xs text-ink-faint">{spec.hint}</span>
      ) : (
        <ul className="flex flex-col gap-1">
          {records.map((record) => (
            <SignalRow key={record.id} record={record} />
          ))}
        </ul>
      )}
    </section>
  );
}

function SignalRow({ record }: { record: SignalRecord }) {
  const muted = isMuted(record);
  const [draft, setDraft] = useState(displaySignalValue(record));
  const commit = () => {
    const normalized = normalizeSignalValue(record.kind, draft);
    if (!normalized) {
      setDraft(displaySignalValue(record));
      return;
    }
    if (normalized !== record.value) updateSignal(record.id, record.kind, normalized);
    setDraft(displaySignalValue({ kind: record.kind, value: normalized }));
  };
  return (
    <li
      data-signal-id={record.id}
      data-signal-muted={muted ? 'true' : undefined}
      className={cn(
        'flex items-center justify-between gap-2 rounded-sm border border-border-soft bg-surface-panel-muted px-2 py-1',
        muted && 'opacity-60'
      )}
    >
      <input
        aria-label={`edit signal ${record.value}`}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.currentTarget.blur();
          }
        }}
        className={cn(
          'min-w-0 flex-1 truncate rounded-xs border border-transparent bg-transparent px-1 py-0 font-caption text-xs text-ink outline-none focus:border-accent focus:bg-surface-panel',
          muted && 'line-through decoration-ink-faint'
        )}
      />
      <span className="sr-only">{displaySignalValue(record)}</span>
      <span className="flex items-center gap-0.5">
        <button
          type="button"
          aria-label={muted ? `unmute ${record.value}` : `mute ${record.value}`}
          onClick={() =>
            muted ? unmuteSignal(record.id) : muteSignal(record.id)
          }
          className="rounded-xs border border-transparent px-1 py-0.5 text-ink-dim transition-colors hover:border-border-soft hover:text-ink"
        >
          {muted ? <Bell size={12} /> : <BellOff size={12} />}
        </button>
        <button
          type="button"
          aria-label={`remove ${record.value}`}
          onClick={() => removeSignal(record.id)}
          className="rounded-xs border border-transparent px-1 py-0.5 text-ink-dim transition-colors hover:border-border-soft hover:text-ink"
        >
          <X size={12} />
        </button>
      </span>
    </li>
  );
}

export function signalsSectionSummary(
  records: ReadonlyArray<SignalRecord>,
  now?: number
): string {
  const { live, muted } = summarizeSignals(records, now);
  if (muted === 0) return `${live} live`;
  return `${live} live · ${muted} muted`;
}
