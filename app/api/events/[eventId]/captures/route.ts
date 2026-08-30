import fs from 'node:fs';
import path from 'node:path';
import { NextResponse } from 'next/server';
import JSZip from 'jszip';
import { authorizeEventApiRequest } from '@/lib/research/event-recap/api-auth';
import {
  eventCapturesCsv,
  findEventCaptureRun,
  type EventCaptureExportFormat,
} from '@/lib/research/event-recap/capture-export';
import type { EventPostCaptureRun } from '@/lib/research/event-recap/post-capture';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  const url = new URL(request.url);
  const format = parseFormat(url.searchParams.get('format'));
  const runId = url.searchParams.get('runId');
  const download = url.searchParams.get('download') !== '0';
  const authResponse = await authorizeEventApiRequest(request, {
    route: '/api/events/:eventId/captures',
    action: download ? 'download-capture-pack' : 'inspect-capture-pack',
    metadata: { eventId, format, runId, download },
  });
  if (authResponse) return authResponse;

  const run = findEventCaptureRun(eventId, runId);
  if (!run) {
    return NextResponse.json({ ok: false, error: 'capture run not found' }, { status: 404 });
  }

  const filename = `${eventId}-captures-${run.runId}.${format}`;
  if (format === 'zip') {
    const zip = await captureZip(run);
    const body = zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength) as ArrayBuffer;
    return new Response(body, {
      headers: captureHeaders('application/zip', filename, download),
    });
  }

  if (format === 'csv') {
    return new NextResponse(eventCapturesCsv(run), {
      headers: captureHeaders('text/csv; charset=utf-8', filename, download),
    });
  }

  return NextResponse.json(publicCaptureRun(run), {
    headers: captureHeaders('application/json; charset=utf-8', filename, download),
  });
}

function parseFormat(value: string | null): EventCaptureExportFormat {
  if (value === 'zip') return 'zip';
  return value === 'csv' ? 'csv' : 'json';
}

function captureHeaders(contentType: string, filename: string, download: boolean): HeadersInit {
  return {
    'cache-control': 'private, no-store',
    'content-type': contentType,
    ...(download ? { 'content-disposition': `attachment; filename="${filename}"` } : {}),
  };
}

function publicCaptureRun(run: EventPostCaptureRun) {
  return {
    ok: true,
    run: {
      eventId: run.eventId,
      runId: run.runId,
      provider: run.provider,
      targetCount: run.targetCount,
      capturedCount: run.capturedCount,
      resumedCount: run.resumedCount,
      pageCapturedCount: run.pageCapturedCount,
      blockedCount: run.blockedCount,
      failedCount: run.failedCount,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      captures: run.captures.map(({ screenshotPath: _screenshotPath, ...capture }) => capture),
    },
  };
}

async function captureZip(run: EventPostCaptureRun): Promise<Buffer> {
  const zip = new JSZip();
  zip.file('manifest.json', JSON.stringify(publicCaptureRun(run), null, 2));
  zip.file('captures.csv', eventCapturesCsv(run));
  for (const capture of run.captures) {
    if (!capture.screenshotRelPath) continue;
    const filePath = path.resolve(process.cwd(), capture.screenshotRelPath);
    if (!isInside(process.cwd(), filePath) || !fs.existsSync(filePath)) continue;
    zip.file(`screenshots/${path.basename(filePath)}`, fs.readFileSync(filePath));
  }
  return zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
}

function isInside(root: string, file: string): boolean {
  const relative = path.relative(root, file);
  return Boolean(relative) && !relative.startsWith('..') && !path.isAbsolute(relative);
}
