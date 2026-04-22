import { encodeSvgDataUrl } from '@/lib/segment/dataUrl';

export type BackgroundFillMode = 'solid' | 'gradient';

export interface BackgroundFillSpec {
  mode: BackgroundFillMode;
  colorA: string;
  colorB: string;
  opacity: number;
  angle?: number;
}

function clampOpacity(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function buildBackgroundFillDataUrl(params: {
  width: number;
  height: number;
  fill: BackgroundFillSpec;
}): string {
  const opacity = clampOpacity(params.fill.opacity);
  const svg =
    params.fill.mode === 'solid'
      ? [
          `<svg xmlns="http://www.w3.org/2000/svg" width="${params.width}" height="${params.height}" viewBox="0 0 ${params.width} ${params.height}">`,
          `<rect width="${params.width}" height="${params.height}" fill="${params.fill.colorA}" fill-opacity="${opacity}" />`,
          '</svg>',
        ].join('')
      : [
          `<svg xmlns="http://www.w3.org/2000/svg" width="${params.width}" height="${params.height}" viewBox="0 0 ${params.width} ${params.height}">`,
          '<defs>',
          `<linearGradient id="bgGradient" gradientTransform="rotate(${params.fill.angle ?? 135} .5 .5)">`,
          `<stop offset="0%" stop-color="${params.fill.colorA}" stop-opacity="${opacity}" />`,
          `<stop offset="100%" stop-color="${params.fill.colorB}" stop-opacity="${opacity}" />`,
          '</linearGradient>',
          '</defs>',
          `<rect width="${params.width}" height="${params.height}" fill="url(#bgGradient)" />`,
          '</svg>',
        ].join('');

  return encodeSvgDataUrl(svg);
}
