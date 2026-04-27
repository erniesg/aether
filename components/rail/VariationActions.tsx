'use client';

import { useCallback, useState } from 'react';
import { Button } from '@/components/ui/Button';

/**
 * Unified action row for an Auto Mode variation card. One control surface,
 * shared between:
 *   - components/rail/sections/AutoModePanel.tsx (in-flight lap right rail)
 *   - app/runs/page.tsx ExpandedRow (historical lap browser)
 *
 * Three primary actions:
 *   - approve    → POST /api/auto-mode/approve { notifyMode: 'review' }
 *                  ("send for review" — keeps the variation around without
 *                   firing publishers; UI updates schedule chip via Convex.)
 *   - post now   → POST /api/auto-mode/post-now (the cheap path; loads the
 *                  persisted variation and calls scheduleVariationPosts
 *                  directly with forcePostNow=true).
 *   - schedule   → opens a datetime input → POST /api/auto-mode/approve
 *                  with notifyMode='auto-post' (no forcePostNow → uses the
 *                  scheduled time the run agent emitted).
 *   - reject     → POST is via Convex mutation (campaigns.rejectVariation)
 *                  through the parent-supplied onReject callback. We don't
 *                  hit /api/auto-mode/reject from here because that route
 *                  is GET-only (Discord button shape).
 *
 * Both wiring modes are supported:
 *   - **callback mode** (existing AutoModePanel pattern): pass `onApprove` /
 *     `onReject` and the component delegates to them. Lets the parent run
 *     local state updates (approving spinner, approved chip).
 *   - **self-fetch mode** (new /runs pattern): when no callbacks are given
 *     the component fetches the routes itself. Uses campaignId +
 *     variationIndex props; rejection in self-fetch mode is a no-op (Convex
 *     mutation requires a doc id we don't have on /runs without an extra
 *     query — feature gap intentionally left to AutoModePanel for now).
 */

export interface VariationActionsProps {
  campaignId: string;
  variationIndex: number;
  workspaceId?: string;
  /** Hide the row entirely when status isn't 'ready' — there's nothing to act on. */
  status: string;
  /**
   * Optional approval callback. Signature mirrors AutoModePanel's existing
   * onApprove. When omitted, the component fetches /api/auto-mode/approve
   * (review) or /api/auto-mode/post-now (auto-post + forcePostNow) directly.
   */
  onApprove?: (
    notifyMode: 'review' | 'auto-post',
    forcePostNow?: boolean
  ) => Promise<void> | void;
  /**
   * Optional reject callback. When omitted, the reject button is hidden in
   * self-fetch mode — the /reject endpoint is GET-only and self-fetching it
   * from a button click would route the browser away from the page.
   */
  onReject?: () => Promise<void> | void;
  /**
   * Compact mode: smaller buttons, hides labels for 'reject'. Used in dense
   * contexts like /runs ExpandedRow.
   */
  density?: 'default' | 'compact';
}

export function VariationActions({
  campaignId,
  variationIndex,
  workspaceId,
  status,
  onApprove,
  onReject,
  density = 'default',
}: VariationActionsProps) {
  const [busy, setBusy] = useState<'approve' | 'post-now' | 'schedule' | 'reject' | null>(
    null
  );
  const [done, setDone] = useState<'approved' | 'posted' | 'scheduled' | 'rejected' | null>(
    null
  );
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleDate, setScheduleDate] = useState('');
  const [error, setError] = useState<string | null>(null);

  const selfFetch = onApprove === undefined;

  const fireApprove = useCallback(
    async (notifyMode: 'review' | 'auto-post', forcePostNow: boolean) => {
      if (busy) return;
      setBusy(forcePostNow ? 'post-now' : notifyMode === 'review' ? 'approve' : 'schedule');
      setError(null);
      try {
        if (onApprove) {
          // Only pass forcePostNow when truthy so the parent's call shape
          // stays minimal (`onApprove(notifyMode)` for review/schedule;
          // `onApprove(notifyMode, true)` only for the post-now path).
          if (forcePostNow) {
            await onApprove(notifyMode, true);
          } else {
            await onApprove(notifyMode);
          }
        } else if (forcePostNow) {
          // /post-now is the cheap immediate path — skips the lap re-run.
          const res = await fetch('/api/auto-mode/post-now', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ campaignId, variationIndex, workspaceId }),
          });
          const json = (await res.json()) as { ok: boolean; error?: string };
          if (!json.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
        } else {
          // notifyMode='review' or schedule (auto-post without forcePostNow).
          const res = await fetch('/api/auto-mode/approve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              campaignId,
              variationIndex,
              notifyMode,
              workspaceId,
            }),
          });
          const json = (await res.json()) as { ok: boolean; error?: string };
          if (!json.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
        }
        setDone(
          forcePostNow
            ? 'posted'
            : notifyMode === 'review'
              ? 'approved'
              : 'scheduled'
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(null);
      }
    },
    [busy, onApprove, campaignId, variationIndex, workspaceId]
  );

  const fireReject = useCallback(async () => {
    if (busy || !onReject) return;
    setBusy('reject');
    setError(null);
    try {
      await onReject();
      setDone('rejected');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }, [busy, onReject]);

  if (status !== 'ready') return null;
  if (done === 'rejected') {
    return (
      <div className="font-mono text-[10px] text-ink-faint mt-2">rejected</div>
    );
  }
  if (done) {
    return (
      <div className="font-mono text-[10px] text-signal-ok mt-2">{done}</div>
    );
  }

  const sizeProp = density === 'compact' ? 'sm' : 'sm';
  const showReject = onReject !== undefined || !selfFetch;

  return (
    <div className="flex flex-col gap-1.5 mt-2">
      <div className="flex items-center gap-1.5 flex-wrap">
        <Button
          variant="primary"
          size={sizeProp}
          disabled={busy !== null}
          onClick={() => void fireApprove('review', false)}
          data-testid={`variation-approve-${variationIndex}`}
          title="Send for review — keeps the variation but doesn't fire publishers"
        >
          {busy === 'approve' ? 'approving…' : 'approve'}
        </Button>
        <Button
          variant="primary"
          size={sizeProp}
          disabled={busy !== null}
          onClick={() => void fireApprove('auto-post', true)}
          data-testid={`variation-post-now-${variationIndex}`}
          title="Post immediately to every configured platform — bypasses the schedule window"
        >
          {busy === 'post-now' ? 'posting…' : 'post now'}
        </Button>
        <Button
          variant="subtle"
          size={sizeProp}
          disabled={busy !== null}
          onClick={() => setScheduleOpen((prev) => !prev)}
          data-testid={`variation-schedule-${variationIndex}`}
        >
          schedule
        </Button>
        {showReject ? (
          <Button
            variant="ghost"
            size={sizeProp}
            disabled={busy !== null || onReject === undefined}
            onClick={() => void fireReject()}
            data-testid={`variation-reject-${variationIndex}`}
            title={
              onReject === undefined
                ? 'Reject from /runs not yet wired — use the workspace right rail'
                : undefined
            }
          >
            {busy === 'reject' ? 'rejecting…' : 'reject'}
          </Button>
        ) : null}
      </div>
      {scheduleOpen ? (
        <div className="flex flex-col gap-1.5 mt-1">
          <input
            type="datetime-local"
            value={scheduleDate}
            onChange={(e) => setScheduleDate(e.target.value)}
            data-testid={`variation-schedule-input-${variationIndex}`}
            className="w-full rounded border border-border-soft bg-surface-panel px-2 py-1 font-mono text-[10px] text-ink focus:border-accent focus:outline-none"
          />
          <Button
            variant="primary"
            size="sm"
            disabled={!scheduleDate || busy !== null}
            onClick={() => void fireApprove('auto-post', false)}
            data-testid={`variation-schedule-confirm-${variationIndex}`}
          >
            confirm &amp; post
          </Button>
        </div>
      ) : null}
      {error ? (
        <div className="font-mono text-[10px] text-signal-error mt-1 break-words">
          {error}
        </div>
      ) : null}
    </div>
  );
}
