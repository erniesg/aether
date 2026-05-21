import { NextResponse } from 'next/server';
import { getEventBundle } from '@/lib/research/event-recap/store';
import {
  buildEventRawExport,
  eventPostsCsv,
  eventRawExportMetadata,
  type EventRawExportFormat,
  type EventRawExportScope,
} from '@/lib/research/event-recap/raw-export';
import { recordEventRawAccess } from '@/lib/research/event-recap/access-log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  const url = new URL(request.url);
  const format = parseFormat(url.searchParams.get('format'));
  const scope = parseScope(url.searchParams.get('scope'));
  const download = url.searchParams.get('download') !== '0';
  const bundle = await getEventBundle(eventId);

  if (!bundle) {
    return NextResponse.json({ ok: false, error: 'event not found' }, { status: 404 });
  }

  const metadata = eventRawExportMetadata(bundle, scope);
  const accessId = await recordEventRawAccess({
    eventId,
    action: download ? 'download' : 'inspect',
    format,
    scope,
    postCount: metadata.counts.posts,
    mediaCount: metadata.counts.mediaItems,
    schemaVersion: metadata.schemaVersion,
    latestRunId: metadata.latestRun?.runId,
    requestPath: url.pathname,
    requestQuery: url.searchParams.toString(),
    userAgent: request.headers.get('user-agent') ?? undefined,
    acceptLanguage: request.headers.get('accept-language') ?? undefined,
    browserPlatform: request.headers.get('sec-ch-ua-platform') ?? undefined,
    browserBrands: request.headers.get('sec-ch-ua') ?? undefined,
    referer: request.headers.get('referer') ?? undefined,
    ip:
      request.headers.get('cf-connecting-ip') ??
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim(),
    cfCountry: request.headers.get('cf-ipcountry') ?? undefined,
    cfColo: request.headers.get('cf-colo') ?? undefined,
    cfRay: request.headers.get('cf-ray') ?? undefined,
  });

  const filename = rawFilename(bundle.event.eventId, format);
  if (format === 'csv') {
    return new NextResponse(eventPostsCsv(bundle), {
      headers: rawHeaders('text/csv; charset=utf-8', filename, download, accessId),
    });
  }

  return NextResponse.json(buildEventRawExport(bundle, scope), {
    headers: rawHeaders('application/json; charset=utf-8', filename, download, accessId),
  });
}

function parseFormat(value: string | null): EventRawExportFormat {
  return value === 'csv' ? 'csv' : 'json';
}

function parseScope(value: string | null): EventRawExportScope {
  return value === 'raw' ? 'raw' : 'posts';
}

function rawFilename(eventId: string, format: EventRawExportFormat): string {
  return `${eventId}-source-pack.${format}`;
}

function rawHeaders(
  contentType: string,
  filename: string,
  download: boolean,
  accessId: string | undefined
): HeadersInit {
  return {
    'cache-control': 'private, no-store',
    'content-type': contentType,
    ...(accessId ? { 'x-aether-access-id': accessId } : {}),
    ...(download
      ? { 'content-disposition': `attachment; filename="${filename}"` }
      : {}),
  };
}
