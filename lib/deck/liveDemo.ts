export type DeckRequestMethod = 'GET' | 'POST';
export type DeckRequestAuthMode = 'public' | 'signed-in' | 'presenter-provided';

export interface DeckLiveEndpointConfig {
  id: string;
  label: string;
  method: DeckRequestMethod;
  path: string;
  authModes: DeckRequestAuthMode[];
  staticFallback?: unknown;
}

export interface DeckLiveDemoConfig {
  baseUrl: string;
  endpoints: DeckLiveEndpointConfig[];
}

export interface DeckRequestInput {
  endpointId: string;
  method: DeckRequestMethod;
  path: string;
  authMode: DeckRequestAuthMode;
  body?: Record<string, unknown>;
  formData?: {
    fileField: string;
    file?: File;
    fields: Record<string, string | number>;
  };
  signedIn?: boolean;
  presenterCredential?: string;
}

export interface DeckRunProvenance {
  sourceEndpoint: string;
  requestShape: string[];
  responseSummary: string;
  timestamp: number;
  authMode: DeckRequestAuthMode;
}

export interface DeckRequestResult {
  ok: boolean;
  status: number;
  response: unknown;
  responseSummary: string;
  metrics: {
    durationMs: number;
    resultCount?: number;
    cache?: string;
    rateLimit?: string;
    serverTiming?: string;
  };
  provenance: DeckRunProvenance;
}

function endpointFor(config: DeckLiveDemoConfig, request: DeckRequestInput) {
  const endpoint = config.endpoints.find((candidate) => candidate.id === request.endpointId);
  if (!endpoint || endpoint.method !== request.method || endpoint.path !== request.path) {
    throw new Error(`${request.method} ${request.path} is not allowlisted for this deck`);
  }
  if (!endpoint.authModes.includes(request.authMode)) {
    throw new Error(`${request.authMode} auth is not allowlisted for this endpoint`);
  }
  return endpoint;
}

export function validateDeckRequest(config: DeckLiveDemoConfig, request: DeckRequestInput) {
  const endpoint = endpointFor(config, request);
  if (request.authMode === 'signed-in' && !request.signedIn) {
    throw new Error('Please sign in before running this demo');
  }
  if (request.authMode === 'presenter-provided' && !request.presenterCredential) {
    throw new Error('A presenter credential is required for this demo');
  }
  return endpoint;
}

export function buildRequestSnippets(config: DeckLiveDemoConfig, request: DeckRequestInput) {
  validateDeckRequest(config, request);
  const url = new URL(request.path, config.baseUrl).toString();
  const authHeader =
    request.authMode === 'public' ? '' : " -H 'Authorization: Bearer $PRESENTER_TOKEN'";
  if (request.formData) {
    const fields = Object.entries(request.formData.fields)
      .map(([key, value]) => ` -F '${key}=${String(value)}'`)
      .join('');
    const fetchHeaders = request.authMode === 'public'
      ? '{}'
      : "{ Authorization: 'Bearer ' + presenterToken }";
    const formLines = [
      'const form = new FormData();',
      `form.set(${JSON.stringify(request.formData.fileField)}, imageFile);`,
      ...Object.entries(request.formData.fields).map(([key, value]) =>
        `form.set(${JSON.stringify(key)}, ${JSON.stringify(String(value))});`
      ),
    ].join('\n');
    return {
      curl: `curl -X ${request.method} '${url}'${authHeader} -F '${request.formData.fileField}=@/path/to/image.jpg'${fields}`,
      fetch: `${formLines}\nfetch(${JSON.stringify(url)}, { method: ${JSON.stringify(request.method)}, headers: ${fetchHeaders}, body: form })`,
    };
  }
  const body = request.body ? ` --data '${JSON.stringify(request.body)}'` : '';
  return {
    curl: `curl -X ${request.method} '${url}' -H 'Content-Type: application/json'${authHeader}${body}`,
    fetch: `fetch(${JSON.stringify(url)}, { method: ${JSON.stringify(request.method)}, headers: { 'Content-Type': 'application/json'${
      request.authMode === 'public' ? '' : ", Authorization: 'Bearer ' + presenterToken"
    } }, body: ${request.body ? `JSON.stringify(${JSON.stringify(request.body)})` : 'undefined'} })`,
  };
}

function responseSummary(response: unknown, status: number) {
  if (response && typeof response === 'object') {
    const record = response as Record<string, unknown>;
    if (typeof record.error === 'string') return record.error;
    const count = resultCount(response);
    if (count !== undefined) return `${count} results`;
  }
  return status >= 200 && status < 300 ? 'Request completed' : `Request failed (${status})`;
}

function resultCount(response: unknown): number | undefined {
  if (!response || typeof response !== 'object') return undefined;
  const record = response as Record<string, unknown>;
  if (Array.isArray(record.results)) return record.results.length;
  if (!record.data || typeof record.data !== 'object' || Array.isArray(record.data)) return undefined;
  const nestedResults = (record.data as Record<string, unknown>).results;
  return Array.isArray(nestedResults) ? nestedResults.length : undefined;
}

export async function executeDeckRequest(
  config: DeckLiveDemoConfig,
  request: DeckRequestInput,
  options: {
    fetcher?: typeof fetch;
    now?: () => number;
    elapsed?: () => number;
  } = {}
): Promise<DeckRequestResult> {
  validateDeckRequest(config, request);
  if (request.formData && !request.formData.file) {
    throw new Error('Choose an image before running this demo');
  }
  const startedAt = performance.now();
  const headers: Record<string, string> = request.formData ? {} : { 'Content-Type': 'application/json' };
  if (request.authMode === 'presenter-provided' && request.presenterCredential) {
    headers.Authorization = `Bearer ${request.presenterCredential}`;
  }
  const formData = request.formData ? new FormData() : null;
  if (formData && request.formData?.file) {
    formData.set(request.formData.fileField, request.formData.file);
    for (const [key, value] of Object.entries(request.formData.fields)) {
      formData.set(key, String(value));
    }
  }
  const response = await (options.fetcher ?? fetch)(new URL(request.path, config.baseUrl), {
    method: request.method,
    headers,
    body: formData ?? (request.body ? JSON.stringify(request.body) : undefined),
    credentials: request.authMode === 'signed-in' ? 'include' : 'same-origin',
  });
  const responseText = await response.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(responseText) as unknown;
  } catch {
    parsed = responseText;
  }
  const summary = responseSummary(parsed, response.status);
  return {
    ok: response.ok,
    status: response.status,
    response: parsed,
    responseSummary: summary,
    metrics: {
      durationMs: options.elapsed?.() ?? Math.round(performance.now() - startedAt),
      resultCount: resultCount(parsed),
      cache: response.headers.get('X-Cache') ?? undefined,
      rateLimit: response.headers.get('X-RateLimit-Remaining') ?? undefined,
      serverTiming: response.headers.get('Server-Timing') ?? undefined,
    },
    provenance: {
      sourceEndpoint: request.path,
      requestShape: request.formData
        ? [request.formData.fileField, ...Object.keys(request.formData.fields)].sort()
        : Object.keys(request.body ?? {}).sort(),
      responseSummary: summary,
      timestamp: options.now?.() ?? Date.now(),
      authMode: request.authMode,
    },
  };
}
