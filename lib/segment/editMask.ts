import { bufferToDataUrl, fetchAsDataUrl } from './dataUrl';

export type EditMaskRegion = 'selection' | 'background';

function parseBase64DataUrl(value: string): { mimeType: string; payload: string } | null {
  if (!value.startsWith('data:')) return null;
  const commaIdx = value.indexOf(',');
  if (commaIdx <= 5 || commaIdx === value.length - 1) return null;
  const header = value.slice(5, commaIdx);
  if (!header.includes(';base64')) return null;
  return {
    mimeType: header.split(';', 1)[0] || 'image/png',
    payload: value.slice(commaIdx + 1),
  };
}

/**
 * OpenAI image edit masks use alpha to decide what can change. SAM masks are
 * easier for canvas preview as white-selected / black-background images, so
 * this converts those masks into explicit RGBA edit masks:
 * - selection: edit the selected object area, protect the background.
 * - background: protect the selected object, edit everything behind it.
 */
export async function buildOpenAIEditMaskDataUrl(params: {
  maskUrl: string;
  editRegion: EditMaskRegion;
  width?: number;
  height?: number;
}): Promise<string> {
  const maskDataUrl = await fetchAsDataUrl(params.maskUrl);
  const parsed = parseBase64DataUrl(maskDataUrl);
  if (!parsed) return maskDataUrl;

  const sharp = (await import('sharp')).default;
  let image = sharp(Buffer.from(parsed.payload, 'base64')).ensureAlpha();

  if (params.width && params.height) {
    image = image.resize(Math.round(params.width), Math.round(params.height), {
      fit: 'fill',
    });
  }

  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  const rgba = Buffer.alloc(info.width * info.height * 4);

  for (let index = 0; index < info.width * info.height; index += 1) {
    const srcOffset = index * info.channels;
    const dstOffset = index * 4;
    const r = data[srcOffset] ?? 0;
    const g = data[srcOffset + 1] ?? r;
    const b = data[srcOffset + 2] ?? r;
    const a = data[srcOffset + 3] ?? 255;
    const selected = Math.round(((Math.max(r, g, b) / 255) * a));
    const alpha =
      params.editRegion === 'selection' ? 255 - selected : selected;

    rgba[dstOffset] = 255;
    rgba[dstOffset + 1] = 255;
    rgba[dstOffset + 2] = 255;
    rgba[dstOffset + 3] = alpha;
  }

  const png = await sharp(rgba, {
    raw: {
      width: info.width,
      height: info.height,
      channels: 4,
    },
  })
    .png()
    .toBuffer();

  return bufferToDataUrl(png, 'image/png');
}
