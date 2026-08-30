import { NextResponse } from 'next/server';
import { LogtoAuthError, verifyLogtoBearerToken } from '@/lib/auth/logto';
import {
  consumeVibesApiKeyCall,
  consumeVibesUserCall,
  dayKey,
  vibesDailyLimit,
  type VibesPrincipal,
  type VibesQuotaResult,
  type VibesUsageInput,
} from './access-store';

export type VibesAuthErrorCode =
  | 'missing_auth'
  | 'invalid_auth'
  | 'logto_not_configured'
  | 'quota_exceeded';

export interface VibesAuthFailure {
  ok: false;
  status: number;
  code: VibesAuthErrorCode;
  error: string;
}

export interface VibesAuthSuccess {
  ok: true;
  principal: VibesPrincipal;
  quota: VibesQuotaResult;
}

export type VibesAuthResult = VibesAuthSuccess | VibesAuthFailure;

export interface VibesUsageMetadata {
  route: string;
  action: string;
  requestId?: string;
  metadata?: Record<string, unknown>;
}

export async function authorizeVibesRequest(
  request: Request,
  usage: VibesUsageMetadata
): Promise<VibesAuthResult> {
  const requestId = usage.requestId ?? crypto.randomUUID();
  const common: VibesUsageInput = {
    route: usage.route,
    action: usage.action,
    day: dayKey(),
    requestId,
    dailyLimit: vibesDailyLimit(),
    metadata: {
      ...requestMetadata(request),
      ...(usage.metadata ?? {}),
    },
  };

  const rawToken = readBearerToken(request) ?? request.headers.get('x-api-key')?.trim();
  if (!rawToken) {
    const devUser = readDevUser(request);
    if (!devUser) return authFailure(401, 'missing_auth', 'Logto bearer token or Vibes API key is required.');
    const quota = await consumeVibesUserCall(
      { userId: devUser, source: 'dev', dailyLimit: common.dailyLimit },
      common
    );
    if (!quota.allowed) return quotaFailure(quota);
    return {
      ok: true,
      principal: {
        userId: devUser,
        source: 'dev',
        dailyLimit: quota.dailyLimit,
      },
      quota,
    };
  }

  if (rawToken.startsWith('vibes_')) {
    const quota = await consumeVibesApiKeyCall(rawToken, common);
    if (!quota.allowed) {
      if (quota.reason === 'quota_exceeded') return quotaFailure(quota);
      return authFailure(401, 'invalid_auth', 'Invalid Vibes API key.');
    }
    return {
      ok: true,
      principal: {
        userId: quota.userId!,
        userEmail: quota.userEmail,
        source: 'api-key',
        keyId: quota.keyId,
        dailyLimit: quota.dailyLimit,
      },
      quota,
    };
  }

  try {
    const logto = await verifyLogtoBearerToken(rawToken);
    const quota = await consumeVibesUserCall(
      {
        userId: logto.userId,
        userEmail: logto.email,
        source: 'logto',
        dailyLimit: common.dailyLimit,
      },
      common
    );
    if (!quota.allowed) return quotaFailure(quota);
    return {
      ok: true,
      principal: {
        userId: logto.userId,
        userEmail: logto.email,
        source: 'logto',
        dailyLimit: quota.dailyLimit,
      },
      quota,
    };
  } catch (err) {
    if (err instanceof LogtoAuthError) {
      return authFailure(401, 'logto_not_configured', err.message);
    }
    return authFailure(401, 'invalid_auth', 'Invalid Logto bearer token.');
  }
}

export async function resolveLogtoPrincipal(request: Request): Promise<
  | { ok: true; userId: string; userEmail?: string }
  | VibesAuthFailure
> {
  const rawToken = readBearerToken(request);
  if (!rawToken) {
    const devUser = readDevUser(request);
    if (devUser) return { ok: true, userId: devUser };
    return authFailure(401, 'missing_auth', 'Logto bearer token is required.');
  }
  if (rawToken.startsWith('vibes_')) {
    return authFailure(401, 'invalid_auth', 'Sign in with Logto before creating API keys.');
  }
  try {
    const logto = await verifyLogtoBearerToken(rawToken);
    return { ok: true, userId: logto.userId, userEmail: logto.email };
  } catch (err) {
    if (err instanceof LogtoAuthError) {
      return authFailure(401, 'logto_not_configured', err.message);
    }
    return authFailure(401, 'invalid_auth', 'Invalid Logto bearer token.');
  }
}

export function vibesAuthResponse(failure: VibesAuthFailure): Response {
  return NextResponse.json(
    { ok: false, code: failure.code, error: failure.error },
    { status: failure.status }
  );
}

function readBearerToken(request: Request): string | null {
  const header = request.headers.get('authorization')?.trim();
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1]?.trim() || null;
}

function readDevUser(request: Request): string | null {
  if (process.env.NODE_ENV === 'production') return null;
  const value = request.headers.get('x-vibes-dev-user')?.trim();
  return value || null;
}

function authFailure(status: number, code: VibesAuthErrorCode, error: string): VibesAuthFailure {
  return { ok: false, status, code, error };
}

function quotaFailure(quota: VibesQuotaResult): VibesAuthFailure {
  return authFailure(
    429,
    'quota_exceeded',
    `Daily Vibes API limit reached (${quota.dailyLimit} calls per user per day).`
  );
}

function requestMetadata(request: Request): Record<string, unknown> {
  const url = new URL(request.url);
  return {
    host: url.host,
    userAgent: request.headers.get('user-agent')?.slice(0, 160) ?? undefined,
    ip:
      request.headers.get('cf-connecting-ip') ??
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      undefined,
  };
}
