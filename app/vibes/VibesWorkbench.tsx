'use client';

import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  AtSign,
  Bot,
  Check,
  ExternalLink,
  Hash,
  KeyRound,
  Link as LinkIcon,
  Loader2,
  Plus,
  Search,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Chip, type ChipTone } from '@/components/ui/Chip';
import { Surface } from '@/components/ui/Surface';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import type { EventPlatform, EventRecapBundle } from '@/lib/research/event-recap/types';
import type { VibesPlan, VibesTermKind } from '@/lib/research/vibes/plan';

type LiveMode = 'mock' | 'tinyfish';

export type VibesAuthHeaderGetter = () => Promise<string | null>;

export interface VibesWorkbenchProps {
  getAuthHeader?: VibesAuthHeaderGetter;
  disabled?: boolean;
}

const EXAMPLE_BRIEF =
  'Track AI Engineer Summit Singapore across X, LinkedIn, and YouTube. Include @aiDotEngineer, #AIE2026, speaker recaps, sponsor booths, workshops, and side events.';

export default function VibesWorkbench({
  getAuthHeader,
  disabled = false,
}: VibesWorkbenchProps) {
  const [brief, setBrief] = useState(EXAMPLE_BRIEF);
  const [plan, setPlan] = useState<VibesPlan | null>(null);
  const [bundle, setBundle] = useState<EventRecapBundle | null>(null);
  const [reportUrl, setReportUrl] = useState<string | null>(null);
  const [keywords, setKeywords] = useState<string[]>([]);
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [accounts, setAccounts] = useState<string[]>([]);
  const [sourceLinks, setSourceLinks] = useState<string[]>([]);
  const [platforms, setPlatforms] = useState<EventPlatform[]>(['x', 'linkedin', 'youtube']);
  const [termKind, setTermKind] = useState<VibesTermKind>('keyword');
  const [termValue, setTermValue] = useState('');
  const [liveMode, setLiveMode] = useState<LiveMode>('mock');
  const [targetItems, setTargetItems] = useState(25);
  const [planning, setPlanning] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const visibleQuerySet = useMemo(
    () => plan?.querySet.slice(0, 18) ?? [],
    [plan?.querySet]
  );
  const reportCounts = useMemo(() => summarizeBundle(bundle), [bundle]);

  async function draftPlan() {
    setPlanning(true);
    setError(null);
    try {
      const nextPlan = await postPlan();
      setPlan(nextPlan);
      setKeywords(nextPlan.keywords);
      setHashtags(nextPlan.hashtags);
      setAccounts(nextPlan.accounts);
      setSourceLinks(nextPlan.sourceLinks);
      setPlatforms(nextPlan.platforms);
      setBundle(null);
      setReportUrl(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPlanning(false);
    }
  }

  async function makeReport() {
    setRunning(true);
    setError(null);
    try {
      const headers = await buildJsonHeaders(getAuthHeader);
      const res = await fetch('/api/vibes', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          brief,
          subject: plan?.subject,
          subjectKind: plan?.subjectKind,
          keywords,
          hashtags,
          accounts,
          sourceLinks,
          platforms,
          liveMode,
          targetItemsPerPlatform: targetItems,
          maxItemsPerPlatform: targetItems,
          includeMedia: true,
          includeYouTubeComments: true,
        }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        plan?: VibesPlan;
        bundle?: EventRecapBundle;
        reportUrl?: string;
        error?: string;
      };
      if (!json.ok || !json.plan) throw apiError(res.status, json.error);
      setPlan(json.plan);
      setKeywords(json.plan.keywords);
      setHashtags(json.plan.hashtags);
      setAccounts(json.plan.accounts);
      setSourceLinks(json.plan.sourceLinks);
      setPlatforms(json.plan.platforms);
      setBundle(json.bundle ?? null);
      setReportUrl(json.reportUrl ?? `/events/${json.plan.eventId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }

  async function postPlan(): Promise<VibesPlan> {
    const headers = await buildJsonHeaders(getAuthHeader);
    const res = await fetch('/api/vibes/plan', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        brief,
        subject: plan?.subject,
        subjectKind: plan?.subjectKind,
        keywords,
        hashtags,
        accounts,
        sourceLinks,
        platforms,
      }),
    });
    const json = (await res.json()) as { ok?: boolean; plan?: VibesPlan; error?: string };
    if (!json.ok || !json.plan) throw apiError(res.status, json.error);
    return json.plan;
  }

  function addTerm(e: FormEvent) {
    e.preventDefault();
    const value = termValue.trim();
    if (!value) return;
    if (termKind === 'keyword') setKeywords((items) => addUnique(items, value));
    if (termKind === 'hashtag') setHashtags((items) => addUnique(items, `#${value.replace(/^#+/, '')}`));
    if (termKind === 'account') setAccounts((items) => addUnique(items, `@${value.replace(/^@+/, '')}`));
    if (termKind === 'source') setSourceLinks((items) => addUnique(items, value));
    setTermValue('');
  }

  return (
    <main className="flex min-h-screen flex-col bg-surface-base text-ink">
      <header className="flex h-header items-center justify-between border-b border-border-soft bg-surface-panel px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/" className="font-display text-lg tracking-tight">
            aether
          </Link>
          <Chip tone="info" size="sm">
            vibes
          </Chip>
          {plan ? (
            <Chip tone="neutral" size="sm" className="hidden max-w-[260px] truncate sm:inline-flex">
              {plan.subject}
            </Chip>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/vibes/aie2026"
            className="hidden items-center gap-1 rounded-sm border border-border-soft px-2 py-1 font-mono text-xs text-ink-dim hover:border-accent hover:text-accent sm:inline-flex"
          >
            aie2026
            <ExternalLink size={12} strokeWidth={1.75} />
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <section className="grid flex-1 gap-4 overflow-hidden px-4 py-4 min-[1180px]:grid-cols-[360px_minmax(0,1fr)] sm:px-6">
        <Surface
          as="section"
          taxonomy="input"
          border="soft"
          className="flex min-h-0 flex-col overflow-hidden"
        >
          <div className="border-b border-border-soft p-4">
            <div className="flex items-center gap-2">
              <Search size={16} strokeWidth={1.75} className="text-accent" />
              <h1 className="font-display text-lg tracking-tight">research seeds</h1>
            </div>
            <textarea
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              rows={7}
              className="mt-4 w-full resize-none rounded-md border border-border-soft bg-surface-base px-3 py-2 font-mono text-sm leading-6 text-ink outline-none focus:border-accent"
            />

            <div className="mt-3 grid grid-cols-2 gap-2">
              <ModeButton active={liveMode === 'mock'} onClick={() => setLiveMode('mock')}>
                review
              </ModeButton>
              <ModeButton active={liveMode === 'tinyfish'} onClick={() => setLiveMode('tinyfish')}>
                live
              </ModeButton>
            </div>

            <div className="mt-3 flex items-center gap-2">
              {(['x', 'linkedin', 'youtube'] as const).map((platform) => (
                <button
                  key={platform}
                  type="button"
                  onClick={() => setPlatforms((items) => togglePlatform(items, platform))}
                  className={`rounded-sm border px-2 py-1 font-mono text-xs ${
                    platforms.includes(platform)
                      ? 'border-accent bg-accent/10 text-accent'
                      : 'border-border-soft text-ink-dim hover:border-accent hover:text-accent'
                  }`}
                >
                  {platform}
                </button>
              ))}
              <label className="ml-auto flex items-center gap-2 font-mono text-xs text-ink-dim">
                refs
                <input
                  type="number"
                  min={5}
                  max={1000}
                  value={targetItems}
                  onChange={(event) => setTargetItems(Number(event.target.value))}
                  className="h-7 w-16 rounded-sm border border-border-soft bg-surface-base px-2 text-ink outline-none focus:border-accent"
                />
              </label>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto p-4">
            <TermGroup
              title="keywords"
              icon={<KeyRound size={14} strokeWidth={1.75} />}
              items={keywords}
              onRemove={(value) => setKeywords((items) => items.filter((item) => item !== value))}
            />
            <TermGroup
              title="hashtags"
              icon={<Hash size={14} strokeWidth={1.75} />}
              items={hashtags}
              onRemove={(value) => setHashtags((items) => items.filter((item) => item !== value))}
            />
            <TermGroup
              title="accounts"
              icon={<AtSign size={14} strokeWidth={1.75} />}
              items={accounts}
              onRemove={(value) => setAccounts((items) => items.filter((item) => item !== value))}
            />
            <TermGroup
              title="sources"
              icon={<LinkIcon size={14} strokeWidth={1.75} />}
              items={sourceLinks}
              onRemove={(value) => setSourceLinks((items) => items.filter((item) => item !== value))}
            />
          </div>

          <form onSubmit={addTerm} className="border-t border-border-soft p-4">
            <div className="grid grid-cols-4 gap-1.5">
              {termKinds.map((kind) => (
                <button
                  key={kind.value}
                  type="button"
                  onClick={() => setTermKind(kind.value)}
                  className={`grid h-8 place-items-center rounded-sm border ${
                    termKind === kind.value
                      ? 'border-accent bg-accent text-ink-on-accent'
                      : 'border-border-soft text-ink-dim hover:border-accent hover:text-accent'
                  }`}
                  title={kind.label}
                  aria-label={kind.label}
                >
                  {kind.icon}
                </button>
              ))}
            </div>
            <div className="mt-2 flex gap-2">
              <input
                value={termValue}
                onChange={(event) => setTermValue(event.target.value)}
                placeholder="add seed"
                className="min-w-0 flex-1 rounded-sm border border-border-soft bg-surface-base px-3 py-2 font-mono text-sm text-ink outline-none placeholder:text-ink-dim focus:border-accent"
              />
              <Button type="submit" variant="subtle" size="md" icon={<Plus size={14} strokeWidth={1.75} />}>
                add
              </Button>
            </div>
            {error ? <p className="mt-3 font-caption text-xs text-signal-error">{error}</p> : null}
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                size="md"
                onClick={draftPlan}
                disabled={disabled || planning || running || !brief.trim()}
                icon={planning ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              >
                frontier
              </Button>
              <Button
                type="button"
                variant="primary"
                size="md"
                onClick={makeReport}
                disabled={disabled || running || planning || !brief.trim()}
                trailing={running ? <Loader2 size={14} className="animate-spin" /> : <ArrowRight size={14} />}
              >
                report
              </Button>
            </div>
          </form>
        </Surface>

        <Surface
          as="section"
          taxonomy="output"
          border="soft"
          className="min-h-0 overflow-auto p-4 sm:p-5"
        >
          {plan ? (
            <div className="grid gap-4 min-[1320px]:grid-cols-[minmax(0,1fr)_340px]">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Chip tone={subjectTone(plan.subjectKind)} size="sm">
                    {plan.subjectKind}
                  </Chip>
                  <Chip tone="neutral" size="sm">
                    {plan.eventId}
                  </Chip>
                  {reportUrl ? (
                    <Link
                      href={reportUrl}
                      className="ml-auto inline-flex items-center gap-1 rounded-sm border border-accent px-2 py-1 font-mono text-xs text-accent hover:bg-accent hover:text-ink-on-accent"
                    >
                      open report
                      <ExternalLink size={12} strokeWidth={1.75} />
                    </Link>
                  ) : null}
                </div>

                <h2 className="mt-3 font-display text-3xl leading-tight tracking-tight sm:text-4xl">
                  {plan.subject}
                </h2>

                <div className="mt-5 grid gap-2 sm:grid-cols-2 min-[1320px]:grid-cols-4">
                  <Metric label="queries" value={plan.querySet.length} detail={`${plan.keywords.length} keywords`} />
                  <Metric label="accounts" value={plan.accounts.length} detail={`${plan.hashtags.length} hashtags`} />
                  <Metric label="sources" value={plan.sourceLinks.length} detail={plan.platforms.join(' + ')} />
                  <Metric label="refs" value={reportCounts.posts} detail={`${reportCounts.clusters} clusters`} />
                </div>

                {bundle ? (
                  <ReportSnapshot bundle={bundle} />
                ) : (
                  <div className="mt-5 grid gap-3 min-[980px]:grid-cols-2">
                    <QuerySetList queries={visibleQuerySet} />
                    <AnchorList plan={plan} />
                  </div>
                )}
              </div>

              <aside className="min-w-0">
                <TracePanel plan={plan} />
                <RuntimePanel plan={plan} />
                <details className="mt-4 rounded-md border border-border-soft bg-surface-base p-3">
                  <summary className="cursor-pointer font-caption text-xs uppercase text-ink-dim">
                    api shape
                  </summary>
                  <pre className="mt-3 overflow-auto whitespace-pre-wrap font-mono text-2xs leading-5 text-ink-dim">
                    {JSON.stringify(
                      {
                        create: plan.apiShape.create,
                        report: plan.apiShape.report,
                        refresh: plan.apiShape.refresh,
                        body: {
                          brief,
                          keywords,
                          hashtags,
                          accounts,
                          sourceLinks,
                          platforms,
                          liveMode,
                        },
                      },
                      null,
                      2
                    )}
                  </pre>
                </details>
              </aside>
            </div>
          ) : (
            <div className="grid min-h-[calc(100vh-9rem)] place-items-center">
              <div className="max-w-xl text-center">
                <Bot size={30} strokeWidth={1.5} className="mx-auto text-accent" />
                <h2 className="mt-4 font-display text-3xl tracking-tight">vibe research</h2>
                <p className="mt-3 text-sm leading-6 text-ink-muted">
                  Awaiting frontier.
                </p>
              </div>
            </div>
          )}
        </Surface>
      </section>
    </main>
  );
}

const termKinds: Array<{ value: VibesTermKind; label: string; icon: ReactNode }> = [
  { value: 'keyword', label: 'keyword', icon: <KeyRound size={14} strokeWidth={1.75} /> },
  { value: 'hashtag', label: 'hashtag', icon: <Hash size={14} strokeWidth={1.75} /> },
  { value: 'account', label: 'account', icon: <AtSign size={14} strokeWidth={1.75} /> },
  { value: 'source', label: 'source', icon: <LinkIcon size={14} strokeWidth={1.75} /> },
];

function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-sm border px-3 py-2 font-mono text-xs ${
        active
          ? 'border-accent bg-accent text-ink-on-accent'
          : 'border-border-soft text-ink-dim hover:border-accent hover:text-accent'
      }`}
    >
      {children}
    </button>
  );
}

function TermGroup({
  title,
  icon,
  items,
  onRemove,
}: {
  title: string;
  icon: ReactNode;
  items: string[];
  onRemove: (value: string) => void;
}) {
  return (
    <div className="mb-4">
      <div className="mb-2 flex items-center gap-2 font-caption text-xs uppercase text-ink-dim">
        {icon}
        {title}
      </div>
      {items.length ? (
        <div className="flex flex-wrap gap-1.5">
          {items.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => onRemove(item)}
              className="group inline-flex max-w-full items-center gap-1 rounded-sm border border-border-soft px-2 py-1 text-left font-mono text-xs text-ink-muted hover:border-signal-error hover:text-signal-error"
              title={`remove ${item}`}
            >
              <span className="truncate">{item}</span>
              <Trash2 size={11} strokeWidth={1.75} className="shrink-0 opacity-50 group-hover:opacity-100" />
            </button>
          ))}
        </div>
      ) : (
        <p className="font-caption text-xs text-ink-dim">none</p>
      )}
    </div>
  );
}

function Metric({ label, value, detail }: { label: string; value: number; detail: string }) {
  return (
    <div className="rounded-md border border-border-soft bg-surface-base p-3">
      <p className="font-display text-2xl leading-none">{value}</p>
      <p className="mt-2 font-caption text-2xs uppercase text-ink-dim">{label}</p>
      <p className="mt-1 truncate font-mono text-xs text-ink-muted">{detail}</p>
    </div>
  );
}

function QuerySetList({ queries }: { queries: string[] }) {
  return (
    <div className="rounded-md border border-border-soft bg-surface-base p-3">
      <p className="font-caption text-xs uppercase text-ink-dim">query set</p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {queries.map((query) => (
          <Chip key={query} size="sm" tone="neutral" className="max-w-full whitespace-normal break-words">
            {query}
          </Chip>
        ))}
      </div>
    </div>
  );
}

function AnchorList({ plan }: { plan: VibesPlan }) {
  return (
    <div className="rounded-md border border-border-soft bg-surface-base p-3">
      <p className="font-caption text-xs uppercase text-ink-dim">frontier anchors</p>
      <div className="mt-3 space-y-2">
        {plan.frontier.anchors.slice(0, 8).map((anchor) => (
          <div key={`${anchor.kind}:${anchor.value}`} className="rounded-sm border border-border-soft p-2">
            <div className="flex items-center gap-2">
              <Chip size="sm" tone="neutral">
                {anchor.kind}
              </Chip>
              <span className="min-w-0 truncate font-mono text-xs text-ink-muted">{anchor.value}</span>
            </div>
            <p className="mt-2 line-clamp-2 font-caption text-xs leading-5 text-ink-dim">
              {anchor.bias}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ReportSnapshot({ bundle }: { bundle: EventRecapBundle }) {
  const themes = bundle.themes.slice(0, 6);
  const voices = bundle.voices.slice(0, 5);
  return (
    <div className="mt-5 grid gap-3 min-[980px]:grid-cols-[1fr_0.8fr]">
      <div className="rounded-md border border-border-soft bg-surface-base p-3">
        <p className="font-caption text-xs uppercase text-ink-dim">clusters</p>
        <div className="mt-3 divide-y divide-border-soft">
          {themes.map((theme) => (
            <div key={theme.themeId} className="py-3">
              <p className="font-display text-base tracking-tight">{theme.label}</p>
              <p className="mt-1 line-clamp-2 text-sm leading-6 text-ink-muted">{theme.summary}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {theme.keywords.slice(0, 5).map((keyword) => (
                  <Chip key={keyword} size="sm" tone="neutral" variant="ghost">
                    {keyword}
                  </Chip>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-md border border-border-soft bg-surface-base p-3">
        <p className="font-caption text-xs uppercase text-ink-dim">voices</p>
        <div className="mt-3 space-y-2">
          {voices.map((voice) => (
            <div key={voice.voiceId} className="flex items-center gap-2 rounded-sm border border-border-soft p-2">
              <Chip size="sm" tone={platformTone(voice.platform)}>
                {voice.platform}
              </Chip>
              <span className="min-w-0 flex-1 truncate font-mono text-xs text-ink-muted">
                {voice.handle ?? voice.name}
              </span>
              <span className="font-mono text-xs text-ink-dim">{voice.postCount}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TracePanel({ plan }: { plan: VibesPlan }) {
  return (
    <div className="rounded-md border border-border-soft bg-surface-base p-3">
      <p className="font-caption text-xs uppercase text-ink-dim">provenance</p>
      <div className="mt-3 space-y-2">
        {plan.auditSteps.map((step) => (
          <div key={step.id} className="rounded-sm border border-border-soft p-2">
            <div className="flex items-center gap-2">
              <Check size={13} strokeWidth={1.75} className="text-accent" />
              <span className="font-mono text-xs text-ink-muted">{step.label}</span>
            </div>
            <p className="mt-1 font-caption text-2xs uppercase text-ink-dim">
              {step.provider} · {step.telemetry.join(', ')}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function RuntimePanel({ plan }: { plan: VibesPlan }) {
  return (
    <details className="mt-4 rounded-md border border-border-soft bg-surface-base p-3">
      <summary className="cursor-pointer font-caption text-xs uppercase text-ink-dim">
        managed runtimes
      </summary>
      <div className="mt-3 space-y-2">
        {plan.managedRuntimes.map((runtime) => (
          <div key={runtime.provider} className="rounded-sm border border-border-soft p-2">
            <p className="font-mono text-xs text-ink-muted">{runtime.label}</p>
            <p className="mt-1 font-caption text-xs leading-5 text-ink-dim">{runtime.fit}</p>
          </div>
        ))}
      </div>
    </details>
  );
}

function addUnique(items: string[], value: string): string[] {
  const normalized = value.trim();
  if (!normalized) return items;
  const seen = new Set(items.map((item) => item.toLowerCase()));
  if (seen.has(normalized.toLowerCase())) return items;
  return [...items, normalized];
}

function togglePlatform(items: EventPlatform[], platform: EventPlatform): EventPlatform[] {
  if (items.includes(platform)) {
    const next = items.filter((item) => item !== platform);
    return next.length ? next : items;
  }
  return [...items, platform];
}

function summarizeBundle(bundle: EventRecapBundle | null) {
  return {
    posts: bundle?.posts.length ?? 0,
    clusters: bundle?.themes.length ?? 0,
  };
}

function subjectTone(kind: VibesPlan['subjectKind']): ChipTone {
  if (kind === 'event') return 'info';
  if (kind === 'brand') return 'ok';
  if (kind === 'product') return 'warn';
  return 'neutral';
}

function platformTone(platform: EventPlatform): ChipTone {
  if (platform === 'x') return 'neutral';
  if (platform === 'linkedin') return 'info';
  return 'ok';
}

async function buildJsonHeaders(getAuthHeader?: VibesAuthHeaderGetter): Promise<HeadersInit> {
  const authorization = await getAuthHeader?.();
  if (!authorization) {
    throw new Error('Sign in or add a Vibes API key before running managed research.');
  }
  return {
    'Content-Type': 'application/json',
    Authorization: authorization,
  };
}

function apiError(status: number, message?: string): Error {
  if (status === 401) return new Error('Sign in or add a valid Vibes API key.');
  if (status === 429) return new Error(message ?? 'Daily Vibes API limit reached.');
  return new Error(message ?? `HTTP ${status}`);
}
