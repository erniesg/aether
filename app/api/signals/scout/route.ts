import { NextResponse } from 'next/server';

import {
  rapidApiKeyConfigured,
} from '@/lib/signals/rapidapi/client';
import { scoutSignals, type ScoutResult } from '@/lib/signals/rapidapi/scout';
import { isSignalPlatform } from '@/lib/signals/rapidapi/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export interface SignalsScoutResponse extends ScoutResult {
  ok: boolean;
  error?: string;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, 'invalid JSON body');
  }
  if (!isObject(body)) return jsonError(400, 'body must be an object');

  const query = typeof body.query === 'string' ? body.query : '';
  if (!query.trim()) return jsonError(400, 'query is required');

  if (!rapidApiKeyConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        error: 'RAPIDAPI_KEY is not configured. See docs/SIGNALS-SECRETS.md.',
        query,
        platforms: [],
        hits: [],
        errors: [],
      } satisfies SignalsScoutResponse,
      { status: 503 }
    );
  }

  const platforms = Array.isArray(body.platforms)
    ? body.platforms.filter(isSignalPlatform)
    : undefined;
  const kind =
    typeof body.kind === 'string' &&
    (body.kind === 'keyword' || body.kind === 'hashtag' || body.kind === 'account')
      ? body.kind
      : undefined;
  const limit = typeof body.limit === 'number' ? body.limit : undefined;

  const result = await scoutSignals({ query, kind, limit, platforms });
  return NextResponse.json({ ok: true, ...result } satisfies SignalsScoutResponse);
}
