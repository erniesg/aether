import type { AspectRatio } from './types';

/** Canonical dimensions for each named aspect ratio. Providers that only
 * accept `width/height` use these; providers that accept named ratios map
 * their own tokens. Dims are EXACT-aspect multiples of 16 so gpt-image-2's
 * size-grid (multiples of 16) lines up with the post-hero canvas frames
 * (1080×1080, 1080×1350, 1080×1920, 1920×1080) without leaving a 1% letterbox
 * gap. Earlier 9:16 returned 1024×1792 (ratio 0.571 vs target 0.5625) and
 * 16:9 returned 1792×1024 (1.75 vs 1.778) — visibly thin black bars on
 * canvas frames at native size.
 */
export function dimsFromAspect(aspect: AspectRatio | undefined, fallback = { w: 1024, h: 1024 }) {
  switch (aspect) {
    case '1:1':
      return { w: 1024, h: 1024 };
    case '9:16':
      // 1152×2048 is the smallest multiples-of-16 pair that satisfies 9:16
      // exactly (1152/2048 = 9/16). 1024×1820 would be off-grid.
      return { w: 1152, h: 2048 };
    case '16:9':
      return { w: 2048, h: 1152 };
    case '4:3':
      return { w: 1152, h: 864 };
    case '3:4':
      return { w: 864, h: 1152 };
    case '4:5':
      return { w: 1024, h: 1280 };
    case '2:3':
      return { w: 1024, h: 1536 };
    case '3:2':
      return { w: 1536, h: 1024 };
    default:
      return fallback;
  }
}

export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 60_000
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export function mark() {
  const start = Date.now();
  return () => Date.now() - start;
}
