import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const OUTPUT_ROOT = path.resolve(process.cwd(), 'outputs', 'motion-draft-renders');

export async function GET(request: Request): Promise<Response> {
  const requestedPath = new URL(request.url).searchParams.get('path');
  const artifactPath = safeArtifactPath(requestedPath);
  if (!artifactPath) {
    return NextResponse.json({ ok: false, error: 'valid artifact path is required' }, { status: 400 });
  }

  try {
    const details = await stat(artifactPath);
    if (!details.isFile()) throw new Error('not a file');
    const contents = await readFile(artifactPath);
    const range = parseRange(request.headers.get('range'), contents.length);
    const headers = new Headers({
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-store',
      'Content-Type': mimeTypeForPath(artifactPath),
    });

    if (!range) {
      headers.set('Content-Length', String(contents.length));
      return new Response(new Uint8Array(contents), { status: 200, headers });
    }

    const body = contents.subarray(range.start, range.end + 1);
    headers.set('Content-Length', String(body.length));
    headers.set('Content-Range', `bytes ${range.start}-${range.end}/${contents.length}`);
    return new Response(new Uint8Array(body), { status: 206, headers });
  } catch {
    return NextResponse.json({ ok: false, error: 'artifact not found' }, { status: 404 });
  }
}

function safeArtifactPath(value: string | null): string | null {
  if (!value || value.includes('\0')) return null;
  const normalized = path.posix.normalize(value.replaceAll('\\', '/'));
  if (normalized === '..' || normalized.startsWith('../') || path.posix.isAbsolute(normalized)) {
    return null;
  }
  const absolute = path.resolve(OUTPUT_ROOT, normalized);
  return absolute.startsWith(`${OUTPUT_ROOT}${path.sep}`) ? absolute : null;
}

function parseRange(
  value: string | null,
  size: number
): { start: number; end: number } | null {
  if (!value) return null;
  const match = /^bytes=(\d+)-(\d*)$/.exec(value.trim());
  if (!match) return null;
  const start = Number(match[1]);
  const requestedEnd = match[2] ? Number(match[2]) : size - 1;
  if (!Number.isInteger(start) || !Number.isInteger(requestedEnd) || start < 0 || start >= size) {
    return null;
  }
  return { start, end: Math.min(size - 1, Math.max(start, requestedEnd)) };
}

function mimeTypeForPath(filePath: string): string {
  switch (path.extname(filePath).toLowerCase()) {
    case '.mp4':
      return 'video/mp4';
    case '.png':
      return 'image/png';
    case '.vtt':
      return 'text/vtt; charset=utf-8';
    case '.txt':
      return 'text/plain; charset=utf-8';
    case '.json':
      return 'application/json; charset=utf-8';
    default:
      return 'application/octet-stream';
  }
}
