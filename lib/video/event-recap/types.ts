/**
 * Event-agnostic data model for the event-recap motion-graphics templates.
 *
 * The compositions under docs/explorations/motion-graphics/ were authored
 * inline against AIE Singapore 2026. This payload lifts every AIE-specific
 * string and number out of the markup so the same four templates can render
 * any event — the video-side mirror of the `EventConfig` parameterization in
 * lib/research/event-recap/event-config.ts.
 *
 * `deriveRecapVideoData` (./derive) builds one of these from an `EventConfig`
 * plus the recap's funnel counts; fixtures under ./fixtures provide worked
 * examples. The four `render*` template functions accept only the slice they
 * need, so a payload can omit variants an event doesn't use.
 */

/** Header/footer chrome shared across every variant for one event. */
export interface RecapEventChrome {
  /** Stable identifier, used for generated output paths. */
  eventId: string;
  /** Spaced display name, e.g. `aie · 2026`. */
  displayName: string;
  /** Compact tag used in footers, e.g. `aie 2026`. */
  tag: string;
  /** Place + time stamp, e.g. `may 2026 · sg`. */
  locationDate: string;
}

/** How a funnel counter formats its tweened value. */
export type RecapNumberFormat = 'millions' | 'thousands' | 'integer';

/** One stage of the by-the-numbers funnel (raw → curated → … → distilled). */
export interface RecapFunnelStage {
  /** Uppercase stage label, e.g. `raw signal`. */
  label: string;
  /** Target value the counter tweens to. */
  value: number;
  /** Counter formatting. `millions` renders `4.05M`, `integer` renders `13`. */
  format: RecapNumberFormat;
  /** Descriptor line; `**bold**` spans are honoured. */
  descriptor: string;
  /** Bar fill fraction 0..1. */
  fill: number;
  /** Right-aligned scope readout, e.g. `~25%`. */
  scope: string;
  /** Footer-left detail, e.g. `872 / 1,847`. */
  footerLeft: string;
  /** Footer-right detail, e.g. `post-filter`. */
  footerRight: string;
}

/** A single atlas lane (column) and how densely it is populated. */
export interface RecapLane {
  /** Lowercase lane label, e.g. `keynote`. */
  label: string;
  /** Number of story nodes plotted in this lane. */
  nodeCount: number;
}

/** Atlas-reveal payload: lanes + the closing caption. */
export interface RecapAtlas {
  lanes: RecapLane[];
  /** Total story count shown in the header (`↓ N stories`). */
  storyCount: number;
  /** Footer caption lines; the final line renders bold. */
  caption: string[];
}

/** Kinetic-typography technique for a quote scene. */
export type RecapQuoteTechnique = 'mask-reveal' | 'letter-cascade' | 'word-slam';

/** One quote scene in the quote-cascade variant. */
export interface RecapQuote {
  text: string;
  technique: RecapQuoteTechnique;
  /** Attribution line (who said it). */
  who: string;
  /** Context line under the attribution. */
  ctx: string;
  /**
   * For `word-slam`, the single word rendered in the accent colour. Matched
   * case-insensitively; ignored by the other techniques.
   */
  accentWord?: string;
}

/** A photo-mosaic tile. Exactly one tile in the grid should be `highlight`. */
export interface RecapMosaicTile {
  /** Uppercase tile label, e.g. `keynote`. */
  label: string;
  /** When true, this is the dimmed-then-highlighted hero tile. */
  highlight?: boolean;
}

/** Photo-mosaic payload. */
export interface RecapMosaic {
  /** Header sample readout, e.g. `9 of 142`. */
  sample: string;
  /** Grid tiles, row-major. Renders best at 9 (3×3). */
  tiles: RecapMosaicTile[];
  /** Caption with `**bold**` emphasis on the travelling moment. */
  caption: string;
  /** Footer-right stat revealed last, e.g. `4.05m views`. */
  stat: string;
}

/** Full event-recap video payload. Variant fields are optional. */
export interface RecapVideoData {
  event: RecapEventChrome;
  /** by-the-numbers — expects 4 stages. */
  funnel?: RecapFunnelStage[];
  /** atlas-reveal. */
  atlas?: RecapAtlas;
  /** quote-cascade — up to 3 quotes. */
  quotes?: RecapQuote[];
  /** Shared footer-left for quote scenes, e.g. `↳ heard on the floor`. */
  quoteFooter?: string;
  /** photo-mosaic. */
  mosaic?: RecapMosaic;
}

/** Identifier for each shipped template variant. */
export type RecapTemplateId =
  | 'atlas-reveal'
  | 'by-the-numbers'
  | 'quote-cascade'
  | 'photo-mosaic';

/** A registered template: metadata + a pure render function. */
export interface RecapTemplate {
  id: RecapTemplateId;
  /** Human label, e.g. `01 — atlas reveal`. */
  name: string;
  /** Composition length in seconds (matches `data-duration`). */
  durationSeconds: number;
  /** One-line description of the variant. */
  purpose: string;
  /** Which `RecapVideoData` field this template consumes. */
  requires: keyof RecapVideoData;
  /** Render the full HyperFrames document for the supplied event data. */
  render(data: RecapVideoData): string;
}
