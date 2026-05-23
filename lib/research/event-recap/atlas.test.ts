import { describe, expect, it } from 'vitest';
import { assignLane, type AtlasTheme } from './atlas';
import { loadEventConfig, type AtlasLaneConfig } from './event-config';

const theme = (overrides: Partial<AtlasTheme> = {}): AtlasTheme => ({
  themeId: 't1',
  label: 'A theme',
  summary: '',
  keywords: [],
  postIds: [],
  ...overrides,
});

const AIE_LANES: AtlasLaneConfig[] = [
  {
    id: 'keynote',
    label: 'keynote + stage signal',
    x: 0.38,
    matcher: /\b(vivian|minister|balakrishnan|raspberry|nanoclaw|keynote|foreign affairs|second brain|stage moments?)\b/i,
  },
  {
    id: 'program',
    label: 'talks + research',
    x: 0.13,
    matcher: /\b(research|talks?|track|speaker|inference|world models?|leadership|program|sessions?)\b/i,
  },
  {
    id: 'tools',
    label: 'hands-on tools + demos',
    x: 0.62,
    matcher: /\b(codex|cursor|hack|api|credit|agentic|workflow|workshops?|demo|reachy|rap|creative|openai|software factories)\b/i,
  },
  {
    id: 'community',
    label: 'community + sponsors',
    x: 0.86,
    matcher: /\b(students?|organizers?|organisers?|sponsors?|booths?|hiring|happy hour|meetups?|dinners?|afterglow|side events?|tinkerers|tencent|road to|livestream|shoutouts?)\b/i,
  },
];

describe('atlas — parameterization (slice 5)', () => {
  it('assigns Vivian-keynote-shaped theme to the keynote lane via label match', () => {
    const t = theme({ label: "Vivian's builder keynote", keywords: ['nanoclaw'] });
    expect(assignLane(t, AIE_LANES).id).toBe('keynote');
  });

  it('assigns workshop-shaped theme to the tools lane', () => {
    const t = theme({ label: 'Workshops and agentic workflows', summary: 'LlamaIndex sessions and agentic codex hack night.' });
    expect(assignLane(t, AIE_LANES).id).toBe('tools');
  });

  it('assigns sponsor-shaped theme to the community lane', () => {
    const t = theme({ label: 'Sponsor booths and hiring', summary: 'Founder dinners and partner rooms.' });
    expect(assignLane(t, AIE_LANES).id).toBe('community');
  });

  it('falls back to the first lane when no matcher hits', () => {
    const t = theme({ label: 'Unrelated noise topic', summary: 'Something completely off-pattern.' });
    expect(assignLane(t, AIE_LANES).id).toBe('keynote'); // first lane is fallback per spec
  });

  it('uses lane without matcher as the explicit fallback when provided', () => {
    const lanesWithFallback: AtlasLaneConfig[] = [
      ...AIE_LANES,
      { id: 'other', label: 'other / catch-all', x: 0.5 },
    ];
    const t = theme({ label: 'Unrelated noise topic', summary: 'Something completely off-pattern.' });
    expect(assignLane(t, lanesWithFallback).id).toBe('other');
  });

  it('label matches take priority over text matches', () => {
    // Label only has "research" → program lane; text also has "sponsors" → community lane.
    // Label-first pass should win.
    const t = theme({
      label: 'Research talks',
      summary: 'sponsors and booths were also there but the talk content was the focus.',
    });
    expect(assignLane(t, AIE_LANES).id).toBe('program');
  });

  it('exposes AIE 2026 atlas lanes via the event-config loader', async () => {
    const config = await loadEventConfig('aie-2026');
    expect(config?.atlasLanes.length).toBe(4);
    expect(config?.atlasLanes.map((l) => l.id)).toEqual(['keynote', 'program', 'tools', 'community']);
    const keynote = config?.atlasLanes.find((l) => l.id === 'keynote');
    expect(keynote?.matcher?.test("Vivian's builder keynote")).toBe(true);
  });
});
