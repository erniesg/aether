'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Surface } from '@/components/ui/Surface';
import { ThemeToggle } from '@/components/ui/ThemeToggle';

export default function EventsPage() {
  const router = useRouter();
  const [name, setName] = useState('AI Engineer Summit Singapore');
  const [contextHint, setContextHint] = useState(
    'AI engineering event in Singapore; recap X and LinkedIn conversations'
  );
  const [daysBefore, setDaysBefore] = useState(1);
  const [daysAfter, setDaysAfter] = useState(3);
  const [refreshIntervalHours, setRefreshIntervalHours] = useState(6);
  const [maxItemsPerPlatform, setMaxItemsPerPlatform] = useState(25);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          contextHint,
          daysBefore,
          daysAfter,
          refreshIntervalHours,
          maxItemsPerPlatform,
          monthlyCreditBudget: 50,
          liveMode: 'mock',
        }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        event?: { eventId?: string };
        error?: string;
      };
      if (!json.ok || !json.event?.eventId) {
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
      router.push(`/events/${json.event.eventId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-surface-base text-ink">
      <header className="flex h-header items-center justify-between border-b border-border-soft bg-surface-panel px-6">
        <div className="flex items-center gap-3">
          <Link href="/" className="font-display text-lg tracking-tight">
            aether
          </Link>
          <Chip tone="info" size="sm">
            event recap
          </Chip>
        </div>
        <ThemeToggle />
      </header>

      <section className="mx-auto grid max-w-5xl gap-6 px-6 py-10 lg:grid-cols-[1fr_320px]">
        <div>
          <h1 className="font-display text-3xl tracking-tight">event recap lens</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-ink-muted">
            Name an event, set the scrape window, and build a cited corpus from X
            and LinkedIn. The first pass runs in mock mode so the surface can be
            reviewed before TinyFish credits are used.
          </p>
        </div>

        <Surface className="p-5" border="soft" taxonomy="input">
          <form onSubmit={onSubmit} className="space-y-4">
            <label className="block space-y-1.5">
              <span className="font-caption text-xs text-ink-dim">event</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-md border border-border-soft bg-surface-base px-3 py-2 font-mono text-sm text-ink focus:border-accent focus:outline-none"
                required
              />
            </label>

            <label className="block space-y-1.5">
              <span className="font-caption text-xs text-ink-dim">context</span>
              <textarea
                value={contextHint}
                onChange={(e) => setContextHint(e.target.value)}
                rows={3}
                className="w-full resize-y rounded-md border border-border-soft bg-surface-base px-3 py-2 font-mono text-sm text-ink focus:border-accent focus:outline-none"
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <NumberField label="days before" value={daysBefore} onChange={setDaysBefore} />
              <NumberField label="days after" value={daysAfter} onChange={setDaysAfter} />
              <NumberField
                label="refresh hours"
                value={refreshIntervalHours}
                onChange={setRefreshIntervalHours}
              />
              <NumberField
                label="per platform"
                value={maxItemsPerPlatform}
                onChange={setMaxItemsPerPlatform}
              />
            </div>

            {error && <p className="font-caption text-xs text-signal-error">{error}</p>}

            <Button
              type="submit"
              variant="primary"
              size="md"
              trailing={<ArrowRight size={15} strokeWidth={1.75} />}
              disabled={submitting || !name.trim()}
              className="w-full"
            >
              {submitting ? 'creating...' : 'create recap'}
            </Button>
          </form>
        </Surface>
      </section>
    </main>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="font-caption text-xs text-ink-dim">{label}</span>
      <input
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full rounded-md border border-border-soft bg-surface-base px-3 py-2 font-mono text-sm text-ink focus:border-accent focus:outline-none"
      />
    </label>
  );
}
