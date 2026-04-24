import { NextResponse } from 'next/server';
import { resolveEditableProvider } from '@/lib/providers/image/registry';
import {
  ImageGenError,
  ProviderUnavailableError,
} from '@/lib/providers/image/types';
import { fetchAsDataUrl, inferDataUrlMimeType } from '@/lib/segment/dataUrl';
import { buildOpenAIEditMaskDataUrl, type EditMaskRegion } from '@/lib/segment/editMask';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEFAULT_PLATE_PROMPT =
  'Reconstruct a clean background in the masked area. Preserve the original texture, lighting, shadows, and perspective. Do not add new objects or alter anything outside the mask.';
const DEFAULT_BACKGROUND_PROMPT =
  'Regenerate this as a clean background plate. Preserve usable composition, lighting, and perspective, and do not include the selected subject.';

function jsonError(status: number, error: string, code?: string) {
  return NextResponse.json(code ? { ok: false, error, code } : { ok: false, error }, { status });
}

function parsePositiveNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

function parseEditRegion(value: unknown): EditMaskRegion | 'all' {
  if (value === 'background' || value === 'all') return value;
  return 'selection';
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, 'invalid JSON body');
  }

  if (typeof body !== 'object' || body === null) {
    return jsonError(400, 'body must be an object');
  }

  const b = body as Record<string, unknown>;
  const providerId = typeof b.providerId === 'string' ? b.providerId : undefined;
  const model = typeof b.model === 'string' ? b.model : undefined;
  const prompt =
    typeof b.prompt === 'string' && b.prompt.trim().length > 0
      ? b.prompt.trim()
      : parseEditRegion(b.editRegion) === 'all'
      ? DEFAULT_BACKGROUND_PROMPT
      : DEFAULT_PLATE_PROMPT;
  const sourceUrl = typeof b.sourceUrl === 'string' ? b.sourceUrl.trim() : '';
  const maskUrl = typeof b.maskUrl === 'string' ? b.maskUrl.trim() : '';
  const width = parsePositiveNumber(b.width);
  const height = parsePositiveNumber(b.height);
  const editRegion = parseEditRegion(b.editRegion);

  if (!sourceUrl) {
    return jsonError(400, 'sourceUrl is required');
  }

  if (!maskUrl && editRegion !== 'all') {
    return jsonError(400, 'maskUrl is required');
  }

  if (!width || !height) {
    return jsonError(400, 'width and height are required');
  }

  try {
    const provider = resolveEditableProvider(providerId ?? 'openai', model);
    if (typeof provider.edit !== 'function') {
      return jsonError(400, `provider '${provider.id}' does not support edits`, 'edit_unsupported');
    }

    const result = await provider.edit(
      {
        prompt,
        sourceUrl,
        maskUrl:
          maskUrl && editRegion !== 'all'
            ? await buildOpenAIEditMaskDataUrl({
                maskUrl,
                editRegion,
                width,
                height,
              })
            : undefined,
        size: { w: width, h: height },
      },
      { model: model ?? provider.listModels()[0] ?? provider.id }
    );

    const first = result.images[0];
    if (!first) {
      throw new ImageGenError('provider returned no images', provider.id);
    }

    const dataUrl = first.dataUrl ?? (await fetchAsDataUrl(first.url));
    const mimeType = first.mimeType || inferDataUrlMimeType(dataUrl);

    return NextResponse.json({
      ok: true,
      provider: {
        id: result.provider,
        model: result.model,
      },
      plate: {
        url: first.url,
        dataUrl,
        mimeType,
        width: first.width,
        height: first.height,
      },
      raw: result.raw,
    });
  } catch (error) {
    if (error instanceof ProviderUnavailableError) {
      return jsonError(503, error.message, 'provider_unavailable');
    }

    if (error instanceof ImageGenError) {
      return jsonError(502, error.message, 'image_edit_failed');
    }

    const message = error instanceof Error ? error.message : String(error);
    return jsonError(500, message);
  }
}
