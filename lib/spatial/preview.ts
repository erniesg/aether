import type { SpatialBuildRequest, SpatialFormat, SpatialQuality } from '@/lib/providers/spatial/types';

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function particleCountForQuality(quality: SpatialQuality | undefined): number {
  switch (quality) {
    case 'high':
      return 324;
    case 'standard':
      return 196;
    default:
      return 144;
  }
}

function paletteForFormat(format: SpatialFormat): { base: string; glow: string; accent: string } {
  if (format === 'gaussian-splat') {
    return {
      base: '#7dd3fc',
      glow: '#bae6fd',
      accent: '#e0f2fe',
    };
  }

  return {
    base: '#f59e0b',
    glow: '#fde68a',
    accent: '#fef3c7',
  };
}

export function buildSpatialPreviewDataUrl(request: SpatialBuildRequest): string {
  const width = Math.max(1, Math.round(request.width));
  const height = Math.max(1, Math.round(request.height));
  const format = request.format;
  const quality = request.quality;
  const cols = Math.max(6, Math.round(Math.sqrt(particleCountForQuality(quality)) * (width / height) ** 0.5));
  const rows = Math.max(6, Math.round(particleCountForQuality(quality) / cols));
  const palette = paletteForFormat(format);
  const promptLabel = request.prompt?.trim() ? escapeAttr(request.prompt.trim()) : null;

  const particles: string[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const x = ((col + 0.5) / cols) * width;
      const y = ((row + 0.5) / rows) * height;
      const jitter = ((row * 37 + col * 19) % 11) - 5;
      const r = Math.max(1.5, Math.min(width, height) / (format === 'gaussian-splat' ? 20 : 26));
      const opacity = 0.18 + ((row * 13 + col * 7) % 10) * 0.05;
      particles.push(
        `<circle cx="${x.toFixed(1)}" cy="${(y + jitter).toFixed(1)}" r="${(r + (jitter % 3)).toFixed(1)}" fill="${palette.base}" fill-opacity="${opacity.toFixed(2)}" />`
      );
    }
  }

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none">`,
    '<defs>',
    '<filter id="grain">',
    '<feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="7" result="noise" />',
    '<feColorMatrix in="noise" type="saturate" values="0" result="monoNoise" />',
    '<feComponentTransfer in="monoNoise" result="fadedNoise">',
    '<feFuncA type="table" tableValues="0 0.03" />',
    '</feComponentTransfer>',
    '</filter>',
    '<filter id="softBlur">',
    `<feGaussianBlur stdDeviation="${format === 'gaussian-splat' ? 14 : 8}" />`,
    '</filter>',
    '</defs>',
    `<rect width="${width}" height="${height}" fill="#0f172a" />`,
    `<image href="${escapeAttr(request.sourceUrl)}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice" opacity="0.78" />`,
    `<rect width="${width}" height="${height}" fill="${palette.accent}" opacity="0.08" filter="url(#grain)" />`,
    `<g filter="url(#softBlur)">${particles.join('')}</g>`,
    `<g opacity="0.45">${particles.slice(0, Math.ceil(particles.length / 3)).join('')}</g>`,
    `<path d="M0 ${height * 0.84}C${width * 0.18} ${height * 0.72} ${width * 0.42} ${height * 0.94} ${width} ${height * 0.7}V${height}H0Z" fill="${palette.glow}" fill-opacity="0.16" />`,
    promptLabel
      ? `<text x="${width - 20}" y="${height - 20}" text-anchor="end" fill="white" fill-opacity="0.82" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="${Math.max(14, Math.round(width / 28))}">${promptLabel}</text>`
      : '',
    '</svg>',
  ].join('');

  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export function estimateSpatialPointCount(quality: SpatialQuality | undefined): number {
  return particleCountForQuality(quality);
}
