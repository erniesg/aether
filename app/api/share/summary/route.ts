import { NextResponse } from 'next/server';
import { canonicalUrlFromRequest } from '@/lib/share/url';
import { getShareSummary } from '@/lib/share/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const raw = url.searchParams.get('canonicalUrl') ?? url.searchParams.get('canonicalPath');
  if (!raw) {
    return NextResponse.json({ ok: false, error: 'canonicalUrl or canonicalPath is required' }, { status: 400 });
  }
  const canonicalUrl = canonicalUrlFromRequest(request.url, raw);
  const summary = await getShareSummary(canonicalUrl);
  return NextResponse.json({ ok: true, canonicalUrl, summary });
}
