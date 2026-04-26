/**
 * Live signal-search bridge. Sits between the planned `ResearchTarget`s
 * (keyword / hashtag / account / url) and external scraper APIs (Apify for
 * Instagram, RapidAPI for XHS, etc.) so `app/api/research/route.ts` can
 * try real social search before falling back to the inert
 * `recordFromResearchTarget` placeholder.
 *
 * v0 — stub.
 *
 * The contract this module exposes (`searchSignalReferencesForTarget`)
 * matches what the deferred stash expects:
 *
 *   const outcome = await searchSignalReferencesForTarget(target, { limit });
 *   outcome.tried     // true if the adapter actually attempted a call
 *   outcome.warnings  // human-readable warnings (debug=1 surfaces these)
 *   outcome.records   // ReferenceRecord[] when the adapter found anything
 *
 * Real adapters land in follow-up commits:
 *   - Instagram via Apify Actor `apify/instagram-scraper`
 *     - env: APIFY_API_TOKEN
 *     - kicks off a sync-run for hashtag / keyword / account
 *   - XHS via RapidAPI
 *     - env: RAPIDAPI_KEY
 *     - host header: little-red-book-api.p.rapidapi.com
 *   - TikTok: degraded — public web search returns no useable image URLs,
 *     so for v1 we return tried:false and let the placeholder kick in.
 *   - Pinterest: the existing `lib/providers/reference/pinterest.ts` works
 *     for direct URLs; bulk search is deferred.
 *
 * SIGNALS_EXECUTION_MODE controls behaviour:
 *   - `live` (default) — try the adapter, fall back on error
 *   - `dry`            — never try; always return tried:false
 *
 * SIGNALS_SCRAPER_INSTAGRAM=apify is the only Instagram path today; an
 * alternative `direct-graph` mode (using INSTAGRAM_ACCESS_TOKEN) is
 * planned but not implemented.
 */

import type { ResearchTarget } from './research';
import type { ReferenceRecord } from '@/lib/providers/reference/types';

export interface SignalSearchOptions {
  /** Per-target cap on records to materialise. Adapters honour this. */
  limit?: number;
  /** Override for the global `fetch`. Tests inject a fake. */
  fetcher?: typeof fetch;
}

export interface SignalSearchOutcome {
  /** True when an adapter was selected AND attempted a network call. */
  tried: boolean;
  /** ReferenceRecords ready for `withResearchDefaults`. */
  records: ReferenceRecord[];
  /** Human-readable warnings; surfaced when the route is hit with ?debug=1. */
  warnings: string[];
}

const EMPTY: SignalSearchOutcome = { tried: false, records: [], warnings: [] };

function executionMode(): 'live' | 'dry' {
  const v = (process.env.SIGNALS_EXECUTION_MODE ?? 'live').trim().toLowerCase();
  return v === 'dry' ? 'dry' : 'live';
}

/**
 * Public entry point. Routes a `ResearchTarget` to the appropriate scraper
 * adapter and normalises the result. Errors degrade to `tried:true,
 * records:[], warnings:[message]` so the caller can fall through to the
 * placeholder artifact without a 500.
 */
export async function searchSignalReferencesForTarget(
  target: ResearchTarget,
  opts: SignalSearchOptions = {}
): Promise<SignalSearchOutcome> {
  if (executionMode() === 'dry') return EMPTY;

  switch (target.platform) {
    case 'instagram':
      return searchInstagramSignals(target, opts);
    case 'pinterest':
    case 'tiktok':
    case 'xhs':
    default:
      // Other platforms aren't wired yet. tried:false lets the route fall
      // through to recordFromResearchTarget without a debug noise warning.
      return EMPTY;
  }
}

// ───── Instagram ─────────────────────────────────────────────────────────

async function searchInstagramSignals(
  target: ResearchTarget,
  opts: SignalSearchOptions
): Promise<SignalSearchOutcome> {
  const scraper = (
    process.env.SIGNALS_SCRAPER_INSTAGRAM ?? 'apify'
  ).trim().toLowerCase();

  if (scraper === 'apify') return searchInstagramViaApify(target, opts);

  return {
    tried: false,
    records: [],
    warnings: [`SIGNALS_SCRAPER_INSTAGRAM=${scraper} not implemented`],
  };
}

/**
 * Apify path. Uses the public sync-runs endpoint
 * (`POST https://api.apify.com/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items`)
 * with a minimal input payload. Authenticates via APIFY_API_TOKEN.
 *
 * For v0 this is intentionally a soft-stub: when the token is absent we
 * return `tried:false` so the route falls through cleanly. Wiring the
 * real call is one follow-up; the contract is locked here.
 */
async function searchInstagramViaApify(
  target: ResearchTarget,
  _opts: SignalSearchOptions
): Promise<SignalSearchOutcome> {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) {
    return {
      tried: false,
      records: [],
      warnings: ['APIFY_API_TOKEN not set'],
    };
  }
  // TODO: real Apify run-sync call. For v0, return tried:false so the
  // research route's existing placeholder path runs and the lap completes.
  // The shape is pinned so the follow-up edit only fills in the fetch +
  // record mapping.
  void target;
  return {
    tried: false,
    records: [],
    warnings: ['Apify Instagram scraper not implemented yet (v0 stub)'],
  };
}
