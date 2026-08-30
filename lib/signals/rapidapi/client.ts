export type FetchLike = (
  input: string,
  init?: RequestInit
) => Promise<Response>;

export class MissingRapidApiKeyError extends Error {
  constructor() {
    super(
      'RAPIDAPI_KEY is not set. Configure it in your env or wrangler secrets — see docs/SIGNALS-SECRETS.md.'
    );
    this.name = 'MissingRapidApiKeyError';
  }
}

export class RapidApiHttpError extends Error {
  readonly status: number;
  readonly host: string;
  readonly path: string;
  readonly body: string;

  constructor(opts: { status: number; host: string; path: string; body: string }) {
    super(
      `RapidAPI request failed: ${opts.status} ${opts.host}${opts.path}: ${opts.body.slice(0, 240)}`
    );
    this.name = 'RapidApiHttpError';
    this.status = opts.status;
    this.host = opts.host;
    this.path = opts.path;
    this.body = opts.body;
  }
}

export interface RapidApiRequest {
  host: string;
  path: string;
  params?: Record<string, string | number | undefined>;
  method?: 'GET' | 'POST';
  body?: unknown;
  signal?: AbortSignal;
}

export interface RapidApiClient {
  request<T = unknown>(req: RapidApiRequest): Promise<T>;
  hasKey(): boolean;
}

export interface RapidApiClientOptions {
  apiKey?: string;
  fetchImpl?: FetchLike;
  baseUrl?: (host: string) => string;
}

function readApiKey(explicit?: string): string | undefined {
  if (explicit && explicit.trim()) return explicit.trim();
  if (typeof process !== 'undefined' && process.env?.RAPIDAPI_KEY) {
    return process.env.RAPIDAPI_KEY.trim();
  }
  return undefined;
}

function buildUrl(host: string, path: string, params?: RapidApiRequest['params']) {
  const safePath = path.startsWith('/') ? path : `/${path}`;
  const url = new URL(`https://${host}${safePath}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null) continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

export function createRapidApiClient(
  opts: RapidApiClientOptions = {}
): RapidApiClient {
  const apiKey = readApiKey(opts.apiKey);
  const fetchImpl: FetchLike =
    opts.fetchImpl ?? ((input, init) => fetch(input, init));

  return {
    hasKey() {
      return Boolean(apiKey);
    },

    async request<T>(req: RapidApiRequest): Promise<T> {
      if (!apiKey) throw new MissingRapidApiKeyError();
      if (!req.host) throw new Error('RapidAPI request requires a host');

      const url = buildUrl(req.host, req.path, req.params);
      const headers: Record<string, string> = {
        'X-RapidAPI-Key': apiKey,
        'X-RapidAPI-Host': req.host,
        Accept: 'application/json',
      };

      const init: RequestInit = {
        method: req.method ?? 'GET',
        headers,
        signal: req.signal,
      };

      if (req.body !== undefined) {
        headers['Content-Type'] = 'application/json';
        init.body = JSON.stringify(req.body);
      }

      const res = await fetchImpl(url, init);
      const text = await res.text();
      if (!res.ok) {
        throw new RapidApiHttpError({
          status: res.status,
          host: req.host,
          path: req.path,
          body: text,
        });
      }

      if (!text) return undefined as T;
      try {
        return JSON.parse(text) as T;
      } catch {
        throw new Error(
          `RapidAPI ${req.host}${req.path} returned non-JSON body: ${text.slice(0, 240)}`
        );
      }
    },
  };
}

export function rapidApiKeyConfigured(): boolean {
  return Boolean(readApiKey());
}
