import type { AspectRatio } from './types';

/** Canonical dimensions for each named aspect ratio. Providers that only
 * accept `width/height` use these; providers that accept named ratios map
 * their own tokens. */
export function dimsFromAspect(aspect: AspectRatio | undefined, fallback = { w: 1024, h: 1024 }) {
  switch (aspect) {
    case '1:1':
      return { w: 1024, h: 1024 };
    case '9:16':
      return { w: 1024, h: 1792 };
    case '16:9':
      return { w: 1792, h: 1024 };
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
