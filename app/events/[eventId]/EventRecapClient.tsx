'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ExternalLink,
  Filter,
  MessageSquareText,
  RefreshCw,
  Search,
  Sparkles,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Surface } from '@/components/ui/Surface';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import type {
  EventPlatform,
  EventPost,
  EventRecapBundle,
  EventTheme,
  EventVoice,
} from '@/lib/research/event-recap/types';

type Lens = 'posts' | 'themes' | 'voices';
type PlatformFilter = 'all' | EventPlatform;

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
  const [lens, setLens] = useState<Lens>('posts');
  const [platform, setPlatform] = useState<PlatformFilter>('all');
  const [query, setQuery] = useState('');
  const [selectedTheme, setSelectedTheme] = useState<string | null>(null);
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
    setAnswer(lines.length ? lines.join('\n') : 'No matching posts in the corpus yet.');
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
  }, [bundle?.posts, bundle?.themes, platform, query, selectedTheme]);

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

      <section className="mx-auto grid max-w-7xl gap-5 px-6 py-6 xl:grid-cols-[280px_1fr_320px]">
        <Surface
          as="aside"
          taxonomy="input"
          border="soft"
          className="h-fit p-4"
        >
          <p className="font-caption text-xs text-ink-dim">event</p>
          <h1 className="mt-2 font-display text-2xl tracking-tight">
            {event?.canonicalName ?? event?.name ?? eventId}
          </h1>
          <div className="mt-4 space-y-2 font-caption text-xs text-ink-dim">
            <p>{event?.location ?? 'location pending'}</p>
            <p>
              {event?.startsAt ? formatDate(event.startsAt) : 'date pending'}
              {event?.endsAt ? ` to ${formatDate(event.endsAt)}` : ''}
            </p>
            <p>
              {event?.daysBefore ?? 1}d before · {event?.daysAfter ?? 3}d after
            </p>
            <p>{event?.refreshIntervalHours ?? 6}h refresh</p>
          </div>

          <div className="mt-5 flex flex-wrap gap-1.5">
            {(event?.querySet ?? []).map((q) => (
              <Chip key={q} size="sm" tone="neutral">
                {q}
              </Chip>
            ))}
          </div>

          {latestRun?.streamingUrls.length ? (
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
        </Surface>

        <Surface as="section" taxonomy="output" border="soft" className="min-h-[70vh] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-soft pb-3">
            <div className="flex items-center gap-2">
              <LensButton active={lens === 'posts'} onClick={() => setLens('posts')}>
                all posts
              </LensButton>
              <LensButton active={lens === 'themes'} onClick={() => setLens('themes')}>
                themes
              </LensButton>
              <LensButton active={lens === 'voices'} onClick={() => setLens('voices')}>
                voices
              </LensButton>
            </div>
            <div className="flex items-center gap-2">
              <Filter size={14} className="text-ink-dim" strokeWidth={1.75} />
              {(['all', 'x', 'linkedin'] as const).map((p) => (
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

          <div className="mt-4 flex items-center gap-2 rounded-md border border-border-soft bg-surface-base px-3 py-2">
            <Search size={15} strokeWidth={1.75} className="text-ink-dim" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="search corpus"
              className="w-full bg-transparent font-mono text-sm text-ink outline-none placeholder:text-ink-dim"
            />
          </div>

          {loading ? (
            <p className="mt-8 font-caption text-sm text-ink-dim">loading recap...</p>
          ) : error ? (
            <p className="mt-8 font-caption text-sm text-signal-error">{error}</p>
          ) : lens === 'themes' ? (
            <ThemeLens
              themes={bundle?.themes ?? []}
              posts={bundle?.posts ?? []}
              selectedTheme={selectedTheme}
              onSelect={(id) => {
                setSelectedTheme(id === selectedTheme ? null : id);
                setLens('posts');
              }}
            />
          ) : lens === 'voices' ? (
            <VoiceLens voices={bundle?.voices ?? []} />
          ) : (
            <PostList posts={filteredPosts} />
          )}
        </Surface>

        <Surface as="aside" taxonomy="tool" border="soft" className="h-fit p-4">
          <div className="flex items-center gap-2">
            <MessageSquareText size={16} strokeWidth={1.75} className="text-accent" />
            <h2 className="font-display text-base tracking-tight">ask the corpus</h2>
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
            query posts
          </Button>
          {answer && (
            <pre className="mt-4 whitespace-pre-wrap rounded-md border border-border-soft bg-surface-base p-3 font-mono text-xs leading-5 text-ink-muted">
              {answer}
            </pre>
          )}

          <div className="mt-5 grid grid-cols-3 gap-2 text-center">
            <Metric label="posts" value={bundle?.posts.length ?? 0} />
            <Metric label="themes" value={bundle?.themes.length ?? 0} />
            <Metric label="voices" value={bundle?.voices.length ?? 0} />
          </div>

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

function PostList({ posts }: { posts: EventPost[] }) {
  if (!posts.length) {
    return <p className="mt-8 font-caption text-sm text-ink-dim">no posts yet</p>;
  }
  return (
    <div className="mt-4 divide-y divide-border-soft">
      {posts.map((post) => (
        <article key={post.postId} className="py-4">
          <div className="flex flex-wrap items-center gap-2">
            <Chip tone={post.platform === 'x' ? 'info' : 'secondary'} size="sm">
              {post.platform}
            </Chip>
            <span className="font-mono text-xs text-ink-dim">
              {post.authorHandle ?? post.authorName}
            </span>
            <span className="font-mono text-xs text-ink-dim">
              reach {post.reachScore.toFixed(2)}
            </span>
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
          <p className="mt-3 text-sm leading-6 text-ink">{post.text}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {post.tags.map((tag) => (
              <Chip key={tag} size="sm" tone="neutral" variant="ghost">
                {tag}
              </Chip>
            ))}
          </div>
        </article>
      ))}
    </div>
  );
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
    return <p className="mt-8 font-caption text-sm text-ink-dim">no themes yet</p>;
  }
  return (
    <div className="mt-4 grid gap-3">
      {themes.map((theme) => {
        const cited = theme.postIds
          .map((postId) => posts.find((post) => post.postId === postId))
          .filter(Boolean)
          .slice(0, 4) as EventPost[];
        return (
          <button
            key={theme.themeId}
            onClick={() => onSelect(theme.themeId)}
            className={`rounded-md border p-4 text-left transition ${
              selectedTheme === theme.themeId
                ? 'border-accent bg-accent/10'
                : 'border-border-soft bg-surface-base hover:border-accent'
            }`}
          >
            <div className="flex items-center gap-2">
              <Sparkles size={15} strokeWidth={1.75} className="text-accent" />
              <h3 className="font-display text-base">{theme.label}</h3>
              <Chip size="sm" tone="neutral" className="ml-auto">
                {theme.postIds.length} posts
              </Chip>
            </div>
            <p className="mt-2 text-sm leading-6 text-ink-muted">{theme.summary}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {theme.keywords.slice(0, 8).map((keyword) => (
                <Chip key={keyword} size="sm" tone="neutral">
                  {keyword}
                </Chip>
              ))}
            </div>
            <div className="mt-3 grid gap-2">
              {cited.map((post) => (
                <p key={post.postId} className="font-caption text-xs leading-5 text-ink-dim">
                  [{post.platform}] {post.authorHandle ?? post.authorName}: {post.text.slice(0, 150)}
                  {post.text.length > 150 ? '...' : ''}
                </p>
              ))}
            </div>
          </button>
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
              <h3 className="font-display text-sm">{voice.name}</h3>
              <Chip size="sm" tone={voice.platform === 'x' ? 'info' : 'secondary'}>
                {voice.platform}
              </Chip>
            </div>
            <p className="mt-1 font-mono text-xs text-ink-dim">
              {voice.handle ?? voice.profileUrl ?? 'profile'} · {voice.postCount} posts · reach{' '}
              {voice.reachScore.toFixed(2)}
            </p>
          </div>
          {voice.profileUrl ? (
            <a
              href={voice.profileUrl}
              target="_blank"
              rel="noreferrer"
              className="text-ink-dim hover:text-accent"
              aria-label="open profile"
            >
              <ExternalLink size={14} strokeWidth={1.75} />
            </a>
          ) : null}
        </article>
      ))}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-sm border border-border-soft bg-surface-base px-2 py-2">
      <p className="font-display text-lg">{value}</p>
      <p className="font-caption text-2xs uppercase text-ink-dim">{label}</p>
    </div>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-SG', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value));
}
