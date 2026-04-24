import { NextResponse } from 'next/server';
import { ingestReferenceUrl } from '@/lib/providers/reference/registry';
import { genReferenceId } from '@/lib/providers/reference/og';
import type { ReferenceRecord } from '@/lib/providers/reference/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_FILE_BYTES = 8 * 1024 * 1024;

function jsonError(status: number, error: string, code?: string) {
  return NextResponse.json(
    { ok: false, error, ...(code ? { code } : {}) },
    { status }
  );
}

/**
 * POST /api/reference-ingest
 *
 * Accepts either:
 *  - `application/json`            → `{ url: string }` → routes through the
 *    `ReferenceProvider.canHandle` chain and returns the resulting record.
 *  - `multipart/form-data` + `file` → returns a local `upload` record with
 *    the file bytes encoded as a data URL preview.
 *
 * Shape: `{ ok: true, record: ReferenceRecord, fallback: boolean, providerId?: string }`
 */
export async function POST(request: Request) {
  const contentType = request.headers.get('content-type') ?? '';
  try {
    if (contentType.includes('multipart/form-data')) {
      return handleFile(request);
    }
    return handleUrl(request);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonError(500, message);
  }
}

async function handleUrl(request: Request): Promise<Response> {
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
  const url = typeof b.url === 'string' ? b.url.trim() : '';
  if (!url) {
    return jsonError(400, 'url is required');
  }
  try {
    const outcome = await ingestReferenceUrl(url);
    return NextResponse.json({
      ok: true,
      record: outcome.record,
      fallback: outcome.fallback,
      providerId: outcome.providerId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (
      /invalid URL/i.test(message) ||
      /unsupported URL scheme/i.test(message) ||
      /url required/i.test(message)
    ) {
      return jsonError(400, message);
    }
    if (/fetch failed/i.test(message)) {
      return jsonError(400, message, 'ingest_failed');
    }
    return jsonError(500, message);
  }
}

async function handleFile(request: Request): Promise<Response> {
  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) {
    return jsonError(400, 'file field required');
  }
  if (!file.type.startsWith('image/')) {
    return jsonError(400, 'file must be an image');
  }
  if (file.size > MAX_FILE_BYTES) {
    return jsonError(400, 'file exceeds 8 MB limit');
  }
  const buf = Buffer.from(await file.arrayBuffer());
  const dataUrl = `data:${file.type};base64,${buf.toString('base64')}`;
  const record: ReferenceRecord = {
    id: genReferenceId('ref_up'),
    kind: 'image',
    previewUrl: dataUrl,
    attribution: {
      source: 'upload',
      url: file.name,
    },
    capturedAt: new Date().toISOString(),
  };
  return NextResponse.json({
    ok: true,
    record,
    fallback: false,
    providerId: 'upload',
  });
}
