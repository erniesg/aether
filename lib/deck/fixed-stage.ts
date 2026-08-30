export const AETHER_DECK_STAGE = {
  width: 1920,
  height: 1080,
  aspectRatio: 16 / 9,
} as const;

export const AETHER_DECK_STYLE_TOKENS = {
  stage: AETHER_DECK_STAGE,
  inset: {
    page: 96,
    dense: 64,
    section: 128,
  },
  gap: {
    sm: 24,
    md: 40,
    lg: 72,
  },
  radius: {
    block: 8,
    media: 6,
  },
} as const;

export interface StageSize {
  width: number;
  height: number;
}

export interface FixedStageFit {
  scale: number;
  width: number;
  height: number;
  letterboxX: number;
  letterboxY: number;
}

function finitePositive(value: number, fallback: number) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function calculateFixedStageFit(
  bounds: StageSize,
  stage: StageSize = AETHER_DECK_STAGE
): FixedStageFit {
  const viewportWidth = finitePositive(bounds.width, stage.width);
  const viewportHeight = finitePositive(bounds.height, stage.height);
  const stageWidth = finitePositive(stage.width, AETHER_DECK_STAGE.width);
  const stageHeight = finitePositive(stage.height, AETHER_DECK_STAGE.height);
  const scale = Math.min(viewportWidth / stageWidth, viewportHeight / stageHeight);
  const width = stageWidth * scale;
  const height = stageHeight * scale;

  return {
    scale,
    width,
    height,
    letterboxX: Math.max(0, (viewportWidth - width) / 2),
    letterboxY: Math.max(0, (viewportHeight - height) / 2),
  };
}

export function clampSlideIndex(index: number, slideCount: number) {
  if (slideCount <= 0) return 0;
  if (!Number.isFinite(index)) return 0;
  return Math.min(Math.max(0, Math.trunc(index)), slideCount - 1);
}

export function slideIndexFromSearch(
  search: string,
  paramName: string,
  slideCount: number,
  fallbackIndex = 0
) {
  const params = new URLSearchParams(search);
  const raw = params.get(paramName);
  if (!raw) return clampSlideIndex(fallbackIndex, slideCount);

  const oneBased = Number.parseInt(raw, 10);
  if (!Number.isFinite(oneBased)) return clampSlideIndex(fallbackIndex, slideCount);
  return clampSlideIndex(oneBased - 1, slideCount);
}

export function formatSlideUrl(
  href: string,
  slideIndex: number,
  paramName: string,
  slideCount: number
) {
  const url = new URL(href, 'https://aether.local');
  url.searchParams.set(paramName, String(clampSlideIndex(slideIndex, slideCount) + 1));
  return `${url.pathname}${url.search}${url.hash}`;
}

export function formatCssPx(value: number) {
  const rounded = Number(value.toFixed(4));
  return `${rounded}px`;
}

export function formatCssScale(value: number) {
  return Number(value.toFixed(6));
}
