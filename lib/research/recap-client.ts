import type { EventPost, EventTheme } from '@/lib/research/event-recap/types';
import {
  readStoredVibesKey,
  vibesAuthHeadersFrom,
} from '@/lib/research/vibes/client-auth';

/**
 * Client fetch for a recap bundle, scoped to what the pull seam consumes
 * (themes + posts). Reuses the vibes auth header layer the /events report
 * page already relies on.
 */

export interface RecapPullBundle {
  themes: EventTheme[];
  posts: EventPost[];
}

export async function fetchRecapBundle(
  eventId: string,
  opts: { fetcher?: typeof fetch } = {}
): Promise<RecapPullBundle> {
  const fetcher = opts.fetcher ?? fetch;
  const res = await fetcher(`/api/events/${encodeURIComponent(eventId)}`, {
    headers: vibesAuthHeadersFrom(readStoredVibesKey()),
  });
  if (!res.ok) {
    throw new Error(`recap fetch failed (${res.status})`);
  }
  const data = (await res.json()) as {
    ok?: boolean;
    error?: string;
    bundle?: { themes?: EventTheme[]; posts?: EventPost[] };
  };
  if (!data.ok || !data.bundle) {
    throw new Error(data.error ?? 'recap fetch failed');
  }
  return {
    themes: data.bundle.themes ?? [],
    posts: data.bundle.posts ?? [],
  };
}
