import { NextResponse } from 'next/server';
import { createVibesApiKey, listVibesApiKeys, vibesDailyLimit } from '@/lib/research/vibes/access-store';
import { resolveLogtoPrincipal, vibesAuthResponse } from '@/lib/research/vibes/access';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export async function GET(request: Request) {
  const principal = await resolveLogtoPrincipal(request);
  if (!principal.ok) return vibesAuthResponse(principal);
  const keys = await listVibesApiKeys(principal.userId);
  return NextResponse.json({
    ok: true,
    keys: keys.map(({ keyId, name, keyPrefix, status, dailyLimit, createdAt, lastUsedAt }) => ({
      keyId,
      name,
      keyPrefix,
      status,
      dailyLimit,
      createdAt,
      lastUsedAt,
    })),
    dailyLimit: vibesDailyLimit(),
  });
}

export async function POST(request: Request) {
  const principal = await resolveLogtoPrincipal(request);
  if (!principal.ok) return vibesAuthResponse(principal);

  const body = await request.json().catch(() => null);
  const name = isObject(body) && typeof body.name === 'string' ? body.name : undefined;
  const created = await createVibesApiKey({
    userId: principal.userId,
    userEmail: principal.userEmail,
    name,
    dailyLimit: vibesDailyLimit(),
  });

  return NextResponse.json({
    ok: true,
    apiKey: created.apiKey,
    key: {
      keyId: created.record.keyId,
      name: created.record.name,
      keyPrefix: created.record.keyPrefix,
      status: created.record.status,
      dailyLimit: created.record.dailyLimit,
      createdAt: created.record.createdAt,
    },
  });
}
