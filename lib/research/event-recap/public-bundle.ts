import type { EventPostCaptureRun } from './post-capture';
import type { EventRecapBundle } from './types';

export interface PublicEventBundleOptions {
  /**
   * When true the bundle is returned untouched — raw provider payloads, run
   * inputs, and streaming URLs included. Drive this from `?debug=1`.
   */
  debug: boolean;
}

const REDACTED = { redacted: true, hint: 'append ?debug=1 to inspect' } as const;

/**
 * Strip raw provider payloads and run internals before a bundle leaves an
 * API route. AGENTS.md: raw payloads / traces belong in the disclosed debug
 * drawer, never the primary surface.
 *
 * Non-debug responses keep every creator-facing artifact — refs, clusters,
 * voices, media, run summaries, and the phased run-event timeline (its `data`
 * carries only safe counts) — but drop:
 *   - `post.raw`        scrape payloads
 *   - `run.inputs`      refresh configuration
 *   - `run.streamingUrls` live provider preview links
 */
export function toPublicEventBundle(
  bundle: EventRecapBundle,
  options: PublicEventBundleOptions
): EventRecapBundle {
  if (options.debug) return bundle;
  return {
    ...bundle,
    posts: bundle.posts.map((post) => ({ ...post, raw: REDACTED })),
    runs: bundle.runs.map((run) => ({
      ...run,
      inputs: REDACTED,
      streamingUrls: [],
    })),
    captureRun: bundle.captureRun ? sanitizeCaptureRun(bundle.captureRun) : undefined,
  };
}

/**
 * Strip absolute server-side filesystem paths from a capture run before it
 * leaves an API response. `screenshotPath` is absolute and must be dropped;
 * `screenshotRelPath` is repo-relative and safe to expose.
 */
function sanitizeCaptureRun(run: EventPostCaptureRun): EventPostCaptureRun {
  return {
    ...run,
    captures: run.captures.map(({ screenshotPath: _screenshotPath, ...rest }) => rest),
  };
}
