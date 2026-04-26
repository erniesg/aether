/**
 * Trigger UI for Auto Mode laps — `/auto-mode`.
 *
 * Minimal form that POSTs to /api/auto-mode/run, then redirects to
 * /inspect/<campaignId> once the response lands. Built for the hackathon
 * demo: paste a URL or product description, watch the lap run, click into
 * the trace.
 *
 * The lap takes 6-8 minutes (per-format renders + vision-describe + atlas
 * compose), so the form shows a streaming status line while the request
 * is in flight. Aborting cancels the fetch but the lap continues server-side
 * — the campaign id from the eventual response (or the most-recent
 * /api/campaigns list) lets the user catch up via /inspect.
 */

'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Surface } from '@/components/ui/Surface';
import { ThemeToggle } from '@/components/ui/ThemeToggle';

type TriggerKind = 'url' | 'text';
type NotifyMode = 'notify' | 'review' | 'auto-post';

interface RunResponse {
  ok: boolean;
  campaignId?: string;
  status?: string;
  error?: string;
  scheduledPostIds?: string[];
  variations?: Array<{ index: number; status: string; atlasUrl?: string }>;
}

export default function AutoModePage() {
  const router = useRouter();
  const [triggerKind, setTriggerKind] = useState<TriggerKind>('url');
  const [payload, setPayload] = useState('https://www.eightsleep.com/');
  const [variationCount, setVariationCount] = useState(1);
  const [notifyMode, setNotifyMode] = useState<NotifyMode>('notify');
  const [forcePostNow, setForcePostNow] = useState(false);
  const [workspaceId, setWorkspaceId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [response, setResponse] = useState<RunResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setResponse(null);
    setElapsed(0);
    const t0 = Date.now();
    const tick = setInterval(() => setElapsed(Date.now() - t0), 250);

    try {
      const res = await fetch('/api/auto-mode/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trigger: { kind: triggerKind, payload },
          variationCount,
          notifyMode,
          forcePostNow,
          workspaceId: workspaceId.trim() || undefined,
        }),
      });
      const json = (await res.json()) as RunResponse;
      clearInterval(tick);
      setSubmitting(false);
      setResponse(json);
      if (json.ok && json.campaignId) {
        router.push(`/inspect/${json.campaignId}`);
      } else if (!json.ok) {
        setError(json.error ?? `HTTP ${res.status}`);
      }
    } catch (err) {
      clearInterval(tick);
      setSubmitting(false);
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const elapsedStr = `${(elapsed / 1000).toFixed(1)}s`;

  return (
    <main className="min-h-screen bg-surface-base text-ink">
      <header className="flex h-header items-center justify-between border-b border-border-soft bg-surface-panel px-6">
        <div className="flex items-center gap-3">
          <Link href="/" className="font-display text-lg tracking-tight">
            aether
          </Link>
          <Chip tone="neutral" size="sm">
            auto-mode
          </Chip>
        </div>
        <ThemeToggle />
      </header>

      <section className="mx-auto max-w-3xl px-6 py-10">
        <div className="mb-6">
          <h1 className="font-display text-2xl tracking-tight">trigger a lap</h1>
          <p className="mt-2 font-caption text-ink-dim">
            One trigger fans out into N variations. Each variation produces a
            1024² hero, native renders for 4:5 / 9:16 / 16:9 (with
            <code className="mx-1 font-mono text-xs">AUTO_MODE_NATIVE_PER_FORMAT=1</code>),
            and a 4×4 atlas across 4 SG locales. Lap takes 6–8 minutes.
          </p>
        </div>

        <Surface className="p-5">
          <form onSubmit={onSubmit} className="space-y-5">
            <div className="space-y-2">
              <label className="font-caption text-xs text-ink-dim">trigger kind</label>
              <div className="flex gap-2">
                {(['url', 'text'] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setTriggerKind(k)}
                    className={`rounded-md border px-3 py-1.5 font-mono text-sm transition ${
                      triggerKind === k
                        ? 'border-accent bg-accent/10 text-ink'
                        : 'border-border-soft text-ink-dim hover:border-ink-dim'
                    }`}
                  >
                    {k}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="font-caption text-xs text-ink-dim">
                {triggerKind === 'url' ? 'url' : 'text prompt'}
              </label>
              {triggerKind === 'url' ? (
                <input
                  type="url"
                  required
                  value={payload}
                  onChange={(e) => setPayload(e.target.value)}
                  placeholder="https://www.eightsleep.com/"
                  className="w-full rounded-md border border-border-soft bg-surface-base px-3 py-2 font-mono text-sm text-ink focus:border-accent focus:outline-none"
                />
              ) : (
                <textarea
                  required
                  value={payload}
                  onChange={(e) => setPayload(e.target.value)}
                  rows={3}
                  placeholder="Eight Sleep Pod 4 Ultra cooling mattress cover"
                  className="w-full resize-y rounded-md border border-border-soft bg-surface-base px-3 py-2 font-mono text-sm text-ink focus:border-accent focus:outline-none"
                />
              )}
            </div>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <label className="font-caption text-xs text-ink-dim">
                  variations
                </label>
                <select
                  value={variationCount}
                  onChange={(e) => setVariationCount(Number(e.target.value))}
                  className="w-full rounded-md border border-border-soft bg-surface-base px-3 py-2 font-mono text-sm text-ink focus:border-accent focus:outline-none"
                >
                  {[1, 2, 3, 4].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="font-caption text-xs text-ink-dim">
                  notify mode
                </label>
                <select
                  value={notifyMode}
                  onChange={(e) => setNotifyMode(e.target.value as NotifyMode)}
                  className="w-full rounded-md border border-border-soft bg-surface-base px-3 py-2 font-mono text-sm text-ink focus:border-accent focus:outline-none"
                >
                  <option value="notify">notify</option>
                  <option value="review">review</option>
                  <option value="auto-post">auto-post</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="font-caption text-xs text-ink-dim">
                  workspace id
                </label>
                <input
                  type="text"
                  value={workspaceId}
                  onChange={(e) => setWorkspaceId(e.target.value)}
                  placeholder="(required for auto-post)"
                  className="w-full rounded-md border border-border-soft bg-surface-base px-3 py-2 font-mono text-xs text-ink focus:border-accent focus:outline-none"
                />
              </div>
            </div>

            {notifyMode === 'auto-post' && (
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={forcePostNow}
                  onChange={(e) => setForcePostNow(e.target.checked)}
                  className="h-4 w-4 cursor-pointer accent-accent"
                />
                <span className="font-caption text-sm text-ink">
                  force post now
                  <span className="ml-1 text-ink-dim">
                    (override agent&apos;s scheduled time — required for X
                    direct since v2 rejects future schedules)
                  </span>
                </span>
              </label>
            )}

            <div className="flex items-center gap-3 pt-2">
              <Button
                type="submit"
                variant="primary"
                size="md"
                disabled={submitting || !payload.trim()}
              >
                {submitting ? `running… ${elapsedStr}` : 'fire lap'}
              </Button>
              {submitting && (
                <span className="font-caption text-xs text-ink-dim">
                  this takes 6–8 minutes — keep this tab open
                </span>
              )}
            </div>
          </form>
        </Surface>

        {error && (
          <Surface className="mt-6 border border-signal-error/30 bg-signal-error/5 p-4">
            <p className="font-caption text-signal-error">{error}</p>
          </Surface>
        )}

        {response?.ok && response.campaignId && (
          <Surface className="mt-6 p-5">
            <p className="font-caption text-ink-dim">lap completed</p>
            <p className="mt-1 font-mono text-sm text-ink">
              campaign id:{' '}
              <Link
                href={`/inspect/${response.campaignId}`}
                className="underline"
              >
                {response.campaignId}
              </Link>
            </p>
            <p className="mt-2 font-caption text-xs text-ink-dim">
              status: {response.status} · variations:{' '}
              {response.variations?.length ?? 0} · scheduled:{' '}
              {response.scheduledPostIds?.length ?? 0}
            </p>
          </Surface>
        )}

        <div className="mt-10 space-y-2 border-t border-border-soft pt-6 font-caption text-xs text-ink-dim">
          <p>
            Trigger via curl too:{' '}
            <code className="font-mono">
              POST /api/auto-mode/run
            </code>
          </p>
          <p>
            Inspect any past run:{' '}
            <code className="font-mono">/inspect/&lt;campaignId&gt;</code>
          </p>
          <p>
            Discord lap pings include the campaign id in the embed footer —
            click that to land on inspect directly.
          </p>
        </div>
      </section>
    </main>
  );
}
