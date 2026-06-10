/**
 * DevSummit Berlin 2026 — a second, fictional event used to prove the
 * templates are genuinely event-agnostic.
 *
 * Deliberately different along every axis the templates parameterize: a
 * 3-lane atlas (vs 4), a 6-tile mosaic (vs 9), different counts, quotes, and
 * accent word. Rendering the four variants with this payload must not surface
 * any AIE 2026 string — that is the genericity assertion in the test suite.
 */
import type { RecapVideoData } from '../types';

export const devsummit2026Recap: RecapVideoData = {
  event: {
    eventId: 'devsummit-2026',
    displayName: 'devsummit · 2026',
    tag: 'devsummit 2026',
    locationDate: 'sep 2026 · berlin',
  },
  funnel: [
    {
      label: 'raw signal',
      value: 2.1,
      format: 'millions',
      descriptor: 'views observed across **x, mastodon, youtube**',
      fill: 1,
      scope: '100%',
      footerLeft: 'devsummit · 2026 · de',
      footerRight: 'collection window',
    },
    {
      label: 'curated',
      value: 540,
      format: 'thousands',
      descriptor: 'relevant posts after **recency + signal filters**',
      fill: 0.45,
      scope: '~45%',
      footerLeft: '540 / 1,210',
      footerRight: 'post-filter',
    },
    {
      label: 'synthesised',
      value: 9,
      format: 'integer',
      descriptor: 'story clusters that explain **what the room actually was**',
      fill: 0.25,
      scope: '~25%',
      footerLeft: '9 clusters',
      footerRight: 'llm + regex assignment',
    },
    {
      label: 'distilled',
      value: 3,
      format: 'integer',
      descriptor: 'lanes that hold **every story we found**',
      fill: 0.1,
      scope: '~10%',
      footerLeft: 'platform · runtime · community',
      footerRight: 'output',
    },
  ],
  atlas: {
    lanes: [
      { label: 'platform', nodeCount: 4 },
      { label: 'runtime', nodeCount: 3 },
      { label: 'community', nodeCount: 2 },
    ],
    storyCount: 9,
    caption: ['9 stories.', '3 lanes.', 'one event.'],
  },
  quotes: [
    {
      text: 'ship small\nship often.',
      technique: 'mask-reveal',
      who: 'platform keynote',
      ctx: 'devsummit berlin · day 1',
    },
    {
      text: 'the runtime is finally boring, and that is the whole point.',
      technique: 'letter-cascade',
      who: 'core maintainers panel',
      ctx: 'stage observation · 14 sep',
    },
    {
      text: 'Europe can own the open edge runtime.',
      technique: 'word-slam',
      accentWord: 'edge',
      who: 'keynote speaker',
      ctx: 'keynote · kosmos hall',
    },
  ],
  quoteFooter: '↳ heard on the floor',
  mosaic: {
    sample: '6 of 88',
    tiles: [
      { label: 'stage' },
      { label: 'booth' },
      { label: 'runtime', highlight: true },
      { label: 'panel' },
      { label: 'hall' },
      { label: 'after' },
    ],
    caption: 'the moment that **travelled**.',
    stat: '2.10m views',
  },
};

export default devsummit2026Recap;
