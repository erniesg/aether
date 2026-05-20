'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Filter,
  HelpCircle,
  MessageSquareText,
  RefreshCw,
  Search,
  Sparkles,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Chip, type ChipTone } from '@/components/ui/Chip';
import { Surface } from '@/components/ui/Surface';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import type {
  EventPlatform,
  EventClusterQuality,
  EventPost,
  EventRecapBundle,
  EventRecapRecord,
  EventScrapeRun,
  EventTheme,
  EventVoice,
} from '@/lib/research/event-recap/types';
import { engagement } from '@/lib/research/event-recap/utils';

type Lens = 'posts' | 'themes' | 'timeline' | 'voices';
type PlatformFilter = 'all' | EventPlatform;
const MEDIA_WALL_PAGE_SIZE = 15;
const POST_SCORE_HELP =
  'Engagement score compares this ref with other refs on the same platform. 0 is typical; higher is above-platform average. Signals include public reactions, comments, reposts, and views where the platform exposes them.';
const VOICE_SCORE_HELP =
  'Voice score highlights people with repeated high-signal refs and public engagement.';

export default function EventRecapClient({
  eventId,
  debug,
}: {
  eventId: string;
  debug: boolean;
}) {
  const [bundle, setBundle] = useState<EventRecapBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lens, setLens] = useState<Lens>('themes');
  const [platform, setPlatform] = useState<PlatformFilter>('all');
  const [query, setQuery] = useState('');
  const [selectedTheme, setSelectedTheme] = useState<string | null>(null);
  const [showReplies, setShowReplies] = useState(false);
  const [showIrrelevant, setShowIrrelevant] = useState(false);
  const [ask, setAsk] = useState('');
  const [answer, setAnswer] = useState<string | null>(null);

  async function load() {
    try {
      const res = await fetch(`/api/events/${eventId}`, { cache: 'no-store' });
      const json = (await res.json()) as {
        ok?: boolean;
        bundle?: EventRecapBundle;
        error?: string;
      };
      if (!json.ok || !json.bundle) throw new Error(json.error ?? `HTTP ${res.status}`);
      setBundle(json.bundle);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function refresh() {
    setRefreshing(true);
    setError(null);
    try {
      const res = await fetch(`/api/events/${eventId}/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        bundle?: EventRecapBundle;
        error?: string;
      };
      if (!json.ok || !json.bundle) throw new Error(json.error ?? `HTTP ${res.status}`);
      setBundle(json.bundle);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRefreshing(false);
    }
  }

  async function askCorpus() {
    if (!ask.trim()) return;
    const res = await fetch('/api/events/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventId, query: ask, limit: 6 }),
    });
    const json = (await res.json()) as {
      ok?: boolean;
      posts?: EventPost[];
      error?: string;
    };
    if (!json.ok) {
      setAnswer(json.error ?? 'query failed');
      return;
    }
    const lines = (json.posts ?? []).map(
      (post) =>
        `- [${post.platform}] ${post.authorHandle ?? post.authorName}: ${post.text.slice(
          0,
          180
        )}${post.text.length > 180 ? '...' : ''} (${post.url})`
    );
    setAnswer(lines.length ? lines.join('\n') : 'No matching references yet.');
  }

  useEffect(() => {
    void load();
    const interval = window.setInterval(() => {
      if (!bundle) return;
      if (bundle.event.status === 'refreshing') void load();
      if (bundle.event.nextRefreshAt && Date.now() >= bundle.event.nextRefreshAt) {
        void refresh();
      }
    }, 15000);
    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, bundle?.event.status, bundle?.event.nextRefreshAt]);

  const filteredPosts = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (bundle?.posts ?? [])
      .filter((post) => showIrrelevant || !isIrrelevantPost(post))
      .filter((post) => showReplies || !isReplyPost(post))
      .filter((post) => platform === 'all' || post.platform === platform)
      .filter((post) => {
        if (!selectedTheme) return true;
        const theme = bundle?.themes.find((t) => t.themeId === selectedTheme);
        return theme?.postIds.includes(post.postId) ?? true;
      })
      .filter((post) => {
        if (!q) return true;
        return (
          post.text.toLowerCase().includes(q) ||
          post.authorName.toLowerCase().includes(q) ||
          (post.authorHandle ?? '').toLowerCase().includes(q) ||
          post.tags.some((tag) => tag.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => b.reachScore - a.reachScore);
  }, [bundle?.posts, bundle?.themes, platform, query, selectedTheme, showIrrelevant, showReplies]);

  const relevantPosts = useMemo(
    () => (bundle?.posts ?? []).filter((post) => !isIrrelevantPost(post)),
    [bundle?.posts]
  );
  const selectedThemeRecord = useMemo(
    () => bundle?.themes.find((theme) => theme.themeId === selectedTheme),
    [bundle?.themes, selectedTheme]
  );
  const clusteredRootCount = useMemo(() => {
    const ids = new Set((bundle?.themes ?? []).flatMap((theme) => theme.postIds));
    return ids.size;
  }, [bundle?.themes]);
  const vibeStats = useMemo(
    () => summarizeVibes(relevantPosts, bundle?.themes ?? [], bundle?.voices ?? []),
    [bundle?.themes, bundle?.voices, relevantPosts]
  );

  const event = bundle?.event;
  const latestRun = bundle?.runs[0];

  return (
    <main className="min-h-screen bg-surface-base text-ink">
      <header className="flex h-header items-center justify-between border-b border-border-soft bg-surface-panel px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/" className="font-display text-lg tracking-tight">
            aether
          </Link>
          <Chip tone="info" size="sm">
            event recap
          </Chip>
          {event?.status && (
            <Chip tone={event.status === 'error' ? 'error' : 'neutral'} size="sm">
              {event.status}
            </Chip>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="subtle"
            size="sm"
            icon={<RefreshCw size={14} strokeWidth={1.75} />}
            onClick={refresh}
            disabled={refreshing}
          >
            {refreshing ? 'refreshing' : 'refresh'}
          </Button>
          <ThemeToggle />
        </div>
      </header>

      <section className="mx-auto grid max-w-[1720px] gap-5 overflow-x-hidden px-4 py-6 sm:px-6 min-[1500px]:grid-cols-[340px_minmax(0,1fr)]">
        <Surface
          as="section"
          taxonomy="output"
          border="soft"
          className="order-1 min-w-0 overflow-hidden p-4 min-[1500px]:order-2"
        >
          {!loading && !error && bundle ? (
            <VibeOverview event={event} themes={bundle.themes} stats={vibeStats} />
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-soft pb-3">
            <div className="flex flex-wrap items-center gap-2">
              <LensButton active={lens === 'posts'} onClick={() => setLens('posts')}>
                refs
              </LensButton>
              <LensButton active={lens === 'themes'} onClick={() => setLens('themes')}>
                clusters
              </LensButton>
              <LensButton active={lens === 'timeline'} onClick={() => setLens('timeline')}>
                timeline
              </LensButton>
              <LensButton active={lens === 'voices'} onClick={() => setLens('voices')}>
                voices
              </LensButton>
            </div>
            <div className="flex items-center gap-2">
              <Filter size={14} className="text-ink-dim" strokeWidth={1.75} />
              {(['all', 'x', 'linkedin', 'youtube'] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setPlatform(p)}
                  className={`rounded-sm border px-2 py-1 font-mono text-xs ${
                    platform === p
                      ? 'border-accent bg-accent/10 text-accent'
                      : 'border-border-soft text-ink-dim hover:border-ink-dim'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              onClick={() => setShowReplies((value) => !value)}
              className={`rounded-sm border px-2 py-1 font-mono text-xs ${
                showReplies
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-border-soft text-ink-dim hover:border-ink-dim'
              }`}
            >
              {showReplies ? 'including replies' : 'primary refs'}
            </button>
            {debug ? (
              <button
                onClick={() => setShowIrrelevant((value) => !value)}
                className={`rounded-sm border px-2 py-1 font-mono text-xs ${
                  showIrrelevant
                    ? 'border-signal-warn bg-signal-warn/10 text-signal-warn'
                    : 'border-border-soft text-ink-dim hover:border-ink-dim'
                }`}
              >
                {showIrrelevant ? 'raw corpus' : 'relevant only'}
              </button>
            ) : null}
            {selectedThemeRecord ? (
              <button
                onClick={() => setSelectedTheme(null)}
                className="min-w-0 rounded-sm border border-accent bg-accent/10 px-2 py-1 text-left font-mono text-xs text-accent"
              >
                cluster: <span className="break-words">{selectedThemeRecord.label}</span> clear
              </button>
            ) : null}
            <span className="ml-auto font-caption text-xs text-ink-dim">
              {lens === 'themes'
                ? `${clusteredRootCount} primary refs clustered`
                : `${filteredPosts.length} refs visible`}
            </span>
          </div>

          <div className="mt-4 flex min-w-0 items-center gap-2 rounded-md border border-border-soft bg-surface-base px-3 py-2">
            <Search size={15} strokeWidth={1.75} className="text-ink-dim" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="search references"
              className="min-w-0 flex-1 bg-transparent font-mono text-sm text-ink outline-none placeholder:text-ink-dim"
            />
          </div>
          {lens !== 'themes' ? <ScoreMethodNote /> : null}

          {loading ? (
            <p className="mt-8 font-caption text-sm text-ink-dim">loading recap...</p>
          ) : error ? (
            <p className="mt-8 font-caption text-sm text-signal-error">{error}</p>
          ) : lens === 'themes' ? (
            <ThemeLens
              themes={bundle?.themes ?? []}
              posts={relevantPosts}
              selectedTheme={selectedTheme}
              onSelect={(id) => {
                setSelectedTheme(id === selectedTheme ? null : id);
                setLens('posts');
              }}
            />
          ) : lens === 'timeline' ? (
            <TimelineLens posts={filteredPosts} />
          ) : lens === 'voices' ? (
            <VoiceLens voices={bundle?.voices ?? []} />
          ) : (
            <PostList posts={filteredPosts} debug={debug} />
          )}
        </Surface>

        <Surface as="aside" taxonomy="tool" border="soft" className="order-2 h-fit min-w-0 overflow-hidden p-4 min-[1500px]:order-1">
          <CollectionSummary
            event={event}
            runs={bundle?.runs ?? []}
            posts={relevantPosts}
            clustering={bundle?.clustering}
          />

          <div className="mt-5 flex items-center gap-2 border-t border-border-soft pt-5">
            <MessageSquareText size={16} strokeWidth={1.75} className="text-accent" />
            <h2 className="font-display text-base tracking-tight">ask references</h2>
          </div>
          <textarea
            value={ask}
            onChange={(e) => setAsk(e.target.value)}
            rows={3}
            placeholder="e.g. what are people saying about evals?"
            className="mt-3 w-full resize-y rounded-md border border-border-soft bg-surface-base px-3 py-2 font-mono text-sm text-ink focus:border-accent focus:outline-none"
          />
          <Button
            variant="primary"
            size="sm"
            className="mt-3 w-full"
            onClick={askCorpus}
            disabled={!ask.trim()}
          >
            ask refs
          </Button>
          {answer && (
            <pre className="mt-4 whitespace-pre-wrap rounded-md border border-border-soft bg-surface-base p-3 font-mono text-xs leading-5 text-ink-muted">
              {answer}
            </pre>
          )}

          {debug && latestRun?.streamingUrls.length ? (
            <div className="mt-5 space-y-2">
              <p className="font-caption text-xs text-ink-dim">live preview</p>
              {latestRun.streamingUrls.map((stream) => (
                <a
                  key={`${stream.platform}:${stream.url}`}
                  href={stream.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between rounded-sm border border-border-soft px-2 py-1.5 font-mono text-xs text-ink-muted hover:border-accent hover:text-accent"
                >
                  <span>{stream.platform}</span>
                  <ExternalLink size={13} strokeWidth={1.75} />
                </a>
              ))}
            </div>
          ) : null}

          {debug && latestRun ? (
            <details className="mt-5 rounded-md border border-border-soft p-3">
              <summary className="cursor-pointer font-caption text-xs text-ink-dim">
                debug
              </summary>
              <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap font-mono text-2xs text-ink-dim">
                {JSON.stringify(latestRun, null, 2)}
              </pre>
            </details>
          ) : null}
        </Surface>
      </section>
    </main>
  );
}

function LensButton({
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
      onClick={onClick}
      className={`rounded-sm border px-3 py-1.5 font-mono text-xs transition ${
        active
          ? 'border-accent bg-accent text-ink-on-accent'
          : 'border-border-soft text-ink-muted hover:border-accent hover:text-accent'
      }`}
    >
      {children}
    </button>
  );
}

function CollectionSummary({
  event,
  runs,
  posts,
  clustering,
}: {
  event?: EventRecapRecord;
  runs: EventScrapeRun[];
  posts: EventPost[];
  clustering?: EventClusterQuality;
}) {
  const terms = event?.querySet ?? [];
  const refDates = dateRange(posts);
  const latestRun = runs[0];
  const sources = sourceSummary(posts);
  return (
    <div>
      <div className="flex items-center gap-2">
        <CalendarDays size={15} strokeWidth={1.75} className="text-accent" />
        <h2 className="font-display text-base tracking-tight">collection</h2>
      </div>
      <dl className="mt-3 space-y-3 font-mono text-xs text-ink-dim">
        <div>
          <dt className="uppercase">event window</dt>
          <dd className="mt-0.5 text-ink-muted">
            {event?.startsAt ? formatDate(event.startsAt) : 'date pending'}
            {event?.endsAt ? ` to ${formatDate(event.endsAt)}` : ''}
          </dd>
        </div>
        {refDates ? (
          <div>
            <dt className="uppercase">observed refs</dt>
            <dd className="mt-0.5 text-ink-muted">
              {formatDate(refDates.start)} to {formatDate(refDates.end)}
            </dd>
          </div>
        ) : null}
        {event?.location ? (
          <div>
            <dt className="uppercase">place</dt>
            <dd className="mt-0.5 text-ink-muted">{event.location}</dd>
          </div>
        ) : null}
      </dl>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {sources.map((source) => (
          <Chip key={source.label} size="sm" tone="neutral">
            {source.label} {source.count}
          </Chip>
        ))}
      </div>
      <details className="mt-3 border-t border-border-soft pt-3">
        <summary className="cursor-pointer font-caption text-xs uppercase text-ink-dim">
          methodology and limits
        </summary>
        <div className="mt-3 space-y-3 font-caption text-xs leading-5 text-ink-dim">
          <p>
            Method: seeded digital snowball sampling. Collection starts from event names, dates,
            source links, speakers, sponsors, and venue terms, then expands through public search
            surfaces, post links, conversation threads, author links, and newly discovered phrases.
          </p>
          {latestRun ? (
            <p>
              Collection run: {formatDate(latestRun.windowStart)} to {formatDate(latestRun.windowEnd)}
              . Generated terms are inputs, not recap findings.
            </p>
          ) : null}
          <ul className="space-y-2">
            <li>
              Refs are deduped, then filtered for an AI Engineer Singapore anchor plus program,
              speaker, sponsor, workshop, demo, media, logistics, or recap evidence.
            </li>
            <li>
              Incidental attendance or adjacent AI-in-Singapore posts are excluded unless they add
              source media, useful logistics, speaker/program context, or concrete event texture.
            </li>
            <li>This is an evidence-seeking public recap corpus, not a representative survey.</li>
            <li>
              Visible clusters use whole-post story assignment with precedence checks; broad recaps
              stay intact and can carry secondary story mentions.
            </li>
            <li>
              Root refs anchor stories. Replies, comments, logistics, media-only refs, and other
              context are attached for browsing rather than treated as story anchors.
            </li>
            <li>LinkedIn public collection does not expose impressions or views.</li>
            <li>Engagement score is platform-normalized public engagement, not raw reach.</li>
            <li>TF-IDF is retained for overlap diagnostics, not as the public cluster label source.</li>
          </ul>
          {clustering ? (
            <details className="rounded-sm border border-border-soft bg-surface-panel p-2">
              <summary className="cursor-pointer font-mono text-2xs uppercase text-ink-dim">
                cluster diagnostics
              </summary>
              <p className="mt-2 font-caption text-xs leading-5 text-ink-dim">
                Showing {clustering.storyClusterCount ?? clustering.clusterCount} reviewed story
                clusters from {clustering.rootRefCount} primary refs. Diagnostic TF-IDF baseline:
                silhouette {clustering.silhouetteScore.toFixed(4)}, inertia{' '}
                {(clustering.inertia ?? 0).toFixed(4)}.
              </p>
            </details>
          ) : null}
          <details className="rounded-sm border border-border-soft bg-surface-panel p-2">
            <summary className="cursor-pointer font-mono text-2xs uppercase text-ink-dim">
              show generated query terms
            </summary>
            <p className="mt-2 font-mono text-2xs text-ink-dim">{terms.length} terms</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {terms.map((term) => (
                <Chip
                  key={term}
                  size="sm"
                  tone="neutral"
                  className="inline-block max-w-full whitespace-normal break-words text-left leading-5"
                >
                  {term}
                </Chip>
              ))}
            </div>
          </details>
        </div>
      </details>
    </div>
  );
}

interface VibeStats {
  rootRefs: number;
  contextRefs: number;
  totalRefs: number;
  voices: number;
  clusters: number;
  knownViews: number;
  reactions: number;
  comments: number;
  reposts: number;
  mediaItems: number;
  mediaPosts: number;
  localMediaItems: number;
  platformMix: Record<EventPlatform, number>;
  sentiment: Array<{ label: string; count: number }>;
  media: Array<{
    key: string;
    url: string;
    postUrl: string;
    alt: string;
    platform: EventPlatform;
    postId: string;
  }>;
}

function VibeOverview({
  event,
  themes,
  stats,
}: {
  event?: EventRecapRecord;
  themes: EventTheme[];
  stats: VibeStats;
}) {
  const [mediaPage, setMediaPage] = useState(0);
  const leadTheme = themes[0];
  const eventName = event?.canonicalName ?? event?.name ?? 'event recap';
  const headline = leadTheme?.label ?? 'Event signal';
  const vibeChips = themes.slice(0, 5).map((theme) => theme.label);
  const summary = leadTheme?.summary
    ? truncateText(leadTheme.summary, 270)
    : 'Public references are grouped into evidence-backed clusters.';
  const mediaPageCount = Math.max(1, Math.ceil(stats.media.length / MEDIA_WALL_PAGE_SIZE));
  const safeMediaPage = Math.min(mediaPage, mediaPageCount - 1);
  const mediaStart = mediaWallStart(stats.media.length, safeMediaPage);
  const mediaEnd = Math.min(stats.media.length, mediaStart + MEDIA_WALL_PAGE_SIZE);
  const visibleMedia = stats.media.slice(mediaStart, mediaEnd);

  useEffect(() => {
    if (mediaPage >= mediaPageCount) setMediaPage(0);
  }, [mediaPage, mediaPageCount]);

  return (
    <section className="mb-5 overflow-hidden border-b border-border-soft pb-5">
      <div className="min-w-0">
        <p className="font-caption text-xs uppercase text-ink-dim">vibe snapshot</p>
        <h2 className="mt-2 max-w-3xl font-display text-3xl leading-tight tracking-tight sm:text-4xl">
          {eventName}
        </h2>
        <p className="mt-3 max-w-3xl text-base leading-7 text-ink-muted">
          {headline}. {summary}
        </p>
        <div className="mt-4 flex flex-wrap gap-1.5">
          {vibeChips.map((label) => (
            <Chip key={label} size="sm" tone="neutral">
              {label}
            </Chip>
          ))}
        </div>
      </div>

      <div className="mt-5 grid gap-2 sm:grid-cols-2 min-[1200px]:grid-cols-4">
        <VibeMetric label="primary refs" value={formatCompact(stats.rootRefs)} detail={`${formatCompact(stats.contextRefs)} context`} />
        <VibeMetric label="known views" value={formatCompact(stats.knownViews)} detail="X + YouTube only" />
        <VibeMetric label="public reactions" value={formatCompact(stats.reactions)} detail={`${formatCompact(stats.comments)} comments`} />
        <VibeMetric label="media assets" value={formatCompact(stats.mediaItems)} detail={`${formatCompact(stats.localMediaItems)} local`} />
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="font-caption text-xs uppercase text-ink-dim">media wall</p>
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-ink-dim">
            {stats.media.length ? `${mediaStart + 1}-${mediaEnd}` : '0'} / {stats.media.length}
          </span>
          <button
            type="button"
            onClick={() =>
              setMediaPage((page) => (page - 1 + mediaPageCount) % mediaPageCount)
            }
            disabled={mediaPageCount <= 1}
            aria-label="previous media"
            title="previous media"
            className="grid size-7 place-items-center rounded-sm border border-border-soft text-ink-dim hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronLeft size={14} strokeWidth={1.75} />
          </button>
          <button
            type="button"
            onClick={() => setMediaPage((page) => (page + 1) % mediaPageCount)}
            disabled={mediaPageCount <= 1}
            aria-label="next media"
            title="next media"
            className="grid size-7 place-items-center rounded-sm border border-border-soft text-ink-dim hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronRight size={14} strokeWidth={1.75} />
          </button>
        </div>
      </div>

      <div className="mt-2 grid grid-cols-3 gap-1.5 sm:grid-cols-6">
        {visibleMedia.map((item, index) => (
          <a
            key={item.key}
            href={item.postUrl}
            target="_blank"
            rel="noreferrer"
            aria-label={`open ${item.platform} reference`}
            title={`open ${item.platform} reference`}
            className={`group relative overflow-hidden rounded-sm border border-border-soft bg-surface-panel ${
              index === 0 ? 'col-span-2 row-span-2' : ''
            }`}
          >
            <img
              src={item.url}
              alt={item.alt}
              className="aspect-[4/3] h-full w-full object-cover transition duration-200 group-hover:scale-[1.02]"
              loading="lazy"
            />
            <span className="absolute right-1.5 top-1.5 grid size-6 place-items-center rounded-sm border border-surface-panel/70 bg-surface-panel/80 text-ink-dim opacity-0 transition group-hover:opacity-100">
              <ExternalLink size={12} strokeWidth={1.75} />
            </span>
          </a>
        ))}
      </div>

      <div className="mt-4 grid gap-3 min-[1100px]:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-md border border-border-soft bg-surface-base p-3">
          <p className="font-caption text-2xs uppercase text-ink-dim">surface mix</p>
          <div className="mt-3 grid gap-2">
            {(['linkedin', 'x', 'youtube'] as const).map((name) => {
              const count = stats.platformMix[name];
              const width = `${Math.max(4, (count / Math.max(1, stats.totalRefs)) * 100)}%`;
              return (
                <div key={name}>
                  <div className="flex items-center gap-2">
                    <Chip size="sm" tone={platformTone(name)}>
                      {name}
                    </Chip>
                    <span className="font-mono text-xs text-ink-dim">{count} refs</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-pill bg-surface-panel">
                    <div className={`h-full rounded-pill ${platformBar(name)}`} style={{ width }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-md border border-border-soft bg-surface-base p-3">
          <p className="font-caption text-2xs uppercase text-ink-dim">mood tags</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {stats.sentiment.map((item) => (
              <Chip key={item.label} size="sm" tone="neutral">
                {item.label} {item.count}
              </Chip>
            ))}
            <Chip size="sm" tone="neutral">
              {stats.clusters} clusters
            </Chip>
            <Chip size="sm" tone="neutral">
              {stats.voices} voices
            </Chip>
          </div>
          <p className="mt-3 font-caption text-xs leading-5 text-ink-dim">
            Views are observed public counts only; LinkedIn impressions are not exposed in this collection.
          </p>
        </div>
      </div>
    </section>
  );
}

function VibeMetric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-md border border-border-soft bg-surface-base p-3">
      <p className="font-display text-2xl leading-none">{value}</p>
      <p className="mt-2 font-caption text-2xs uppercase text-ink-dim">{label}</p>
      <p className="mt-1 font-mono text-xs text-ink-muted">{detail}</p>
    </div>
  );
}

function ScoreBadge({
  value,
  precision = 2,
  subject = 'ref',
  className = '',
}: {
  value: number;
  precision?: number;
  subject?: 'ref' | 'voice';
  className?: string;
}) {
  const help = subject === 'voice' ? VOICE_SCORE_HELP : POST_SCORE_HELP;
  const label = subject === 'voice' ? 'voice' : 'eng';
  return (
    <details
      className={`relative inline-block ${className}`}
      title={`${help} Click for details.`}
    >
      <summary className="inline-flex cursor-help list-none items-center gap-1 rounded-sm px-1 py-0.5 font-mono text-xs text-ink-dim hover:bg-surface-panel-muted hover:text-accent [&::-webkit-details-marker]:hidden">
        {label} {value.toFixed(precision)}
        <HelpCircle size={12} strokeWidth={1.75} aria-hidden="true" />
      </summary>
      <div className="absolute left-0 top-full z-30 mt-1 w-80 max-w-[calc(100vw-2rem)] rounded-md border border-border-soft bg-surface-panel p-3 shadow-lg">
        <p className="font-caption text-2xs uppercase text-ink-dim">score</p>
        <p className="mt-2 font-mono text-2xs leading-5 text-ink-dim">{help}</p>
        {subject === 'ref' ? (
          <p className="mt-2 font-caption text-xs leading-5 text-ink-dim">
            LinkedIn has no impressions here, so it uses reactions, comments, and reposts.
          </p>
        ) : null}
      </div>
    </details>
  );
}

function ScoreMethodNote() {
  return (
    <details className="mt-3 rounded-md border border-border-soft bg-surface-base px-3 py-2">
      <summary className="cursor-pointer font-caption text-xs uppercase text-ink-dim">
        engagement score is not reach
      </summary>
      <div className="mt-2 space-y-2 font-caption text-xs leading-5 text-ink-dim">
        <p>
          It is a platform-relative score used for sorting refs. A score of 0 is average for that
          platform in this corpus; positive numbers are above average, negative numbers are below.
        </p>
        <p className="font-mono text-2xs text-ink-muted">
          {POST_SCORE_HELP}
        </p>
        <p>LinkedIn impressions are unavailable, so LinkedIn scores use reactions, comments, and reposts only.</p>
      </div>
    </details>
  );
}

function PostList({ posts, debug }: { posts: EventPost[]; debug: boolean }) {
  if (!posts.length) {
    return <p className="mt-8 font-caption text-sm text-ink-dim">no references yet</p>;
  }
  return (
    <div className="mt-4 divide-y divide-border-soft">
      {posts.map((post) => (
        <article key={post.postId} className="py-4">
          <div className="flex flex-wrap items-center gap-2">
            <Chip tone={platformTone(post.platform)} size="sm">
              {post.platform}
            </Chip>
            <span className="font-mono text-xs text-ink-dim">
              {post.authorHandle ?? post.authorName}
            </span>
            {post.postedAt ? (
              <span className="font-mono text-xs text-ink-dim">
                {formatDateTime(post.postedAt)}
              </span>
            ) : null}
            <ScoreBadge value={post.reachScore} />
            <a
              href={post.url}
              target="_blank"
              rel="noreferrer"
              className="ml-auto text-ink-dim hover:text-accent"
              aria-label="open post"
            >
              <ExternalLink size={14} strokeWidth={1.75} />
            </a>
          </div>
          {post.media?.length ? (
            <div className="mt-3 grid grid-cols-4 gap-2">
              {post.media.slice(0, 4).map((media) => {
                const preview = media.previewUrl ?? media.url;
                return media.type === 'image' || media.type === 'gif' || media.previewUrl ? (
                  <img
                    key={media.url}
                    src={preview}
                    alt={media.altText ?? ''}
                    className="aspect-video w-full rounded-sm border border-border-soft object-cover"
                    loading="lazy"
                  />
                ) : null;
              })}
            </div>
          ) : null}
          <p className="mt-3 text-sm leading-6 text-ink">{post.text}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {post.tags.map((tag) => (
              <Chip key={tag} size="sm" tone="neutral" variant="ghost">
                {tag}
              </Chip>
            ))}
          </div>
          <PostInfo post={post} debug={debug} />
        </article>
      ))}
    </div>
  );
}

function PostInfo({ post, debug }: { post: EventPost; debug: boolean }) {
  const metrics = metricEntries(post.metrics);
  return (
    <details className="mt-3 rounded-md border border-border-soft bg-surface-base p-3">
      <summary className="cursor-pointer font-caption text-xs uppercase text-ink-dim">
        post info
      </summary>
      <div className="mt-3 grid gap-3 font-mono text-xs text-ink-dim">
        <InfoGrid
          items={[
            ['post id', post.postId],
            ['run id', post.runId],
            ['platform', post.platform],
            ['author', post.authorName],
            ['handle', post.authorHandle],
            ['posted', post.postedAt ? formatDateTime(post.postedAt) : undefined],
            ['captured', formatDateTime(post.capturedAt)],
            ['updated', formatDateTime(post.updatedAt)],
            ['raw engagement', engagement(post.metrics).toFixed(3)],
            ['engagement score', <ScoreBadge value={post.reachScore} precision={3} />],
          ]}
        />

        <div className="grid gap-1.5">
          <InfoLink label="source url" value={post.url} />
          <InfoLink label="author url" value={post.authorUrl} />
        </div>

        {post.authorMeta ? (
          <InfoGrid
            title="author"
            items={[
              ['headline', post.authorMeta.headline],
              ['location', post.authorMeta.location],
              ['followers', numberOrBlank(post.authorMeta.followers)],
              ['following', numberOrBlank(post.authorMeta.following)],
              ['posts', numberOrBlank(post.authorMeta.posts)],
              ['listed', numberOrBlank(post.authorMeta.listed)],
              ['verified', post.authorMeta.verified === undefined ? undefined : String(post.authorMeta.verified)],
              ['verified type', post.authorMeta.verifiedType],
              ['profile image', post.authorMeta.profileImageUrl],
              ['description', post.authorMeta.description],
            ]}
          />
        ) : null}

        {metrics.length ? (
          <InfoGrid title="metrics" items={metrics.map(([key, value]) => [key, String(value)])} />
        ) : (
          <p className="text-ink-dim">metrics unavailable</p>
        )}

        {post.media?.length ? (
          <div>
            <p className="font-caption text-2xs uppercase text-ink-dim">
              media {post.media.length}
            </p>
            <div className="mt-2 grid gap-2">
              {post.media.map((media, index) => (
                <div
                  key={`${post.postId}:media:${index}:${media.url}`}
                  className="rounded-sm border border-border-soft bg-surface-panel p-2"
                >
                  <InfoGrid
                    items={[
                      ['type', media.type],
                      ['source', media.source],
                      ['content type', media.contentType],
                      ['bytes', media.bytes ? formatBytes(media.bytes) : undefined],
                      ['size', media.width && media.height ? `${media.width}x${media.height}` : undefined],
                      ['downloaded', media.downloadedAt ? formatDateTime(media.downloadedAt) : undefined],
                      ['local path', media.localPath],
                      ['alt text', media.altText],
                    ]}
                  />
                  <div className="mt-2 grid gap-1">
                    <InfoLink label="media url" value={media.url} />
                    <InfoLink label="preview" value={media.previewUrl} />
                    <InfoLink label="page" value={media.pageUrl} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-ink-dim">media unavailable</p>
        )}

        <div>
          <p className="font-caption text-2xs uppercase text-ink-dim">provenance tags</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {post.tags.map((tag) => (
              <Chip key={`${post.postId}:info:${tag}`} size="sm" tone="neutral" variant="ghost">
                {tag}
              </Chip>
            ))}
          </div>
        </div>

        {debug ? (
          <details className="rounded-sm border border-border-soft bg-surface-panel p-2">
            <summary className="cursor-pointer font-caption text-2xs uppercase text-ink-dim">
              raw source payload
            </summary>
            <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap text-2xs leading-5 text-ink-dim">
              {JSON.stringify(post.raw, null, 2)}
            </pre>
          </details>
        ) : null}
      </div>
    </details>
  );
}

function InfoGrid({
  title,
  items,
}: {
  title?: string;
  items: Array<[string, ReactNode | undefined]>;
}) {
  const visible = items.filter(([, value]) => value !== undefined && value !== '');
  if (!visible.length) return null;
  return (
    <div>
      {title ? (
        <p className="mb-2 font-caption text-2xs uppercase text-ink-dim">{title}</p>
      ) : null}
      <dl className="grid gap-x-4 gap-y-1.5 sm:grid-cols-[140px_minmax(0,1fr)]">
        {visible.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="uppercase text-ink-dim">{label}</dt>
            <dd className="min-w-0 break-words text-ink-muted">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function InfoLink({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="grid gap-x-4 gap-y-1.5 sm:grid-cols-[140px_minmax(0,1fr)]">
      <span className="font-mono text-xs uppercase text-ink-dim">{label}</span>
      <a
        href={value}
        target="_blank"
        rel="noreferrer"
        className="min-w-0 break-words font-mono text-xs text-ink-muted hover:text-accent"
      >
        {value}
      </a>
    </div>
  );
}

interface ThemeClusterView {
  theme: EventTheme;
  posts: EventPost[];
  cited: EventPost[];
  media: Array<{
    key: string;
    post: EventPost;
    url: string;
    alt: string;
    type: string;
  }>;
  mix: Record<EventPlatform, number>;
}

interface AtlasNode {
  themeId: string;
  label: string;
  count: number;
  x: number;
  y: number;
  width: number;
  mix: Record<EventPlatform, number>;
  index: number;
}

interface AtlasLink {
  source: AtlasNode;
  target: AtlasNode;
  similarity: number;
}

function ThemeLens({
  themes,
  posts,
  selectedTheme,
  onSelect,
}: {
  themes: EventTheme[];
  posts: EventPost[];
  selectedTheme: string | null;
  onSelect: (themeId: string) => void;
}) {
  if (!themes.length) {
    return <p className="mt-8 font-caption text-sm text-ink-dim">no clusters yet</p>;
  }
  const clusters = buildThemeClusters(themes, posts);
  return (
    <div className="mt-4 grid gap-4">
      <ClusterAtlas clusters={clusters} selectedTheme={selectedTheme} onSelect={onSelect} />
      {clusters.map(({ theme, cited, media, mix }) => {
        return (
          <button
            key={theme.themeId}
            data-testid="theme-card"
            onClick={() => onSelect(theme.themeId)}
            className={`overflow-hidden rounded-md border text-left transition ${
              selectedTheme === theme.themeId
                ? 'border-accent bg-accent/10'
                : 'border-border-soft bg-surface-base hover:border-accent'
            }`}
          >
            {media.length ? (
              <div className="grid grid-cols-4 gap-px bg-border-soft">
                {media.slice(0, 4).map((item) => (
                  <img
                    key={`${theme.themeId}:${item.key}`}
                    src={item.url}
                    alt={item.alt}
                    className="aspect-[4/3] w-full bg-surface-panel object-cover"
                    loading="lazy"
                  />
                ))}
              </div>
            ) : null}
            <div className="p-4">
              <div className="flex items-center gap-2">
                <Sparkles size={15} strokeWidth={1.75} className="text-accent" />
                <h3 className="font-display text-base">{theme.label}</h3>
                <Chip size="sm" tone="neutral" className="ml-auto">
                  {theme.postIds.length} refs
                </Chip>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {Object.entries(mix).filter(([, count]) => count > 0).map(([name, count]) => (
                  <Chip key={name} size="sm" tone={platformTone(name as EventPlatform)}>
                    {name} {count}
                  </Chip>
                ))}
              </div>
              <p className="mt-3 text-sm leading-6 text-ink-muted">{theme.summary}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {theme.keywords.slice(0, 6).map((keyword) => (
                  <Chip key={keyword} size="sm" tone="neutral">
                    {keyword}
                  </Chip>
                ))}
              </div>
              <div className="mt-4 grid gap-2">
                {cited.slice(0, 3).map((post) => (
                  <p key={post.postId} className="font-caption text-xs leading-5 text-ink-dim">
                    [{post.platform}] {post.authorHandle ?? post.authorName}: {post.text.slice(0, 140)}
                    {post.text.length > 140 ? '...' : ''}
                  </p>
                ))}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function buildThemeClusters(themes: EventTheme[], posts: EventPost[]): ThemeClusterView[] {
  const postById = new Map(posts.map((post) => [post.postId, post]));
  return themes.map((theme) => {
    const clusterPosts = theme.postIds
      .map((postId) => postById.get(postId))
      .filter(Boolean) as EventPost[];
    const scoredPosts = clusterPosts
      .map((post) => ({ post, evidenceScore: themeEvidenceScore(theme, post) }))
      .sort(
        (a, b) =>
          b.evidenceScore - a.evidenceScore ||
          b.post.reachScore - a.post.reachScore
      );
    const cited = scoredPosts.map(({ post }) => post).slice(0, 8);
    const media = uniqueMediaItems(
      scoredPosts
        .filter(({ evidenceScore }) => evidenceScore > 0)
        .flatMap(({ post, evidenceScore }) =>
          (post.media ?? [])
            .map((item) => ({
              key: mediaAssetKey(item),
              post,
              evidenceScore,
              url: mediaDisplayUrl(post, item),
              alt: item.altText ?? post.authorHandle ?? post.authorName,
              type: item.type,
            }))
            .filter(isRenderableMedia)
        )
    ).sort(
      (a, b) =>
        b.evidenceScore - a.evidenceScore ||
        b.post.reachScore - a.post.reachScore
    );
    return {
      theme,
      posts: clusterPosts,
      cited,
      media,
      mix: platformMix(clusterPosts),
    };
  });
}

function themeEvidenceScore(theme: EventTheme, post: EventPost): number {
  const text = `${post.authorName} ${post.authorHandle ?? ''} ${post.text}`.toLowerCase();
  const phraseTerms = [theme.label, ...theme.keywords]
    .map((term) => term.toLowerCase().trim())
    .filter((term) => term.length >= 4 && !isThemeMediaStopword(term));
  const tokenTerms = clusterTerms(
    `${theme.label} ${theme.summary} ${theme.keywords.join(' ')}`
  ).filter((term) => !isThemeMediaStopword(term));

  let score = 0;
  for (const phrase of phraseTerms) {
    if (!text.includes(phrase)) continue;
    score += phrase.includes(' ') ? 4 : 3;
  }
  for (const term of tokenTerms) {
    if (text.includes(term)) score += 1;
  }
  return score;
}

function isThemeMediaStopword(term: string): boolean {
  return LOCAL_STOPWORDS.has(term) || THEME_MEDIA_EXTRA_STOPWORDS.has(term);
}

const THEME_MEDIA_EXTRA_STOPWORDS = new Set([
  'aiengineer',
  'aiengineersingapore',
  'conference',
  'days',
  'everyone',
  'folks',
  'great',
  'singapore',
  'talks',
  'weekend',
]);

function ClusterAtlas({
  clusters,
  selectedTheme,
  onSelect,
}: {
  clusters: ThemeClusterView[];
  selectedTheme: string | null;
  onSelect: (themeId: string) => void;
}) {
  const totalRefs = clusters.reduce((sum, cluster) => sum + cluster.posts.length, 0);
  const atlas = buildAtlasLayout(clusters);
  return (
    <div className="rounded-md border border-border-soft bg-surface-base p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Sparkles size={15} strokeWidth={1.75} className="text-accent" />
        <h2 className="font-display text-base">cluster atlas</h2>
        <span className="ml-auto font-mono text-xs text-ink-dim">
          {totalRefs} primary refs mapped
        </span>
      </div>

      <div
        data-testid="cluster-distance-map"
        className="relative mt-3 h-[520px] overflow-hidden rounded-md border border-border-soft bg-surface-panel"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full text-border-soft"
        >
          {atlas.links.map((link) => (
            <line
              key={`${link.source.themeId}:${link.target.themeId}`}
              x1={link.source.x * 100}
              y1={link.source.y * 100}
              x2={link.target.x * 100}
              y2={link.target.y * 100}
              className="stroke-current"
              strokeWidth={Math.max(0.25, link.similarity * 2.4)}
              opacity={Math.min(0.75, 0.18 + link.similarity)}
            />
          ))}
        </svg>
        {atlas.nodes.map((node) => {
          const active = selectedTheme === node.themeId;
          return (
            <button
              key={`atlas:${node.themeId}`}
              data-testid="cluster-atlas-card"
              onClick={() => onSelect(node.themeId)}
              style={{
                left: `${node.x * 100}%`,
                top: `${node.y * 100}%`,
                width: `${node.width}px`,
              }}
              className={`absolute min-h-24 -translate-x-1/2 -translate-y-1/2 rounded-md border p-3 text-left shadow-sm transition ${
                active
                  ? 'border-accent bg-accent/10'
                  : 'border-border-soft bg-surface-base/95 hover:border-accent'
              }`}
            >
              <div className="flex items-start gap-2">
                <span
                  className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${clusterAccent(node.index)}`}
                />
                <h3 className="min-w-0 flex-1 break-words font-display text-sm leading-5">
                  {node.label}
                </h3>
                <span className="font-mono text-xs text-ink-dim">{node.count}</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {Object.entries(node.mix)
                  .filter(([, count]) => count > 0)
                  .map(([name, count]) => (
                    <Chip key={name} size="sm" tone={platformTone(name as EventPlatform)}>
                      {name} {count}
                    </Chip>
                  ))}
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-3 grid gap-2 text-xs md:grid-cols-2">
        <AtlasPairs title="shared signals" note="clusters with overlapping language and refs" pairs={atlas.closest} />
        <AtlasPairs title="distinct threads" note="separate pockets of the conversation" pairs={atlas.farthest} />
      </div>
    </div>
  );
}

function AtlasPairs({
  title,
  note,
  pairs,
}: {
  title: string;
  note: string;
  pairs: Array<{ source: AtlasNode; target: AtlasNode; similarity: number }>;
}) {
  return (
    <div className="rounded-sm border border-border-soft bg-surface-panel p-2">
      <p className="font-caption text-2xs uppercase text-ink-dim">{title}</p>
      <p className="mt-1 font-caption text-2xs leading-4 text-ink-dim">{note}</p>
      <div className="mt-2 grid gap-1.5">
        {pairs.map((pair) => (
          <p
            key={`${title}:${pair.source.themeId}:${pair.target.themeId}`}
            className="font-mono text-2xs leading-5 text-ink-muted"
          >
            {pair.source.label} + {pair.target.label}{' '}
            <span className="text-ink-dim">{Math.round(pair.similarity * 100)}%</span>
          </p>
        ))}
      </div>
    </div>
  );
}

function buildAtlasLayout(clusters: ThemeClusterView[]): {
  nodes: AtlasNode[];
  links: AtlasLink[];
  closest: AtlasLink[];
  farthest: AtlasLink[];
} {
  const vectors = buildClusterVectors(clusters);
  const maxRefs = Math.max(...clusters.map((cluster) => cluster.posts.length), 1);
  const nodes: AtlasNode[] = clusters.map((cluster, index) => {
    const angle = (index / Math.max(1, clusters.length)) * Math.PI * 2 - Math.PI / 2;
    const radius = 0.34;
    return {
      themeId: cluster.theme.themeId,
      label: cluster.theme.label,
      count: cluster.posts.length,
      x: 0.5 + Math.cos(angle) * radius,
      y: 0.5 + Math.sin(angle) * radius,
      width: 170 + Math.round((cluster.posts.length / maxRefs) * 42),
      mix: cluster.mix,
      index,
    };
  });

  const pairs: AtlasLink[] = [];
  for (let left = 0; left < nodes.length; left++) {
    for (let right = left + 1; right < nodes.length; right++) {
      pairs.push({
        source: nodes[left],
        target: nodes[right],
        similarity: vectorSimilarity(vectors[left], vectors[right]),
      });
    }
  }

  for (let step = 0; step < 240; step++) {
    for (const pair of pairs) {
      const dx = pair.target.x - pair.source.x;
      const dy = pair.target.y - pair.source.y;
      const distance = Math.max(0.001, Math.sqrt(dx * dx + dy * dy));
      const targetDistance = 0.18 + (1 - pair.similarity) * 0.62;
      const force = (distance - targetDistance) * 0.018;
      const moveX = (dx / distance) * force;
      const moveY = (dy / distance) * force;
      pair.source.x += moveX;
      pair.source.y += moveY;
      pair.target.x -= moveX;
      pair.target.y -= moveY;
    }
    for (const node of nodes) {
      node.x += (0.5 - node.x) * 0.004;
      node.y += (0.5 - node.y) * 0.004;
      node.x = clamp(node.x, 0.14, 0.86);
      node.y = clamp(node.y, 0.12, 0.88);
    }
  }

  const ranked = [...pairs].sort((a, b) => b.similarity - a.similarity);
  const links = ranked
    .filter((pair) => pair.similarity > 0.04)
    .slice(0, Math.min(12, Math.max(5, clusters.length + 2)));

  return {
    nodes,
    links,
    closest: ranked.slice(0, 3),
    farthest: [...ranked].reverse().slice(0, 3),
  };
}

function buildClusterVectors(clusters: ThemeClusterView[]): Array<Map<string, number>> {
  const documents = clusters.map((cluster) =>
    clusterTerms(
      [
        cluster.theme.label,
        cluster.theme.summary,
        cluster.theme.keywords.join(' '),
        cluster.theme.keywords.join(' '),
        cluster.posts
          .slice(0, 80)
          .map((post) => `${post.authorHandle ?? post.authorName} ${post.text}`)
          .join(' '),
      ].join(' ')
    )
  );
  const documentFrequency = new Map<string, number>();
  for (const terms of documents) {
    for (const term of new Set(terms)) {
      documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
    }
  }

  return documents.map((terms) => {
    const counts = new Map<string, number>();
    for (const term of terms) counts.set(term, (counts.get(term) ?? 0) + 1);
    const weighted = Array.from(counts.entries())
      .map(([term, count]) => {
        const idf = Math.log(1 + documents.length / (1 + (documentFrequency.get(term) ?? 1)));
        return [term, Math.log1p(count) * idf] as const;
      })
      .sort((a, b) => b[1] - a[1])
      .slice(0, 80);
    return normalizeMap(new Map(weighted));
  });
}

function TimelineLens({ posts }: { posts: EventPost[] }) {
  const groups = timelineGroups(posts);
  if (!groups.length) {
    return <p className="mt-8 font-caption text-sm text-ink-dim">no dated references yet</p>;
  }
  const maxCount = Math.max(...groups.map((group) => group.posts.length), 1);
  return (
    <div className="mt-5 space-y-4">
      {groups.map((group) => {
        const mix = platformMix(group.posts);
        const width = `${Math.max(8, Math.round((group.posts.length / maxCount) * 100))}%`;
        const highlights = [...group.posts]
          .sort((a, b) => b.reachScore - a.reachScore)
          .slice(0, 3);
        return (
          <article
            key={group.day}
            className="rounded-md border border-border-soft bg-surface-base p-4"
          >
            <div className="flex flex-wrap items-center gap-2">
              <CalendarDays size={15} strokeWidth={1.75} className="text-accent" />
              <h3 className="font-display text-base">{formatTimelineDay(group.day)}</h3>
              <Chip size="sm" tone="neutral" className="ml-auto">
                {group.posts.length} refs
              </Chip>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-pill bg-surface-panel">
              <div className="h-full rounded-pill bg-accent" style={{ width }} />
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {Object.entries(mix).filter(([, count]) => count > 0).map(([name, count]) => (
                <Chip key={name} size="sm" tone={platformTone(name as EventPlatform)}>
                  {name} {count}
                </Chip>
              ))}
            </div>
            <div className="mt-4 grid gap-3">
              {highlights.map((post) => (
                <div
                  key={post.postId}
                  className="rounded-sm border border-border-soft bg-surface-panel px-3 py-2 hover:border-accent"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Chip size="sm" tone={platformTone(post.platform)}>
                      {post.platform}
                    </Chip>
                    <span className="font-mono text-xs text-ink-dim">
                      {post.authorHandle ?? post.authorName}
                    </span>
                    <ScoreBadge value={post.reachScore} className="ml-auto" />
                    <a
                      href={post.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-ink-dim hover:text-accent"
                      aria-label="open timeline reference"
                    >
                      <ExternalLink size={14} strokeWidth={1.75} />
                    </a>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-ink-muted">
                    {post.text.slice(0, 220)}
                    {post.text.length > 220 ? '...' : ''}
                  </p>
                </div>
              ))}
            </div>
          </article>
        );
      })}
    </div>
  );
}

function VoiceLens({ voices }: { voices: EventVoice[] }) {
  if (!voices.length) {
    return <p className="mt-8 font-caption text-sm text-ink-dim">no voices yet</p>;
  }
  return (
    <div className="mt-4 divide-y divide-border-soft">
      {voices.map((voice) => (
        <article key={voice.voiceId} className="flex items-center gap-4 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-sm border border-border-soft bg-surface-base text-ink-muted">
            <Users size={16} strokeWidth={1.75} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="min-w-0 break-words font-display text-sm">{voice.name}</h3>
              <Chip size="sm" tone={platformTone(voice.platform)}>
                {voice.platform}
              </Chip>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-1 gap-y-1 break-words font-mono text-xs text-ink-dim">
              {voice.handle ?? voice.profileUrl ?? 'profile'} · {voice.postCount} posts ·{' '}
              <ScoreBadge value={voice.reachScore} subject="voice" />
            </div>
          </div>
          {voice.samplePostUrls[0] ?? voice.profileUrl ? (
            <a
              href={voice.samplePostUrls[0] ?? voice.profileUrl}
              target="_blank"
              rel="noreferrer"
              className="text-ink-dim hover:text-accent"
              aria-label="open voice reference"
            >
              <ExternalLink size={14} strokeWidth={1.75} />
            </a>
          ) : null}
        </article>
      ))}
    </div>
  );
}

function platformTone(platform: EventPlatform): ChipTone {
  if (platform === 'x') return 'info';
  if (platform === 'youtube') return 'warn';
  return 'secondary';
}

function platformBar(platform: EventPlatform): string {
  if (platform === 'x') return 'bg-signal-info';
  if (platform === 'youtube') return 'bg-signal-warn';
  return 'bg-accent-secondary';
}

function metricEntries(metrics: EventPost['metrics']): Array<[string, number]> {
  return ([
    ['likes', metrics.likes],
    ['reactions', metrics.reactions],
    ['reposts', metrics.reposts],
    ['replies', metrics.replies],
    ['comments', metrics.comments],
    ['views', metrics.views],
    ['impressions', metrics.impressions],
  ] as Array<[string, number | undefined]>).filter(
    (entry): entry is [string, number] => typeof entry[1] === 'number'
  );
}

function numberOrBlank(value?: number): string | undefined {
  return typeof value === 'number' ? value.toLocaleString('en-SG') : undefined;
}

type PostMediaItem = NonNullable<EventPost['media']>[number];

function isRenderableMedia<T extends { url: string; type: string }>(item: T): boolean {
  return Boolean(
    item.url &&
      (item.type === 'image' ||
        item.type === 'gif' ||
        item.url.includes('pbs.twimg.com') ||
        item.url.includes('i.ytimg.com'))
  );
}

function uniqueMediaItems<T extends { key: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (!item.key || seen.has(item.key)) return false;
    seen.add(item.key);
    return true;
  });
}

function mediaAssetKey(item: PostMediaItem): string {
  return normalizeMediaIdentity(item.previewUrl ?? item.url ?? item.localPath ?? '');
}

function mediaDisplayUrl(post: EventPost, item: PostMediaItem): string {
  if (process.env.NODE_ENV === 'production') return item.previewUrl ?? item.url;
  const localUrl = localImageMediaUrl(post.eventId, item);
  return localUrl ?? item.previewUrl ?? item.url;
}

function localImageMediaUrl(eventId: string, item: PostMediaItem): string | undefined {
  if (!item.localPath || !isLocalImageMedia(item)) return undefined;
  const marker = '/outputs/';
  const index = item.localPath.indexOf(marker);
  if (index < 0) return undefined;
  const relativePath = item.localPath.slice(index + marker.length);
  if (!relativePath.includes('/media/')) return undefined;
  return `/api/events/${encodeURIComponent(eventId)}/media?path=${encodeURIComponent(relativePath)}`;
}

function isLocalImageMedia(item: PostMediaItem): boolean {
  if (item.contentType?.startsWith('image/')) return true;
  return /\.(jpe?g|png|webp|gif|avif)$/i.test(item.localPath ?? '');
}

function normalizeMediaIdentity(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  try {
    const url = new URL(trimmed);
    url.hash = '';
    url.search = '';
    if (url.hostname.includes('media.licdn.com')) {
      const parts = url.pathname.split('/').filter(Boolean);
      const versionIndex = parts.indexOf('v2');
      const assetId = versionIndex >= 0 ? parts[versionIndex + 1] : undefined;
      if (assetId) return `${url.hostname.toLowerCase()}/${assetId}`;
    }
    return `${url.hostname.toLowerCase()}${url.pathname.replace(/\/+$/, '')}`;
  } catch {
    return trimmed.split('#')[0].split('?')[0].toLowerCase();
  }
}

function mediaWallStart(total: number, page: number): number {
  if (total <= MEDIA_WALL_PAGE_SIZE) return 0;
  return Math.min(page * MEDIA_WALL_PAGE_SIZE, Math.max(0, total - MEDIA_WALL_PAGE_SIZE));
}

function summarizeVibes(
  posts: EventPost[],
  themes: EventTheme[],
  voices: EventVoice[]
): VibeStats {
  const rootRefs = posts.filter((post) => !isReplyPost(post)).length;
  const contextRefs = posts.length - rootRefs;
  const platformMix = platformMixFromPosts(posts);
  const knownViews = posts.reduce(
    (sum, post) =>
      sum +
      (post.platform === 'linkedin' ? 0 : (post.metrics.views ?? post.metrics.impressions ?? 0)),
    0
  );
  const reactions = posts.reduce(
    (sum, post) => sum + (post.metrics.likes ?? 0) + (post.metrics.reactions ?? 0),
    0
  );
  const comments = posts.reduce(
    (sum, post) => sum + (post.metrics.comments ?? 0) + (post.metrics.replies ?? 0),
    0
  );
  const reposts = posts.reduce((sum, post) => sum + (post.metrics.reposts ?? 0), 0);
  const mediaItems = posts.reduce((sum, post) => sum + (post.media?.length ?? 0), 0);
  const mediaPosts = posts.filter((post) => post.media?.length).length;
  const localMediaItems = posts.reduce(
    (sum, post) => sum + (post.media ?? []).filter((media) => media.localPath).length,
    0
  );
  const media = uniqueMediaItems(
    posts
      .flatMap((post) =>
        (post.media ?? []).map((item) => ({
          key: mediaAssetKey(item),
          url: mediaDisplayUrl(post, item),
          postUrl: post.url,
          alt: item.altText ?? post.authorHandle ?? post.authorName,
          platform: post.platform,
          postId: post.postId,
          reachScore: post.reachScore,
          type: item.type,
        }))
      )
      .filter(isRenderableMedia)
  )
    .sort((a, b) => b.reachScore - a.reachScore)
    .map(({ key, url, postUrl, alt, platform, postId }) => ({
      key,
      url,
      postUrl,
      alt,
      platform,
      postId,
    }));

  return {
    rootRefs,
    contextRefs,
    totalRefs: posts.length,
    voices: voices.length,
    clusters: themes.length,
    knownViews,
    reactions,
    comments,
    reposts,
    mediaItems,
    mediaPosts,
    localMediaItems,
    platformMix,
    sentiment: sentimentCounts(posts),
    media,
  };
}

function sentimentCounts(posts: EventPost[]): Array<{ label: string; count: number }> {
  const labels = ['positive', 'neutral', 'mixed', 'negative'];
  return labels
    .map((label) => ({
      label,
      count: posts.filter((post) => post.tags.includes(`sentiment:${label}`)).length,
    }))
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count);
}

function platformMixFromPosts(posts: EventPost[]): Record<EventPlatform, number> {
  return posts.reduce<Record<EventPlatform, number>>(
    (acc, post) => {
      acc[post.platform] += 1;
      return acc;
    },
    { x: 0, linkedin: 0, youtube: 0 }
  );
}

function formatCompact(value: number): string {
  return new Intl.NumberFormat('en-SG', {
    notation: 'compact',
    maximumFractionDigits: value >= 1000 ? 1 : 0,
  }).format(value);
}

function truncateText(value: string, maxLength: number): string {
  const compact = value.replace(/\s+/g, ' ').trim();
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, maxLength - 1).trim()}...`;
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function clusterAccent(index: number): string {
  const accents = [
    'bg-accent',
    'bg-accent-secondary',
    'bg-signal-info',
    'bg-signal-warn',
    'bg-signal-ok',
  ];
  return accents[index % accents.length];
}

const LOCAL_STOPWORDS = new Set([
  'about',
  'after',
  'again',
  'also',
  'and',
  'are',
  'but',
  'can',
  'day',
  'engineer',
  'event',
  'for',
  'from',
  'have',
  'https',
  'singapore',
  'summit',
  'that',
  'the',
  'this',
  'was',
  'with',
  'you',
  'your',
]);

function clusterTerms(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length >= 3 && !LOCAL_STOPWORDS.has(word));
}

function normalizeMap(vector: Map<string, number>): Map<string, number> {
  const norm = Math.sqrt(Array.from(vector.values()).reduce((sum, value) => sum + value ** 2, 0));
  if (!norm) return vector;
  for (const [term, value] of vector) vector.set(term, value / norm);
  return vector;
}

function vectorSimilarity(left: Map<string, number>, right: Map<string, number>): number {
  let score = 0;
  const [small, large] = left.size <= right.size ? [left, right] : [right, left];
  for (const [term, value] of small) score += value * (large.get(term) ?? 0);
  return clamp(score, 0, 1);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function isIrrelevantPost(post: EventPost): boolean {
  return post.tags.includes('irrelevant:event');
}

function isReplyPost(post: EventPost): boolean {
  const tags = post.tags.map((tag) => tag.toLowerCase());
  return (
    tags.includes('x-reply') ||
    tags.includes('linkedin-comment') ||
    tags.includes('youtube-comment') ||
    tags.includes('comment') ||
    post.url.includes('#comment-') ||
    (post.platform === 'youtube' && post.url.includes('&lc='))
  );
}

function platformMix(posts: EventPost[]): Record<EventPlatform, number> {
  return posts.reduce<Record<EventPlatform, number>>(
    (acc, post) => {
      acc[post.platform] += 1;
      return acc;
    },
    { x: 0, linkedin: 0, youtube: 0 }
  );
}

function timelineGroups(posts: EventPost[]): Array<{ day: string; posts: EventPost[] }> {
  const byDay = new Map<string, EventPost[]>();
  for (const post of posts) {
    const value = post.postedAt ?? post.capturedAt ?? post.updatedAt;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) continue;
    const day = date.toISOString().slice(0, 10);
    const group = byDay.get(day) ?? [];
    group.push(post);
    byDay.set(day, group);
  }
  return Array.from(byDay.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([day, group]) => ({ day, posts: group }));
}

function dateRange(posts: EventPost[]): { start: string; end: string } | null {
  const values = posts
    .map((post) => post.postedAt ?? post.capturedAt ?? post.updatedAt)
    .map((value) => new Date(value))
    .filter((date) => !Number.isNaN(date.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());
  if (!values.length) return null;
  return {
    start: values[0].toISOString(),
    end: values[values.length - 1].toISOString(),
  };
}

function sourceSummary(posts: EventPost[]): Array<{ label: string; count: number }> {
  const buckets = [
    {
      label: 'X API',
      count: posts.filter((post) => post.tags.includes('x-api')).length,
    },
    {
      label: 'LinkedIn Apify',
      count: posts.filter((post) => post.tags.includes('apify-linkedin')).length,
    },
    {
      label: 'LinkedIn fetch',
      count: posts.filter((post) => post.tags.includes('linkedin-fetch')).length,
    },
    {
      label: 'YouTube',
      count: posts.filter((post) => post.platform === 'youtube').length,
    },
  ];
  return buckets.filter((bucket) => bucket.count > 0);
}

function formatTimelineDay(day: string): string {
  return new Intl.DateTimeFormat('en-SG', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(`${day}T00:00:00.000Z`));
}

function formatDateTime(value: string | number): string {
  return new Intl.DateTimeFormat('en-SG', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-SG', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value));
}
