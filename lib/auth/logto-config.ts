export interface PublicLogtoConfig {
  endpoint: string;
  appId: string;
  apiResource: string;
}

export interface ApiLogtoConfig {
  issuer: string;
  jwksUri: string;
  apiResource: string;
}

function clean(value: string | undefined): string | null {
  const next = value?.trim();
  return next ? next : null;
}

export function getPublicLogtoConfig(env: NodeJS.ProcessEnv = process.env): PublicLogtoConfig | null {
  const endpoint = clean(env.LOGTO_ENDPOINT);
  const appId = clean(env.LOGTO_APP_ID);
  const apiResource = clean(env.LOGTO_API_RESOURCE);
  if (!endpoint || !appId || !apiResource) return null;
  return { endpoint, appId, apiResource };
}

export function getApiLogtoConfig(env: NodeJS.ProcessEnv = process.env): ApiLogtoConfig | null {
  const issuer = clean(env.LOGTO_ISSUER);
  const jwksUri = clean(env.LOGTO_JWKS_URI);
  const apiResource = clean(env.LOGTO_API_RESOURCE);
  if (!issuer || !jwksUri || !apiResource) return null;
  return { issuer, jwksUri, apiResource };
}
