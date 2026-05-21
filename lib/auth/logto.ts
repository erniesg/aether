import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { getApiLogtoConfig, type ApiLogtoConfig } from './logto-config';

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

export interface LogtoPrincipal {
  userId: string;
  email?: string;
  claims: JWTPayload;
}

export class LogtoAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LogtoAuthError';
  }
}

export async function verifyLogtoBearerToken(
  token: string,
  config: ApiLogtoConfig | null = getApiLogtoConfig()
): Promise<LogtoPrincipal> {
  if (!config) {
    throw new LogtoAuthError('Logto API auth is not configured.');
  }

  const jwks = cachedJwks(config.jwksUri);
  const { payload } = await jwtVerify(token, jwks, {
    issuer: config.issuer,
    audience: config.apiResource,
  });

  if (!payload.sub) {
    throw new LogtoAuthError('Logto access token is missing sub.');
  }

  return {
    userId: payload.sub,
    email: typeof payload.email === 'string' ? payload.email : undefined,
    claims: payload,
  };
}

function cachedJwks(jwksUri: string): ReturnType<typeof createRemoteJWKSet> {
  const existing = jwksCache.get(jwksUri);
  if (existing) return existing;
  const next = createRemoteJWKSet(new URL(jwksUri));
  jwksCache.set(jwksUri, next);
  return next;
}
