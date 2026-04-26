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

// ─── Types ────────────────────────────────────────────────────────────────────

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

interface TextOverlay {
  zone: {
    purpose: string;
    bbox?: { x: number; y: number; w: number; h: number };
  };
  content: Record<string, string>;
  scope?: 'global' | 'local';
}

interface LocaleInsight {
  locale: 'en-SG' | 'zh-Hans-SG' | 'ms-SG' | 'ta-SG';
  insight: string;
}

interface ResearchSource {
  url: string;
  snippet: string;
  retrievedAt: string;
}

interface ResearchBundle {
  summary: string;
  competitors: string[];
  recentCampaigns: string[];
  localeInsights: LocaleInsight[];
  sources: ResearchSource[];
  latencyMs: number;
  usedManagedAgentsApi: boolean;
  sessionId?: string;
}

interface SignoffVariationPlan {
  variationIndex: number;
  decision: 'auto-post' | 'hold-for-review' | 'reject';
  rationale: string;
  suggestedSchedule?: { platform: string; whenLocal: string };
}

interface SchedulePlan {
  sessionId?: string;
  latencyMs: number;
  variations: SignoffVariationPlan[];
  overallRecommendation: string;
  usedManagedAgentsApi: boolean;
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
  textOverlays?: TextOverlay[];
  textOverlayWarnings?: unknown;
  masksOneShot?: MaskSummary;
  masksVisionGuided?: MaskSummary;
  atlasUrl?: string;
  nativePerFormatRendered?: string[];
  nativePerFormatUrls?: Partial<Record<'1x1' | '4x5' | '9x16' | '16x9', string>>;
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
    researchBundle?: ResearchBundle;
    schedulePlan?: SchedulePlan;
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
  events?: Array<{
    id: string;
    ts: number;
    variationIndex?: number;
    level: 'debug' | 'info' | 'warn' | 'error';
    tag: string;
    message: string;
    data?: unknown;
  }>;
}

// ─── Data fetching ────────────────────────────────────────────────────────────

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

// ─── Formatters ───────────────────────────────────────────────────────────────

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
  try {
    const parsed = JSON.parse(prompt);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return prompt;
  }
}

// ─── Decision color ───────────────────────────────────────────────────────────

function decisionTone(
  d: SignoffVariationPlan['decision']
): 'ok' | 'warn' | 'error' {
  if (d === 'auto-post') return 'ok';
  if (d === 'hold-for-review') return 'warn';
  return 'error';
}

// ─── Sub-components ───────────────────────────────────────────────────────────

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

function CollapsibleSection({
  summary,
  children,
}: {
  summary: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <details className="mt-3">
      <summary className="cursor-pointer font-caption text-ink-dim hover:text-ink">
        {summary}
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}

interface LapEvent {
  id: string;
  ts: number;
  variationIndex?: number;
  level: 'debug' | 'info' | 'warn' | 'error';
  tag: string;
  message: string;
  data?: unknown;
}

function LapEventTimeline({ events }: { events: LapEvent[] }) {
  const sorted = [...events].sort((a, b) => a.ts - b.ts);
  const firstTs = sorted[0]?.ts ?? 0;
  const errorCount = sorted.filter((e) => e.level === 'error').length;
  const warnCount = sorted.filter((e) => e.level === 'warn').length;

  const levelTone: Record<LapEvent['level'], 'neutral' | 'info' | 'warn' | 'error'> = {
    debug: 'neutral',
    info: 'info',
    warn: 'warn',
    error: 'error',
  };

  return (
    <Surface className="mb-6 p-5" data-testid="lap-event-timeline">
      <header className="mb-3 flex items-center justify-between">
        <span className="font-display text-base">lap log</span>
        <div className="flex items-center gap-1.5">
          <Chip tone="neutral" size="sm">
            {sorted.length} events
          </Chip>
          {warnCount > 0 ? (
            <Chip tone="warn" size="sm">
              {warnCount} warn
            </Chip>
          ) : null}
          {errorCount > 0 ? (
            <Chip tone="error" size="sm">
              {errorCount} err
            </Chip>
          ) : null}
        </div>
      </header>
      <div className="flex flex-col gap-1 font-mono text-xs">
        {sorted.map((e) => {
          const offsetMs = e.ts - firstTs;
          const offsetStr =
            offsetMs < 1000
              ? `${offsetMs}ms`
              : offsetMs < 60_000
                ? `${(offsetMs / 1000).toFixed(1)}s`
                : `${Math.round(offsetMs / 60_000)}m${Math.round((offsetMs % 60_000) / 1000)}s`;
          return (
            <div
              key={e.id}
              data-event-level={e.level}
              data-event-tag={e.tag}
              className="grid grid-cols-[60px_36px_180px_1fr] items-start gap-2"
            >
              <span className="text-ink-faint tabular-nums">+{offsetStr}</span>
              <Chip tone={levelTone[e.level]} size="sm">
                {e.level}
              </Chip>
              <span className="text-ink-dim truncate">
                {e.tag}
                {e.variationIndex != null ? `@v${e.variationIndex}` : ''}
              </span>
              <span className="text-ink truncate">{e.message}</span>
            </div>
          );
        })}
      </div>
    </Surface>
  );
}

function ResearchSignals({ bundle }: { bundle: ResearchBundle }) {
  const firstFive = bundle.sources.slice(0, 5);
  return (
    <Surface className="mb-6 p-5" data-testid="research-signals">
      <header className="mb-3 font-display text-base">research signals</header>
      <p className="mb-3 text-sm text-ink">{bundle.summary}</p>

      {bundle.competitors.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1">
          {bundle.competitors.map((c) => (
            <Chip key={c} tone="info" size="sm">
              {c}
            </Chip>
          ))}
        </div>
      )}

      {bundle.localeInsights.length > 0 && (
        <ul className="mb-3 space-y-1">
          {bundle.localeInsights.map((li) => (
            <li key={li.locale} className="grid grid-cols-[80px_1fr] gap-2 text-sm">
              <Chip tone="secondary" size="sm">
                {li.locale}
              </Chip>
              <span className="text-ink-dim">{li.insight}</span>
            </li>
          ))}
        </ul>
      )}

      {firstFive.length > 0 && (
        <div className="mt-2 space-y-1">
          {firstFive.map((src) => (
            <a
              key={src.url}
              href={src.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block font-mono text-xs text-ink-dim underline truncate hover:text-ink"
            >
              {src.url}
            </a>
          ))}
        </div>
      )}
    </Surface>
  );
}

function SignoffPlan({ plan }: { plan: SchedulePlan }) {
  return (
    <Surface className="mb-6 p-5" data-testid="signoff-plan">
      <header className="mb-3 font-display text-base">signoff plan</header>
      <p className="mb-3 text-sm text-ink">{plan.overallRecommendation}</p>
      <ul className="space-y-2">
        {plan.variations.map((v) => (
          <li
            key={v.variationIndex}
            className="flex items-start gap-3 border-b border-border-soft py-2 last:border-b-0"
          >
            <span className="font-mono text-xs text-ink-dim mt-0.5">
              v{v.variationIndex}
            </span>
            <Chip
              tone={decisionTone(v.decision)}
              size="sm"
              data-testid={`signoff-decision-${v.variationIndex}`}
            >
              {v.decision}
            </Chip>
            <span className="text-sm text-ink-dim flex-1">{v.rationale}</span>
          </li>
        ))}
      </ul>
    </Surface>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function InspectPage({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  const { campaignId } = await params;
  const origin =
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.VERCEL_URL ??
    `http://localhost:${process.env.PORT ?? '3030'}`;
  const trace = await fetchTrace(
    campaignId,
    origin.startsWith('http') ? origin : `https://${origin}`
  );

  // Build a variation index → scheduled posts map for cross-linking
  const postsByVariationIndex = new Map<number, typeof trace.scheduledPosts>();
  trace.scheduledPosts?.forEach((p, i) => {
    const existing = postsByVariationIndex.get(i) ?? [];
    postsByVariationIndex.set(i, [...existing, p]);
  });

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
          <>
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

            {/* Research signals — only when persisted */}
            {trace.campaign.researchBundle && (
              <ResearchSignals bundle={trace.campaign.researchBundle} />
            )}

            {/* Signoff plan — only when persisted */}
            {trace.campaign.schedulePlan && (
              <SignoffPlan plan={trace.campaign.schedulePlan} />
            )}

            {/* Lap event timeline — full structured log */}
            {trace.events && trace.events.length > 0 && (
              <LapEventTimeline events={trace.events} />
            )}
          </>
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

            {/* Dedup chip — surfaces when both mask types are present */}
            {v.masksOneShot && v.masksVisionGuided && (
              <div className="mb-3 flex gap-1.5">
                <Chip tone="neutral" size="sm">
                  one-shot {v.masksOneShot.matched.length} matched
                </Chip>
                <Chip tone="neutral" size="sm">
                  vision-guided {v.masksVisionGuided.matched.length} matched
                </Chip>
              </div>
            )}

            {/* Atlas ─────────────────────────────────────────────────── */}
            <CollapsibleSection summary="atlas">
              {v.atlasUrl ? (
                <div
                  className="overflow-hidden rounded-lg border border-border-soft"
                  data-testid={`atlas-thumbnail-${v.index}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={v.atlasUrl}
                    alt={`atlas v${v.index}`}
                    className="block w-64 object-contain"
                    style={{ maxWidth: 256 }}
                  />
                </div>
              ) : (
                <p className="font-mono text-xs text-ink-dim">no atlas</p>
              )}
            </CollapsibleSection>

            {/* Native per-format ──────────────────────────────────────── */}
            <CollapsibleSection summary="native per-format">
              {v.nativePerFormatRendered && v.nativePerFormatRendered.length > 0 ? (
                <div
                  className="flex flex-wrap gap-4"
                  data-testid={`native-per-format-${v.index}`}
                >
                  {v.nativePerFormatRendered.map((formatId) => {
                    const url =
                      v.nativePerFormatUrls?.[
                        formatId as keyof typeof v.nativePerFormatUrls
                      ];
                    return (
                      <div key={formatId} className="flex flex-col gap-1">
                        <Chip tone="neutral" size="sm">
                          {formatId}
                        </Chip>
                        {url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={url}
                            alt={`${formatId} v${v.index}`}
                            className="block w-24 rounded border border-border-soft object-cover"
                          />
                        ) : (
                          <p className="font-mono text-xs text-ink-dim">
                            upload failed
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="font-mono text-xs text-ink-dim">
                  no per-format renders
                </p>
              )}
            </CollapsibleSection>

            {/* Text overlays ──────────────────────────────────────────── */}
            <CollapsibleSection summary={`text overlays (${Array.isArray(v.textOverlays) ? v.textOverlays.length : 0})`}>
              {Array.isArray(v.textOverlays) && v.textOverlays.length > 0 ? (
                <ul
                  className="space-y-2"
                  data-testid={`text-overlays-${v.index}`}
                >
                  {(v.textOverlays as TextOverlay[]).map((overlay, oi) => {
                    const bbox = overlay.zone.bbox;
                    return (
                      <li
                        key={oi}
                        className="rounded border border-border-soft p-3"
                      >
                        <div className="mb-1 flex items-center gap-2">
                          <span className="font-display text-sm">
                            {overlay.zone.purpose}
                          </span>
                          {overlay.scope && (
                            <Chip
                              tone={overlay.scope === 'global' ? 'info' : 'secondary'}
                              size="sm"
                            >
                              {overlay.scope}
                            </Chip>
                          )}
                          {bbox && (
                            <span className="font-mono text-xs text-ink-dim">
                              {Math.round(bbox.x)},{Math.round(bbox.y)} {Math.round(bbox.w)}×{Math.round(bbox.h)}
                            </span>
                          )}
                        </div>
                        <ul className="space-y-0.5">
                          {Object.entries(overlay.content).map(
                            ([locale, text]) => (
                              <li
                                key={locale}
                                className="grid grid-cols-[80px_1fr] gap-2 text-xs"
                              >
                                <span className="font-mono text-ink-dim">
                                  {locale}
                                </span>
                                <span className="text-ink">
                                  {String(text).slice(0, 80)}
                                </span>
                              </li>
                            )
                          )}
                        </ul>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="font-mono text-xs text-ink-dim">no text overlays</p>
              )}
            </CollapsibleSection>

            {/* Agent steps ────────────────────────────────────────────── */}
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
              {trace.scheduledPosts.map((p, i) => (
                <li
                  key={p.id}
                  className="grid grid-cols-[100px_120px_1fr_100px] gap-3 border-b border-border-soft py-2 text-sm last:border-b-0"
                >
                  <span className="font-display">{p.platform}</span>
                  <span className="font-mono text-xs text-ink-dim">
                    {p.scheduledAt}
                  </span>
                  <span className="text-ink">
                    {p.caption.slice(0, 80)}
                    {trace.variations?.[i] !== undefined && (
                      <span className="ml-2 font-mono text-xs text-ink-dim">
                        → v{i}
                      </span>
                    )}
                  </span>
                  <Chip tone="neutral" size="sm">
                    {p.status} · {p.provider}
                  </Chip>
                </li>
              ))}
            </ul>
          </Surface>
        )}

        {/* Discord pings: no Convex persistence yet */}
        <Surface className="mb-6 p-5">
          <header className="mb-2 font-display text-base">discord pings</header>
          <p className="font-mono text-xs text-ink-dim">
            no Convex persistence for Discord pings yet — pings are sent
            in-process during runAutoMode and are not stored.
          </p>
        </Surface>

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
