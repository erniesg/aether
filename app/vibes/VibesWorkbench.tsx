'use client';

import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  AtSign,
  Bot,
  Check,
  ExternalLink,
  Gauge,
  Hash,
  KeyRound,
  Link as LinkIcon,
  Loader2,
  Plus,
  Search,
  SlidersHorizontal,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Chip, type ChipTone } from '@/components/ui/Chip';
import { Surface } from '@/components/ui/Surface';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { useVibesAuth } from '@/components/vibes/vibes-auth';
import { VibesAccessMenu } from '@/components/vibes/VibesAccessMenu';
import { VibesShareMenu } from '@/components/share/VibesShareMenu';
import { RunEventTimeline, summarizeRunEvents } from '@/components/vibes/RunEventTimeline';
import type { EventPlatform, EventRecapBundle } from '@/lib/research/event-recap/types';
import type { VibesPlan, VibesTermKind } from '@/lib/research/vibes/plan';

type LiveMode = 'mock' | 'tinyfish';

/** Optional scope overrides — empty strings mean "use the subject-aware default". */
interface ScopeState {
  daysBefore: string;
  daysAfter: string;
  refreshIntervalHours: string;
  monthlyCreditBudget: string;
}

const emptyScope: ScopeState = {
  daysBefore: '',
  daysAfter: '',
  refreshIntervalHours: '',
  monthlyCreditBudget: '',
};

/** Shape returned by POST /api/vibes/estimate `counts` (estimateEventCounts). */
interface EstimateCounts {
  eventName: string;
  querySet: string[];
  windowStart: string;
  windowEnd: string;
  estimates: Array<{
    platform: string;
    totalLowerBound?: number;
    totalApproximate?: number;
    status?: string;
    mode?: string;
  }>;
  warnings: string[];
}

const EXAMPLE_BRIEF =
  'Track AI Engineer Summit Singapore across X, LinkedIn, and YouTube. Include @aiDotEngineer, #AIE2026, speaker recaps, sponsor booths, workshops, and side events.';

export default function VibesWorkbench({ debug = false }: { debug?: boolean }) {
  const auth = useVibesAuth();
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
  const [scope, setScope] = useState<ScopeState>(emptyScope);
  const [estimateCounts, setEstimateCounts] = useState<EstimateCounts | null>(null);
  const [planning, setPlanning] = useState(false);
  const [estimating, setEstimating] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const visibleQuerySet = useMemo(() => plan?.querySet.slice(0, 18) ?? [], [plan?.querySet]);
  const busy = planning || estimating || running;

  async function jsonHeaders(): Promise<HeadersInit> {
    return { 'Content-Type': 'application/json', ...(await auth.getAuthHeaders()) };
  }

  function seedBody() {
    return {
      brief,
      subject: plan?.subject,
      subjectKind: plan?.subjectKind,
      keywords,
      hashtags,
      accounts,
      sourceLinks,
      platforms,
    };
  }

  async function draftPlan() {
    setPlanning(true);
    setError(null);
    try {
      const res = await fetch('/api/vibes/plan', {
        method: 'POST',
        headers: await jsonHeaders(),
        body: JSON.stringify(seedBody()),
      });
      const json = (await res.json()) as { ok?: boolean; plan?: VibesPlan; error?: string };
      if (!json.ok || !json.plan) throw apiError(res.status, json.error);
      applyPlan(json.plan);
      setEstimateCounts(null);
      setBundle(null);
      setReportUrl(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPlanning(false);
    }
  }

  async function runEstimate() {
    setEstimating(true);
    setError(null);
    try {
      const res = await fetch('/api/vibes/estimate', {
        method: 'POST',
        headers: await jsonHeaders(),
        body: JSON.stringify({ ...seedBody(), ...scopeBody(scope) }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        plan?: VibesPlan;
        counts?: EstimateCounts;
        error?: string;
      };
      if (!json.ok || !json.plan) throw apiError(res.status, json.error);
      applyPlan(json.plan);
      setEstimateCounts(json.counts ?? null);
      setBundle(null);
      setReportUrl(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setEstimating(false);
    }
  }

  async function makeReport() {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch('/api/vibes', {
        method: 'POST',
        headers: await jsonHeaders(),
        body: JSON.stringify({
          ...seedBody(),
          liveMode,
          targetItemsPerPlatform: targetItems,
          maxItemsPerPlatform: targetItems,
          includeMedia: true,
          includeYouTubeComments: true,
          ...scopeBody(scope),
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
      applyPlan(json.plan);
      setBundle(json.bundle ?? null);
      setReportUrl(json.reportUrl ?? `/events/${json.plan.eventId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }

  function applyPlan(next: VibesPlan) {
    setPlan(next);
    setKeywords(next.keywords);
    setHashtags(next.hashtags);
    setAccounts(next.accounts);
    setSourceLinks(next.sourceLinks);
    setPlatforms(next.platforms);
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
          {bundle?.event ? (
            <VibesShareMenu
              objectType="vibes_page"
              objectId={bundle.event.eventId}
              slug={bundle.event.eventId}
              canonicalPath={reportUrl ?? `/events/${encodeURIComponent(bundle.event.eventId)}`}
              title={`${bundle.event.canonicalName ?? bundle.event.name} vibes`}
              description={`References, clusters, media, and voices for ${bundle.event.canonicalName ?? bundle.event.name}.`}
              shareText={`${bundle.event.canonicalName ?? bundle.event.name} brought together attendees, speakers, sponsors, and builders across talks, demos, workshops, and side events. Here's the public recap.`}
              hashtags={bundle.event.querySet.filter((term) => term.startsWith('#')).slice(0, 4)}
            />
          ) : null}
          <VibesAccessMenu />
          <ThemeToggle />
        </div>
      </header>

      <section className="grid flex-1 gap-4 overflow-hidden px-4 py-4 min-[1180px]:grid-cols-[360px_minmax(0,1fr)] sm:px-6">
        <Surface as="section" taxonomy="input" border="soft" className="flex min-h-0 flex-col overflow-hidden">
          <div className="border-b border-border-soft p-4">
            <div className="flex items-center gap-2">
              <Search size={16} strokeWidth={1.75} className="text-accent" />
              <h1 className="font-display text-lg tracking-tight">research seeds</h1>
            </div>
            <textarea
              data-testid="vibes-brief"
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              rows={6}
              placeholder="Describe an event, product, brand, or campaign to listen for."
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
                  onChange={(e) => setTargetItems(Number(e.target.value))}
                  className="h-7 w-16 rounded-sm border border-border-soft bg-surface-base px-2 text-ink outline-none focus:border-accent"
                />
              </label>
            </div>

            <ScopePanel scope={scope} onChange={setScope} liveMode={liveMode} />
          </div>

          <div className="min-h-0 flex-1 overflow-auto p-4">
            <p className="mb-3 font-caption text-2xs leading-4 text-ink-dim">
              Seeds derived from the brief — edit freely, then re-run.
            </p>
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
                onChange={(e) => setTermValue(e.target.value)}
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
                disabled={busy || !brief.trim()}
                icon={planning ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                data-testid="vibes-frontier"
              >
                frontier
              </Button>
              <Button
                type="button"
                variant="outline"
                size="md"
                onClick={runEstimate}
                disabled={busy || !brief.trim()}
                icon={estimating ? <Loader2 size={14} className="animate-spin" /> : <Gauge size={14} />}
                data-testid="vibes-estimate"
              >
                estimate
              </Button>
            </div>
            <Button
              type="button"
              variant="primary"
              size="md"
              onClick={makeReport}
              disabled={busy || !brief.trim()}
              trailing={running ? <Loader2 size={14} className="animate-spin" /> : <ArrowRight size={14} />}
              className="mt-2 w-full"
              data-testid="vibes-report"
            >
              {bundle ? 're-run report' : 'report'}
            </Button>
          </form>
        </Surface>

        <Surface as="section" taxonomy="output" border="soft" className="min-h-0 overflow-auto p-4 sm:p-5">
          {plan ? (
            <PlanView
              plan={plan}
              bundle={bundle}
              reportUrl={reportUrl}
              liveMode={liveMode}
              brief={brief}
              visibleQuerySet={visibleQuerySet}
              estimateCounts={estimateCounts}
              debug={debug}
            />
          ) : (
            <EmptyState />
          )}
        </Surface>
      </section>
    </main>
  );
}

function PlanView({
  plan,
  bundle,
  reportUrl,
  liveMode,
  brief,
  visibleQuerySet,
  estimateCounts,
  debug,
}: {
  plan: VibesPlan;
  bundle: EventRecapBundle | null;
  reportUrl: string | null;
  liveMode: LiveMode;
  brief: string;
  visibleQuerySet: string[];
  estimateCounts: EstimateCounts | null;
  debug: boolean;
}) {
  const counts = useMemo(() => summarizeBundle(bundle), [bundle]);
  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex flex-wrap items-center gap-2">
        <Chip tone={subjectTone(plan.subjectKind)} size="sm">
          {plan.subjectKind}
        </Chip>
        <Chip tone="neutral" size="sm">
          {plan.eventId}
        </Chip>
        <Chip tone={liveMode === 'tinyfish' ? 'warn' : 'neutral'} size="sm">
          {liveMode === 'tinyfish' ? 'live' : 'review'}
        </Chip>
      </div>

      <h2 className="mt-3 font-display text-3xl leading-tight tracking-tight sm:text-4xl">
        {plan.subject}
      </h2>

      <div className="mt-5 grid gap-2 sm:grid-cols-2 min-[1180px]:grid-cols-4">
        <Metric label="queries" value={plan.querySet.length} detail={`${plan.keywords.length} keywords`} />
        <Metric label="accounts" value={plan.accounts.length} detail={`${plan.hashtags.length} hashtags`} />
        <Metric label="sources" value={plan.sourceLinks.length} detail={plan.platforms.join(' + ')} />
        <Metric
          label="refs"
          value={counts.posts}
          detail={bundle ? `${counts.clusters} clusters` : 'run a report'}
        />
      </div>

      {estimateCounts && !bundle ? <EstimatePanel counts={estimateCounts} /> : null}

      {bundle ? (
        <ReportSummary bundle={bundle} reportUrl={reportUrl} />
      ) : (
        <div className="mt-5 grid gap-3 min-[980px]:grid-cols-2">
          <QuerySetList queries={visibleQuerySet} />
          <AnchorList plan={plan} />
        </div>
      )}

      <ProvenanceDisclosure plan={plan} />
      {debug ? <DebugDrawer plan={plan} brief={brief} liveMode={liveMode} /> : null}
    </div>
  );
}

function EstimatePanel({ counts }: { counts: EstimateCounts }) {
  return (
    <section
      data-testid="vibes-estimate-panel"
      className="mt-5 rounded-md border border-border-soft bg-surface-base p-3"
    >
      <div className="flex items-center gap-2">
        <Gauge size={15} strokeWidth={1.75} className="text-accent" />
        <h3 className="font-display text-base tracking-tight">estimated reach</h3>
        <Chip tone="neutral" size="sm" className="ml-auto">
          dry run
        </Chip>
      </div>
      <p className="mt-1 font-caption text-xs text-ink-dim">
        Projected public matches before any collection — {formatWindow(counts.windowStart, counts.windowEnd)}.
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {counts.estimates.map((estimate) => (
          <div key={estimate.platform} className="rounded-sm border border-border-soft p-2">
            <div className="flex items-center gap-2">
              <Chip size="sm" tone="neutral">
                {estimate.platform}
              </Chip>
              {estimate.status && estimate.status !== 'completed' ? (
                <span className="truncate font-mono text-2xs text-ink-dim">{estimate.status}</span>
              ) : null}
            </div>
            <p className="mt-2 font-display text-xl leading-none">
              {formatCount(estimate.totalApproximate ?? estimate.totalLowerBound ?? 0)}
            </p>
            <p className="mt-1 font-caption text-2xs uppercase text-ink-dim">
              {estimate.totalApproximate != null ? 'approx matches' : 'known floor'}
            </p>
          </div>
        ))}
        {counts.estimates.length === 0 ? (
          <p className="font-caption text-xs text-ink-dim">
            No estimates — provider keys are not configured in this environment.
          </p>
        ) : null}
      </div>
      {counts.warnings.length ? (
        <details className="mt-3">
          <summary className="cursor-pointer font-caption text-2xs uppercase text-ink-dim">
            {counts.warnings.length} notes
          </summary>
          <ul className="mt-2 space-y-1 font-caption text-xs leading-5 text-ink-dim">
            {counts.warnings.map((warning, index) => (
              <li key={`${index}:${warning}`}>{warning}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}

function ReportSummary({
  bundle,
  reportUrl,
}: {
  bundle: EventRecapBundle;
  reportUrl: string | null;
}) {
  const mediaCount = bundle.posts.reduce((sum, post) => sum + (post.media?.length ?? 0), 0);
  const runEvents = bundle.runEvents ?? [];
  const summary = summarizeRunEvents(runEvents);
  const warnings = bundle.runs[0]?.warnings ?? [];
  const themes = bundle.themes.slice(0, 5);
  const voices = bundle.voices.slice(0, 5);
  const runTone: ChipTone =
    summary.status === 'failed' ? 'error' : summary.status === 'done' ? 'ok' : 'info';

  return (
    <section data-testid="vibes-report-summary" className="mt-5">
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-border-soft bg-surface-base p-3">
        <Chip tone={runTone} size="sm">
          run {summary.status}
        </Chip>
        <span className="font-mono text-xs text-ink-dim">{summary.steps} steps</span>
        {summary.warnings > 0 ? (
          <Chip tone="warn" size="sm">
            {summary.warnings} warnings
          </Chip>
        ) : null}
        {reportUrl ? (
          <Link
            href={reportUrl}
            data-testid="vibes-open-report"
            className="ml-auto inline-flex h-7 items-center gap-1.5 rounded-sm border border-accent bg-accent px-2.5 text-xs font-medium text-ink-on-accent transition-colors hover:border-accent-strong hover:bg-accent-strong"
          >
            open report
            <ExternalLink size={13} strokeWidth={1.75} />
          </Link>
        ) : null}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 min-[980px]:grid-cols-4">
        <Metric label="refs" value={bundle.posts.length} detail="collected" />
        <Metric label="media" value={mediaCount} detail="images + video" />
        <Metric label="clusters" value={bundle.themes.length} detail="grouped ideas" />
        <Metric label="voices" value={bundle.voices.length} detail="repeat posters" />
      </div>

      {runEvents.length ? (
        <details className="mt-3 rounded-md border border-border-soft bg-surface-base p-3" open>
          <summary className="cursor-pointer font-caption text-xs uppercase text-ink-dim">
            run timeline
          </summary>
          <div className="mt-3">
            <RunEventTimeline events={runEvents} />
          </div>
        </details>
      ) : null}

      {warnings.length ? (
        <details className="mt-3 rounded-md border border-border-soft bg-surface-base p-3">
          <summary className="cursor-pointer font-caption text-xs uppercase text-ink-dim">
            {warnings.length} run warnings
          </summary>
          <ul className="mt-3 space-y-1.5 font-caption text-xs leading-5 text-ink-dim">
            {warnings.slice(0, 12).map((warning, index) => (
              <li key={`${index}:${warning}`}>{warning}</li>
            ))}
          </ul>
        </details>
      ) : null}

      {themes.length ? (
        <div className="mt-3 rounded-md border border-border-soft bg-surface-base p-3">
          <p className="font-caption text-xs uppercase text-ink-dim">clusters</p>
          <div className="mt-3 divide-y divide-border-soft">
            {themes.map((theme) => (
              <div key={theme.themeId} className="py-2.5 first:pt-0 last:pb-0">
                <p className="font-display text-base tracking-tight">{theme.label}</p>
                <p className="mt-1 line-clamp-2 text-sm leading-6 text-ink-muted">{theme.summary}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {voices.length ? (
        <div className="mt-3 rounded-md border border-border-soft bg-surface-base p-3">
          <p className="font-caption text-xs uppercase text-ink-dim">voices</p>
          <div className="mt-3 space-y-2">
            {voices.map((voice) => (
              <div
                key={voice.voiceId}
                className="flex items-center gap-2 rounded-sm border border-border-soft p-2"
              >
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
      ) : null}
    </section>
  );
}

function ScopePanel({
  scope,
  onChange,
  liveMode,
}: {
  scope: ScopeState;
  onChange: (next: ScopeState) => void;
  liveMode: LiveMode;
}) {
  const set = (key: keyof ScopeState, value: string) => onChange({ ...scope, [key]: value });
  const overrides = Object.values(scope).filter((value) => value.trim() !== '').length;
  return (
    <details className="mt-3 rounded-md border border-border-soft bg-surface-base" data-testid="vibes-scope">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 font-caption text-xs uppercase text-ink-dim [&::-webkit-details-marker]:hidden">
        <SlidersHorizontal size={13} strokeWidth={1.75} />
        scope
        {overrides > 0 ? (
          <Chip tone="accent" size="sm" variant="ghost">
            {overrides} set
          </Chip>
        ) : (
          <span className="font-mono text-2xs lowercase text-ink-dim">auto</span>
        )}
      </summary>
      <div className="grid grid-cols-2 gap-2 border-t border-border-soft p-3">
        <ScopeField
          label="days before"
          value={scope.daysBefore}
          placeholder="auto"
          onChange={(value) => set('daysBefore', value)}
        />
        <ScopeField
          label="days after"
          value={scope.daysAfter}
          placeholder="auto"
          onChange={(value) => set('daysAfter', value)}
        />
        <ScopeField
          label="refresh (h)"
          value={scope.refreshIntervalHours}
          placeholder="24"
          onChange={(value) => set('refreshIntervalHours', value)}
        />
        <ScopeField
          label="credit cap"
          value={scope.monthlyCreditBudget}
          placeholder={liveMode === 'tinyfish' ? '0 = none' : 'live only'}
          onChange={(value) => set('monthlyCreditBudget', value)}
        />
      </div>
    </details>
  );
}

function ScopeField({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1 font-caption text-2xs uppercase text-ink-dim">
      {label}
      <input
        type="number"
        min={0}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 rounded-sm border border-border-soft bg-surface-panel px-2 font-mono text-xs text-ink outline-none placeholder:text-ink-dim focus:border-accent"
      />
    </label>
  );
}

function ProvenanceDisclosure({ plan }: { plan: VibesPlan }) {
  return (
    <details className="mt-4 rounded-md border border-border-soft bg-surface-base p-3">
      <summary className="cursor-pointer font-caption text-xs uppercase text-ink-dim">
        provenance
      </summary>
      <div className="mt-3 space-y-2">
        {plan.auditSteps.map((step) => (
          <div key={step.id} className="rounded-sm border border-border-soft p-2">
            <div className="flex items-center gap-2">
              <Check size={13} strokeWidth={1.75} className="text-accent" />
              <span className="font-mono text-xs text-ink-muted">{step.label}</span>
              <Chip tone={step.status === 'ready' ? 'ok' : 'neutral'} size="sm" className="ml-auto">
                {step.status}
              </Chip>
            </div>
            <p className="mt-1 font-caption text-2xs uppercase text-ink-dim">
              {step.provider} · {step.telemetry.join(', ')}
            </p>
          </div>
        ))}
      </div>
    </details>
  );
}

function DebugDrawer({
  plan,
  brief,
  liveMode,
}: {
  plan: VibesPlan;
  brief: string;
  liveMode: LiveMode;
}) {
  return (
    <details className="mt-4 rounded-md border border-dashed border-border-soft bg-surface-base p-3">
      <summary className="cursor-pointer font-caption text-xs uppercase text-ink-dim">
        debug — runtime adapters + api shape
      </summary>
      <div className="mt-3 space-y-2">
        {plan.managedRuntimes.map((runtime) => (
          <div key={runtime.provider} className="rounded-sm border border-border-soft p-2">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-ink-muted">{runtime.label}</span>
              <Chip tone={runtime.status === 'active' ? 'ok' : 'neutral'} size="sm" className="ml-auto">
                {runtime.status}
              </Chip>
            </div>
            <p className="mt-1 font-caption text-xs leading-5 text-ink-dim">{runtime.fit}</p>
          </div>
        ))}
      </div>
      <pre className="mt-3 overflow-auto whitespace-pre-wrap rounded-sm border border-border-soft bg-surface-panel p-2 font-mono text-2xs leading-5 text-ink-dim">
        {JSON.stringify(
          {
            api: plan.apiShape,
            body: { brief, platforms: plan.platforms, liveMode },
          },
          null,
          2
        )}
      </pre>
      <Link
        href="/vibes/aie2026"
        className="mt-2 inline-flex items-center gap-1 rounded-sm border border-border-soft px-2 py-1 font-mono text-xs text-ink-dim hover:border-accent hover:text-accent"
      >
        aie2026 demo
        <ExternalLink size={12} strokeWidth={1.75} />
      </Link>
    </details>
  );
}

function EmptyState() {
  return (
    <div className="grid min-h-[calc(100vh-9rem)] place-items-center">
      <div className="max-w-md text-center">
        <Bot size={28} strokeWidth={1.5} className="mx-auto text-accent" />
        <h2 className="mt-4 font-display text-2xl tracking-tight">vibe research</h2>
        <p className="mt-2 font-caption text-sm leading-6 text-ink-dim">
          Draft a frontier from the brief, estimate the reach, then run a report.
        </p>
      </div>
    </div>
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
            <p className="mt-2 line-clamp-2 font-caption text-xs leading-5 text-ink-dim">{anchor.bias}</p>
          </div>
        ))}
      </div>
    </div>
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

function scopeBody(scope: ScopeState): Record<string, number> {
  const body: Record<string, number> = {};
  for (const key of Object.keys(scope) as Array<keyof ScopeState>) {
    const raw = scope[key].trim();
    if (raw === '') continue;
    const value = Number(raw);
    if (Number.isFinite(value) && value >= 0) body[key] = value;
  }
  return body;
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

function formatCount(value: number): string {
  return new Intl.NumberFormat('en-SG', { notation: 'compact', maximumFractionDigits: 1 }).format(
    value
  );
}

function formatWindow(start: string, end: string): string {
  const day = (value: string) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toISOString().slice(0, 10);
  };
  return `${day(start)} → ${day(end)}`;
}

function apiError(status: number, message?: string): Error {
  if (status === 401) return new Error('Add a Vibes API key or sign in — see access, top right.');
  if (status === 429) return new Error(message ?? 'Daily Vibes API limit reached.');
  return new Error(message ?? `HTTP ${status}`);
}
