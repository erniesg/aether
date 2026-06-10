/**
 * AIE Singapore 2026 recap data — the worked example.
 *
 * Reproduces the content of the hand-authored compositions under
 * docs/explorations/motion-graphics/. Rendering the templates with this
 * payload should yield the same compositions (modulo procedurally generated
 * node/edge geometry), which is the regression anchor for the variant work.
 */
import type { RecapVideoData } from '../types';

export const aie2026Recap: RecapVideoData = {
  event: {
    eventId: 'aie-2026',
    displayName: 'aie · 2026',
    tag: 'aie 2026',
    locationDate: 'may 2026 · sg',
  },
  funnel: [
    {
      label: 'raw signal',
      value: 4.05,
      format: 'millions',
      descriptor: 'views observed across **x, linkedin, youtube**',
      fill: 1,
      scope: '100%',
      footerLeft: 'aie · 2026 · sg',
      footerRight: 'collection window',
    },
    {
      label: 'curated',
      value: 872,
      format: 'thousands',
      descriptor: 'relevant posts after **recency + signal filters**',
      fill: 0.5,
      scope: '~50%',
      footerLeft: '872 / 1,847',
      footerRight: 'post-filter',
    },
    {
      label: 'synthesised',
      value: 13,
      format: 'integer',
      descriptor: 'story clusters that explain **what the room actually was**',
      fill: 0.25,
      scope: '~25%',
      footerLeft: '13 clusters',
      footerRight: 'llm + regex assignment',
    },
    {
      label: 'distilled',
      value: 4,
      format: 'integer',
      descriptor: 'lanes that hold **every story we found**',
      fill: 0.1,
      scope: '~10%',
      footerLeft: 'keynote · program · tools · community',
      footerRight: 'output',
    },
  ],
  atlas: {
    lanes: [
      { label: 'keynote', nodeCount: 3 },
      { label: 'program', nodeCount: 5 },
      { label: 'tools', nodeCount: 3 },
      { label: 'community', nodeCount: 2 },
    ],
    storyCount: 13,
    caption: ['13 stories.', '4 lanes.', 'one event.'],
  },
  quotes: [
    {
      text: 'the harness\nis the product.',
      technique: 'mask-reveal',
      who: 'openai · codex booth',
      ctx: 'aie singapore · day 1',
    },
    {
      text: 'every operator on stage treated the model as commodity infill.',
      technique: 'letter-cascade',
      who: 'aie singapore',
      ctx: 'stage observation · 16 may',
    },
    {
      text: 'Singapore can be the testbed for AI agents at scale.',
      technique: 'word-slam',
      accentWord: 'testbed',
      who: 'vivian balakrishnan',
      ctx: 'keynote · capitol theatre',
    },
  ],
  quoteFooter: '↳ heard on the floor',
  mosaic: {
    sample: '9 of 142',
    tiles: [
      { label: 'stage' },
      { label: 'booth' },
      { label: 'crowd' },
      { label: 'demo' },
      { label: 'keynote', highlight: true },
      { label: 'panel' },
      { label: 'hall' },
      { label: 'expo' },
      { label: 'after' },
    ],
    caption: 'the moment that **travelled**.',
    stat: '4.05m views',
  },
};

export default aie2026Recap;
