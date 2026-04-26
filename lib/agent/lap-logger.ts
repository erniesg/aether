/**
 * Structured per-lap logger.
 *
 * Replaces ad-hoc console.log/warn calls inside runAutoMode with events
 * that:
 *   1. echo to console (so dev / serverless logs still see them)
 *   2. persist to Convex `lapEvent` (so the workspace right-rail can show
 *      a live tail and /inspect can render the full timeline after the lap)
 *
 * Fire-and-forget against Convex — a network blip never blocks a lap. The
 * console fallback always runs even when Convex isn't configured (e.g.
 * local dev without NEXT_PUBLIC_CONVEX_URL).
 *
 * Tag convention: dot-delimited hierarchy so the UI can group / filter by
 * stage prefix. Examples used by auto-mode.ts:
 *   ingest.url.ok / ingest.url.fail
 *   brand-parse.parsed
 *   serp.enriched / serp.skipped
 *   research.start / research.ok / research.fail
 *   variation.start / variation.ready / variation.failed
 *   sam3.one-shot.matched / sam3.vision-guided.matched
 *   atlas.composed / atlas.failed
 *   native.per-format.rendered / native.per-format.upload
 *   signoff.start / signoff.decided
 *   publish.scheduled / publish.failed
 *   lap.start / lap.end
 *
 * Event vocabulary is intentionally loose — `data` is `unknown` so callers
 * pass whatever structured fields fit the event. Keep messages short
 * (one line); put numbers / ids in `data`.
 */

import { recordLapEvent } from '@/lib/convex/http';

export type LapEventLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogLapEventInput {
  campaignId: string | null | undefined;
  variationIndex?: number;
  level?: LapEventLevel;
  tag: string;
  message: string;
  data?: Record<string, unknown>;
}

const LEVEL_PREFIX: Record<LapEventLevel, string> = {
  debug: '·',
  info: '✓',
  warn: '⚠',
  error: '✗',
};

/**
 * Log one lap event. Always echoes to console; persists to Convex when a
 * campaignId is supplied. Errors during persistence are swallowed (the
 * caller already saw the console line, and a lap should never abort
 * because logging failed).
 */
export function logLapEvent(input: LogLapEventInput): void {
  const level = input.level ?? 'info';
  const prefix = `${LEVEL_PREFIX[level]} [auto-mode:${input.tag}`;
  const tail = input.variationIndex != null ? `@v${input.variationIndex}]` : ']';
  const dataSuffix = input.data ? ` ${JSON.stringify(input.data)}` : '';

  // Console echo — always.
  // eslint-disable-next-line no-console
  const log =
    level === 'error'
      ? console.error
      : level === 'warn'
        ? console.warn
        : console.log;
  log(`${prefix}${tail} ${input.message}${dataSuffix}`);

  // Convex persistence — fire-and-forget when we have a campaignId.
  if (input.campaignId) {
    void recordLapEvent({
      campaignId: input.campaignId,
      variationIndex: input.variationIndex,
      tag: input.tag,
      level,
      message: input.message,
      data: input.data,
      ts: Date.now(),
    }).catch(() => {
      // already swallowed inside recordLapEvent — defensive belt.
    });
  }
}
