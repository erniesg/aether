import { NextResponse } from 'next/server';
import { ingestReferenceUrl } from '@/lib/providers/reference/registry';
import { genReferenceId } from '@/lib/providers/reference/og';
import type { ReferenceRecord } from '@/lib/providers/reference/types';
import { MAX_REF_BYTES } from '@/lib/refs/limits';
import { uploadAssetToConvex } from '@/lib/storage/convexAsset';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
    if (contentType.includes('application/json')) return handleUrl(request);
    return handleFile(request);
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
  if (
    !file ||
    typeof file !== 'object' ||
    typeof (file as File).arrayBuffer !== 'function'
  ) {
    return jsonError(400, 'file field required');
  }
  const uploadFile = file as File;
  if (!uploadFile.type.startsWith('image/')) {
    return jsonError(400, 'file must be an image');
  }
  if (uploadFile.size > MAX_REF_BYTES) {
    return jsonError(400, 'file exceeds 20 MB limit');
  }
  const buf = Buffer.from(await uploadFile.arrayBuffer());
  const workspaceId =
    typeof form.get('workspaceId') === 'string'
      ? String(form.get('workspaceId')).trim() || undefined
      : undefined;
  const uploaded = await uploadAssetToConvex({
    source: buf,
    kind: 'reference',
    mime: uploadFile.type,
    workspaceId,
    sourceUrl: uploadFile.name,
  });
  const previewUrl =
    uploaded?.publicUrl ?? `data:${uploadFile.type};base64,${buf.toString('base64')}`;
  const record: ReferenceRecord = {
    id: genReferenceId('ref_up'),
    kind: 'image',
    previewUrl,
    fullUrl: uploaded?.publicUrl,
    attribution: {
      source: 'upload',
      url: uploadFile.name,
    },
    capturedAt: new Date().toISOString(),
    title: uploadFile.name.replace(/\.[^.]+$/, ''),
    usageIntent: 'visual anchor',
    tags: ['upload'],
    assetId: uploaded?.id,
    origin: 'upload',
  };
  return NextResponse.json({
    ok: true,
    record,
    fallback: false,
    providerId: 'upload',
  });
}
