/**
 * Shared style tokens — kept in one place so both the worker-rendered HTML
 * (docs/mocks/aie2026-recap-mock.html and workers/aie2026-vibes.ts) and
 * the Remotion composition draw from the same palette + type stack.
 */

export const theme = {
  bg: '#070808',
  panel: '#0e0f10',
  ink: '#f1ece5',
  muted: '#9c9388',
  dim: '#766c61',
  line: '#1c1d1e',
  lineStrong: '#2a2b2c',
  accent: '#de7340',
  accentSoft: 'rgba(222, 115, 64, 0.16)',
  soft: '#101113',
  serif: `'Instrument Serif', Georgia, 'Times New Roman', serif`,
  sans: `Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif`,
  mono: `'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace`,
};

export const FPS = 30;

export const SCENE_FRAMES = {
  TITLE: 90,
  STAT: 210,
  RANKING: 210,
  MOMENT: 270,
  MONTAGE: 180,
  CASCADE: 180,
  SPONSOR: 240,
  VOICE: 240,
  OUTRO: 180,
};

// Cumulative scene start frames (60s total at 30fps = 1800 frames)
export const SCENE_STARTS = (() => {
  const order: (keyof typeof SCENE_FRAMES)[] = [
    'TITLE',
    'STAT',
    'RANKING',
    'MOMENT',
    'MONTAGE',
    'CASCADE',
    'SPONSOR',
    'VOICE',
    'OUTRO',
  ];
  const acc: Record<string, { from: number; durationInFrames: number }> = {};
  let cursor = 0;
  for (const id of order) {
    const durationInFrames = SCENE_FRAMES[id];
    acc[id] = { from: cursor, durationInFrames };
    cursor += durationInFrames;
  }
  return acc;
})();
