'use client';

import { useState, type FormEvent } from 'react';
import { BellOff, Bell, X } from 'lucide-react';
import {
  addSignal,
  muteSignal,
  removeSignal,
  unmuteSignal,
  useSignals,
  summarizeSignals,
  isMuted,
  displaySignalValue,
  type SignalKind,
  type SignalRecord,
} from '@/lib/signals/store';
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

export function SignalsSection() {
  const signals = useSignals();
  const grouped: Record<SignalKind, SignalRecord[]> = {
    keyword: [],
    hashtag: [],
    account: [],
  };
  for (const s of signals) grouped[s.kind].push(s);

  return (
    <div className="flex flex-col gap-4" data-testid="signals-section">
      {GROUPS.map((group) => (
        <SignalGroup
          key={group.kind}
          spec={group}
          records={grouped[group.kind]}
        />
      ))}
    </div>
  );
}

function SignalGroup({
  spec,
  records,
}: {
  spec: GroupSpec;
  records: SignalRecord[];
}) {
  const [value, setValue] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!value.trim()) return;
    addSignal(spec.kind, value);
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
  return (
    <li
      data-signal-id={record.id}
      data-signal-muted={muted ? 'true' : undefined}
      className={cn(
        'flex items-center justify-between gap-2 rounded-sm border border-border-soft bg-surface-panel-muted px-2 py-1',
        muted && 'opacity-60'
      )}
    >
      <span
        className={cn(
          'truncate font-caption text-xs text-ink',
          muted && 'line-through decoration-ink-faint'
        )}
      >
        {displaySignalValue(record)}
      </span>
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
