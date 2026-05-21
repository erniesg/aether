import { renderHtml } from '@/workers/aie2026-vibes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return new Response(renderHtml(), {
    headers: {
      'cache-control': 'private, no-store',
      'content-type': 'text/html; charset=utf-8',
    },
  });
}
