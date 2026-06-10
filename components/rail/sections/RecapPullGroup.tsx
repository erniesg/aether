'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, Download, Loader2 } from 'lucide-react';
import { addReference } from '@/lib/references/store';
import { fetchRecapBundle, type RecapPullBundle } from '@/lib/research/recap-client';
import { useRecapSubjects } from '@/lib/research/recap-subjects';
import {
  bundleToReferences,
  themeToReferences,
} from '@/lib/research/recap-to-references';
import { cn } from '@/lib/utils/cn';

/**
 * Recaps group inside the Research rail section. One row per researched
 * subject (event / brand / product / topic); expanding fetches its bundle
 * and exposes per-theme pulls. Pulling converts the theme's strongest media
 * evidence into pinned references via the recap-to-references adapter.
 */

type BundleState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; bundle: RecapPullBundle };

export function RecapPullGroup({ workspaceId }: { workspaceId?: string }) {
  const subjects = useRecapSubjects(workspaceId);
  const [openId, setOpenId] = useState<string | null>(null);
  const [bundles, setBundles] = useState<Record<string, BundleState>>({});
  const [pulled, setPulled] = useState<Record<string, number>>({});

  const toggle = async (eventId: string) => {
    if (openId === eventId) {
      setOpenId(null);
      return;
    }
    setOpenId(eventId);
    if (bundles[eventId]?.kind === 'ready') return;
    setBundles((prev) => ({ ...prev, [eventId]: { kind: 'loading' } }));
    try {
      const bundle = await fetchRecapBundle(eventId);
      setBundles((prev) => ({ ...prev, [eventId]: { kind: 'ready', bundle } }));
    } catch (err) {
      setBundles((prev) => ({
        ...prev,
        [eventId]: {
          kind: 'error',
          message: err instanceof Error ? err.message : String(err),
        },
      }));
    }
  };

  const pullTheme = (eventId: string, themeId: string, bundle: RecapPullBundle) => {
    const theme = bundle.themes.find((t) => t.themeId === themeId);
    if (!theme) return;
    const records = themeToReferences({ theme, posts: bundle.posts });
    for (const record of records) addReference(record, workspaceId);
    setPulled((prev) => ({ ...prev, [`${eventId}:${themeId}`]: records.length }));
  };

  const pullAll = (eventId: string, bundle: RecapPullBundle) => {
    const records = bundleToReferences(bundle);
    for (const record of records) addReference(record, workspaceId);
    setPulled((prev) => ({ ...prev, [`${eventId}:*`]: records.length }));
  };

  return (
    <section className="flex flex-col gap-1.5" data-testid="recap-pull-group">
      <span className="font-caption text-ink-dim">recaps</span>
      {subjects.length === 0 ? (
        <span
          data-testid="recap-pull-empty"
          className="font-caption text-xs text-ink-faint"
        >
          run a vibes recap to pull signals
        </span>
      ) : (
        <ul className="flex flex-col gap-1">
          {subjects.map((subject) => {
            const open = openId === subject.eventId;
            const state = bundles[subject.eventId];
            return (
              <li key={subject.eventId} className="flex flex-col gap-1">
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => void toggle(subject.eventId)}
                  className="flex items-center justify-between gap-2 rounded-sm border border-border-soft bg-surface-panel-muted px-2 py-1 text-left font-caption text-xs text-ink transition-colors hover:border-accent"
                >
                  <span className="truncate">{subject.name}</span>
                  {open ? (
                    <ChevronDown size={12} aria-hidden="true" />
                  ) : (
                    <ChevronRight size={12} aria-hidden="true" />
                  )}
                </button>
                {open && state?.kind === 'loading' ? (
                  <span className="flex items-center gap-1 px-2 font-caption text-xs text-ink-faint">
                    <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                    loading themes
                  </span>
                ) : null}
                {open && state?.kind === 'error' ? (
                  <span
                    role="alert"
                    className="rounded-sm border border-border-soft bg-surface-panel-muted px-2 py-1 font-caption text-xs text-ink-dim"
                  >
                    {state.message}
                  </span>
                ) : null}
                {open && state?.kind === 'ready' ? (
                  <ThemeList
                    eventId={subject.eventId}
                    bundle={state.bundle}
                    pulled={pulled}
                    onPullTheme={pullTheme}
                    onPullAll={pullAll}
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function ThemeList({
  eventId,
  bundle,
  pulled,
  onPullTheme,
  onPullAll,
}: {
  eventId: string;
  bundle: RecapPullBundle;
  pulled: Record<string, number>;
  onPullTheme: (eventId: string, themeId: string, bundle: RecapPullBundle) => void;
  onPullAll: (eventId: string, bundle: RecapPullBundle) => void;
}) {
  if (bundle.themes.length === 0) {
    return (
      <span className="px-2 font-caption text-xs text-ink-faint">no themes yet</span>
    );
  }
  const pulledAll = pulled[`${eventId}:*`];
  return (
    <ul className="flex flex-col gap-1 pl-2">
      {bundle.themes.map((theme) => {
        const count = pulled[`${eventId}:${theme.themeId}`];
        return (
          <li
            key={theme.themeId}
            className="flex items-center justify-between gap-2 rounded-sm border border-border-soft bg-surface-panel px-2 py-1"
          >
            <span className="min-w-0 flex-1 truncate font-caption text-xs text-ink">
              {theme.label}
            </span>
            {typeof count === 'number' ? (
              <span className="font-caption text-2xs text-ink-faint">
                {count} pinned
              </span>
            ) : null}
            <button
              type="button"
              aria-label={`pull ${theme.label}`}
              onClick={() => onPullTheme(eventId, theme.themeId, bundle)}
              className="rounded-xs border border-transparent px-1 py-0.5 text-ink-dim transition-colors hover:border-border-soft hover:text-accent"
            >
              <Download size={12} aria-hidden="true" />
            </button>
          </li>
        );
      })}
      <li>
        <button
          type="button"
          aria-label="pull all themes"
          onClick={() => onPullAll(eventId, bundle)}
          className={cn(
            'inline-flex h-6 items-center gap-1 rounded-sm border border-border-soft bg-surface-panel px-2 font-mono text-2xs uppercase tracking-wide text-ink',
            'transition-colors hover:border-accent hover:text-accent'
          )}
        >
          <Download size={10} aria-hidden="true" />
          pull all
          {typeof pulledAll === 'number' ? ` · ${pulledAll}` : ''}
        </button>
      </li>
    </ul>
  );
}
