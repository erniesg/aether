import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const env = process.env.AETHER_ENV ?? 'local';
  const convexConfigured = Boolean(process.env.NEXT_PUBLIC_CONVEX_URL);
  const anthropicConfigured = Boolean(process.env.ANTHROPIC_API_KEY);

  return NextResponse.json({
    ok: true,
    service: 'aether',
    env,
    ts: new Date().toISOString(),
    deps: {
      convex: convexConfigured,
      anthropic: anthropicConfigured,
    },
  });
}
