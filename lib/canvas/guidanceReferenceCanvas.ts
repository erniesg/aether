'use client';

import {
  buildGuidanceReferencePixels,
  type GuidanceReferenceInput,
} from '@/lib/providers/image/guidanceReference';

/**
 * Client-only helper: rasterize a guidance-reference PNG via HTMLCanvasElement
 * and return it as a data URL. Call site is whoever composes a generation
 * request and wants to attach the reference as an input ref.
 *
 * Throws when a 2d canvas context can't be acquired (e.g. during SSR). Do not
 * import this module from server code.
 */
export function renderGuidanceReferenceDataUrl(input: GuidanceReferenceInput): string {
  const pixels = buildGuidanceReferencePixels(input);
  const canvas = document.createElement('canvas');
  canvas.width = input.width;
  canvas.height = input.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d context unavailable');
  const imageData = ctx.createImageData(input.width, input.height);
  imageData.data.set(pixels);
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/png');
}
