'use client';

/**
 * AutoRefresh — embed in /inspect/[campaignId] to make the snapshot view
 * effectively live. Calls Next's router.refresh() on a timer while the
 * campaign is in flight so the server-rendered page re-fetches its trace
 * (cache: 'no-store' on the API call) and the user sees variations
 * transition pending → running → ready/failed without manual reload.
 *
 * Stops automatically once the campaign settles to completed / failed.
 *
 * Cheaper than converting the whole 500-line server component to a
 * Convex useQuery client component (which would lose the trace API's
 * extra enrichment around agent-run details + scheduled posts).
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export interface AutoRefreshProps {
  /** Current campaign status. Only 'running' / 'pending' triggers refresh. */
  status?: string;
  /** Poll interval in ms. Default 5000. */
  intervalMs?: number;
}

export function AutoRefresh({ status, intervalMs = 5000 }: AutoRefreshProps) {
  const router = useRouter();

  useEffect(() => {
    if (status !== 'running' && status !== 'pending') return;
    const id = setInterval(() => {
      router.refresh();
    }, intervalMs);
    return () => clearInterval(id);
  }, [status, intervalMs, router]);

  return null;
}
