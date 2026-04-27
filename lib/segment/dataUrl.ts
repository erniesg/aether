import { fetchWithTimeout } from '@/lib/providers/image/util';

function sanitizeMimeType(value: string | null): string {
  if (!value) return 'image/png';
  return value.split(';', 1)[0] || 'image/png';
}

function inferMimeTypeFromUrl(url: string): string {
  if (url.startsWith('data:image/jpeg')) return 'image/jpeg';
  if (url.startsWith('data:image/webp')) return 'image/webp';
  if (url.startsWith('data:image/svg+xml')) return 'image/svg+xml';
  return 'image/png';
}

export function bufferToDataUrl(
  buffer: ArrayBuffer,
  mimeType: string
): string {
  const base64 = Buffer.from(buffer).toString('base64');
  return `data:${mimeType};base64,${base64}`;
}

export async function fetchAsDataUrl(url: string): Promise<string> {
  if (url.startsWith('data:')) return url;
  const res = await fetchWithTimeout(url, undefined, 60_000);
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`failed to fetch asset ${res.status}: ${text}`);
  }
  const mimeType = sanitizeMimeType(res.headers.get('content-type'));
  const buffer = await res.arrayBuffer();
  return bufferToDataUrl(buffer, mimeType);
}

export function encodeSvgDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function buildMaskedImageDataUrl(params: {
  sourceDataUrl: string;
  maskDataUrl: string;
  width: number;
  height: number;
  invertMask?: boolean;
}): string {
  const filter = params.invertMask
    ? '<filter id="invertMask"><feColorMatrix type="matrix" values="-1 0 0 0 1 0 -1 0 0 1 0 0 -1 0 1 0 0 0 1 0" /></filter>'
    : '';

  // preserveAspectRatio="xMidYMid slice" = cover-fit (centered, edges
  // cropped). Was "none" (stretch). The stretch produced visible
  // compression / wrong-aspect rendering whenever the source's intrinsic
  // dims didn't match the requested width/height — common when the
  // canvas asks for the cutout sized to a frame that differs from the
  // source aspect (e.g., 4:5 image inside a 1:1 IG frame). Both source
  // and mask use the same preserveAspectRatio so they stay aligned.
  const par = 'xMidYMid slice';

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${params.width}" height="${params.height}" viewBox="0 0 ${params.width} ${params.height}">`,
    '<defs>',
    filter,
    '<mask id="cutoutMask" maskUnits="userSpaceOnUse">',
    `<image href="${params.maskDataUrl}" width="${params.width}" height="${params.height}" preserveAspectRatio="${par}"${params.invertMask ? ' filter="url(#invertMask)"' : ''} />`,
    '</mask>',
    '</defs>',
    `<image href="${params.sourceDataUrl}" width="${params.width}" height="${params.height}" preserveAspectRatio="${par}" mask="url(#cutoutMask)" />`,
    '</svg>',
  ].join('');

  return encodeSvgDataUrl(svg);
}

export function inferDataUrlMimeType(url: string): string {
  return inferMimeTypeFromUrl(url);
}
