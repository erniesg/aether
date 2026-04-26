/**
 * Campaign run inspector — `/inspect/[campaignId]`.
 *
 * Server-rendered page that hits GET /api/campaigns/[id]/trace and lays
 * out the lap as a readable timeline: campaign header → per-variation
 * cards → per-step rows (tool name, latency, prompt, output). Built so
 * the user can click a Discord-embedded campaign id and see what the
 * agent actually did, without spelunking JSON.
 *
 * Read-only by design — provides full ledger visibility without needing
 * the AutoModePanel canvas wiring (B1) to be complete first.
 */

import Link from 'next/link';
import { Chip } from '@/components/ui/Chip';
import { Surface } from '@/components/ui/Surface';
import { ThemeToggle } from '@/components/ui/ThemeToggle';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface MaskSummary {
  matched: string[];
  prompted: string[];
  maskCount: number;
}

interface CapabilityRunRow {
  id: string;
  tool?: string;
  provider?: string;
  model?: string;
  status?: string;
  prompt?: string;
  startedAt?: number;
  finishedAt?: number;
  latencyMs?: number;
  error?: string;
}

interface AgentStepTrace {
  clientRunId: string;
  name: string;
  ok: boolean;
  ms?: number;
  errorMessage?: string;
  ledger: CapabilityRunRow | null;
}

interface VariationTrace {
  id: string;
  index: number;
  status: string;
  error?: string;
  heroImageUrl?: string;
  heroAssetId?: string;
  caption?: string;
  captionsByLocale?: Record<string, string>;
  hashtags?: string[];
  moodNote?: string;
  schedulePlatform?: string;
  scheduleWhenLocal?: string;
  textOverlayWarnings?: unknown;
  masksOneShot?: MaskSummary;
  masksVisionGuided?: MaskSummary;
  agentSteps: AgentStepTrace[];
  startedAt: number;
  finishedAt?: number;
}

interface TraceResponse {
  ok: boolean;
  error?: string;
  campaign?: {
    id: string;
    triggerKind?: string;
    triggerPayload?: string;
    variationCount?: number;
    notifyMode?: string;
    status?: string;
    startedAt?: number;
    finishedAt?: number;
  };
  variations?: VariationTrace[];
  scheduledPosts?: Array<{
    id: string;
    platform: string;
    scheduledAt: string;
    mediaUrls: string[];
    caption: string;
    status: string;
    provider: string;
  }>;
}

async function fetchTrace(
  campaignId: string,
  origin: string
): Promise<TraceResponse> {
  const res = await fetch(`${origin}/api/campaigns/${campaignId}/trace`, {
    cache: 'no-store',
  });
  if (!res.ok) {
    return {
      ok: false,
      error: `trace endpoint returned HTTP ${res.status}`,
    };
  }
  return (await res.json()) as TraceResponse;
}

function fmtMs(ms?: number): string {
  if (typeof ms !== 'number') return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function fmtTime(epoch?: number): string {
  if (typeof epoch !== 'number') return '—';
  return new Date(epoch).toLocaleString('en-SG', {
    timeZone: 'Asia/Singapore',
    hour12: false,
  });
}

function tryParsePrompt(prompt?: string): string {
  if (!prompt) return '';
  // Most ledger rows store the tool input as a JSON string. Pretty-print
  // when parseable, fall back to raw.
  try {
    const parsed = JSON.parse(prompt);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return prompt;
  }
}

export default async function InspectPage({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  const { campaignId } = await params;
  // Use the same host the request landed on. Next 15 server pages don't
  // expose origin directly here; fall back to env for dev.
  const origin =
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.VERCEL_URL ??
    'http://localhost:3002';
  const trace = await fetchTrace(
    campaignId,
    origin.startsWith('http') ? origin : `https://${origin}`
  );

  return (
    <main className="min-h-screen bg-surface-base text-ink">
      <header className="flex h-header items-center justify-between border-b border-border-soft bg-surface-panel px-6">
        <div className="flex items-center gap-3">
          <Link href="/" className="font-display text-lg tracking-tight">
            aether
          </Link>
          <Chip tone="neutral" size="sm">
            inspect
          </Chip>
        </div>
        <ThemeToggle />
      </header>

      <section className="mx-auto max-w-5xl px-6 py-10">
        <div className="mb-6">
          <p className="font-caption text-ink-dim">campaign</p>
          <h1 className="font-mono text-sm tracking-tight text-ink">
            {campaignId}
          </h1>
        </div>

        {!trace.ok && (
          <Surface className="border border-signal-error/30 bg-signal-error/5 p-4">
            <p className="font-caption text-signal-error">
              {trace.error ?? 'unknown error fetching trace'}
            </p>
          </Surface>
        )}

        {trace.ok && trace.campaign && (
          <Surface className="mb-6 p-5">
            <div className="grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-3">
              <Field label="trigger" value={trace.campaign.triggerKind ?? '—'} />
              <Field
                label="payload"
                value={trace.campaign.triggerPayload ?? '—'}
                mono
              />
              <Field label="status" value={trace.campaign.status ?? '—'} />
              <Field
                label="variations"
                value={String(trace.campaign.variationCount ?? '—')}
              />
              <Field label="notify" value={trace.campaign.notifyMode ?? '—'} />
              <Field
                label="started"
                value={fmtTime(trace.campaign.startedAt)}
                mono
              />
              <Field
                label="finished"
                value={fmtTime(trace.campaign.finishedAt)}
                mono
              />
              <Field
                label="duration"
                value={
                  trace.campaign.startedAt && trace.campaign.finishedAt
                    ? fmtMs(
                        trace.campaign.finishedAt - trace.campaign.startedAt
                      )
                    : '—'
                }
              />
            </div>
          </Surface>
        )}

        {trace.variations?.map((v) => (
          <Surface key={v.id} className="mb-6 p-5">
            <header className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="font-display text-xl tracking-tight">
                  v{v.index}
                </span>
                <Chip
                  tone={v.status === 'ready' ? 'ok' : 'error'}
                  size="sm"
                >
                  {v.status}
                </Chip>
                {v.error && (
                  <span className="font-caption text-xs text-signal-error">
                    {v.error}
                  </span>
                )}
              </div>
              <span className="font-mono text-xs text-ink-dim">
                {fmtMs(
                  v.finishedAt && v.startedAt
                    ? v.finishedAt - v.startedAt
                    : undefined
                )}
              </span>
            </header>

            {v.heroImageUrl && (
              <div className="mb-4 overflow-hidden rounded-lg border border-border-soft">
                {/* Plain <img> is fine here — Convex storage URLs aren't on
                    Next/image's allowlist, and we want to load instantly. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={v.heroImageUrl}
                  alt={`hero v${v.index}`}
                  className="block max-h-[420px] w-full object-cover"
                />
              </div>
            )}

            {v.caption && (
              <div className="mb-4">
                <p className="font-caption text-ink-dim">caption</p>
                <p className="text-sm text-ink">{v.caption}</p>
              </div>
            )}

            {v.captionsByLocale && (
              <div className="mb-4">
                <p className="font-caption text-ink-dim">captionsByLocale</p>
                <ul className="mt-1 space-y-1">
                  {Object.entries(v.captionsByLocale).map(([locale, text]) => (
                    <li
                      key={locale}
                      className="grid grid-cols-[80px_1fr] gap-3 text-sm"
                    >
                      <span className="font-mono text-xs text-ink-dim">
                        {locale}
                      </span>
                      <span className="text-ink">{text}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mb-3 grid grid-cols-2 gap-x-8 gap-y-2 sm:grid-cols-3">
              <Field label="moodNote" value={v.moodNote ?? '—'} />
              <Field label="platform" value={v.schedulePlatform ?? '—'} />
              <Field
                label="scheduleWhenLocal"
                value={v.scheduleWhenLocal ?? '—'}
                mono
              />
              <Field
                label="masksOneShot"
                value={
                  v.masksOneShot
                    ? `${v.masksOneShot.maskCount} (${v.masksOneShot.matched.join(', ') || 'none'})`
                    : '—'
                }
              />
              <Field
                label="masksVisionGuided"
                value={
                  v.masksVisionGuided
                    ? `${v.masksVisionGuided.maskCount} (${v.masksVisionGuided.matched.join(', ') || 'none'})`
                    : '—'
                }
              />
              <Field
                label="hashtags"
                value={v.hashtags?.join(' ') ?? '—'}
                mono
              />
            </div>

            <details className="mt-2 group">
              <summary className="cursor-pointer font-caption text-ink-dim hover:text-ink">
                agent steps ({v.agentSteps.length})
              </summary>
              <ol className="mt-3 space-y-3">
                {v.agentSteps.map((step, idx) => (
                  <li
                    key={step.clientRunId}
                    className="rounded-md border border-border-soft p-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-ink-dim">
                          #{idx + 1}
                        </span>
                        <span className="font-display text-sm">{step.name}</span>
                        <Chip
                          tone={step.ok ? 'ok' : 'error'}
                          size="sm"
                        >
                          {step.ok ? 'ok' : 'failed'}
                        </Chip>
                        {step.ledger?.provider && (
                          <Chip tone="neutral" size="sm">
                            {step.ledger.provider}
                            {step.ledger.model
                              ? ` · ${step.ledger.model}`
                              : ''}
                          </Chip>
                        )}
                      </div>
                      <span className="font-mono text-xs text-ink-dim">
                        {fmtMs(step.ms ?? step.ledger?.latencyMs)}
                      </span>
                    </div>

                    {step.errorMessage && (
                      <p className="mt-2 font-mono text-xs text-signal-error">
                        {step.errorMessage}
                      </p>
                    )}

                    {step.ledger?.prompt && (
                      <details className="mt-3">
                        <summary className="cursor-pointer font-caption text-xs text-ink-dim hover:text-ink">
                          prompt / input
                        </summary>
                        <pre className="mt-2 max-h-[320px] overflow-auto rounded bg-surface-panel p-3 font-mono text-[11px] leading-snug text-ink">
                          {tryParsePrompt(step.ledger.prompt)}
                        </pre>
                      </details>
                    )}

                    {(step.ledger?.startedAt || step.ledger?.finishedAt) && (
                      <p className="mt-2 font-mono text-[10px] text-ink-dim">
                        {fmtTime(step.ledger.startedAt)} →{' '}
                        {fmtTime(step.ledger.finishedAt)}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            </details>
          </Surface>
        ))}

        {trace.scheduledPosts && trace.scheduledPosts.length > 0 && (
          <Surface className="mb-6 p-5">
            <header className="mb-3 font-display text-base">
              scheduled posts ({trace.scheduledPosts.length})
            </header>
            <ul className="space-y-2">
              {trace.scheduledPosts.map((p) => (
                <li
                  key={p.id}
                  className="grid grid-cols-[100px_120px_1fr_100px] gap-3 border-b border-border-soft py-2 text-sm last:border-b-0"
                >
                  <span className="font-display">{p.platform}</span>
                  <span className="font-mono text-xs text-ink-dim">
                    {p.scheduledAt}
                  </span>
                  <span className="text-ink">{p.caption.slice(0, 80)}</span>
                  <Chip tone="neutral" size="sm">
                    {p.status} · {p.provider}
                  </Chip>
                </li>
              ))}
            </ul>
          </Surface>
        )}

        <p className="mt-8 font-caption text-xs text-ink-dim">
          raw trace JSON:{' '}
          <a
            href={`/api/campaigns/${campaignId}/trace`}
            className="font-mono underline"
          >
            /api/campaigns/{campaignId}/trace
          </a>
        </p>
      </section>
    </main>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-caption text-xs text-ink-dim">{label}</span>
      <span className={mono ? 'font-mono text-xs' : 'text-sm'}>{value}</span>
    </div>
  );
}
