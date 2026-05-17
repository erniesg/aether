import type {
  EventPostMedia,
  EventPlatform,
  EventResolution,
  PlatformScrapeResult,
} from './types';
import { deriveSeedFrontier } from './frontier';
import { makePostId, normalizeQuerySet } from './utils';

const SEARCH_ENDPOINT = 'https://api.search.tinyfish.ai';
const FETCH_ENDPOINT = 'https://api.fetch.tinyfish.ai';
const AGENT_ASYNC_ENDPOINT = 'https://agent.tinyfish.ai/v1/automation/run-async';
const AGENT_SSE_ENDPOINT = 'https://agent.tinyfish.ai/v1/automation/run-sse';
const AGENT_RUNS_ENDPOINT = 'https://agent.tinyfish.ai/v1/runs';
const VAULT_ITEMS_ENDPOINT = 'https://agent.tinyfish.ai/v1/vault/items';
const VAULT_ITEMS_SYNC_ENDPOINT = 'https://agent.tinyfish.ai/v1/vault/items/sync';

type Fetcher = typeof fetch;

interface TinyFishSearchResult {
  title?: string;
  snippet?: string;
  url?: string;
  site_name?: string;
}

interface TinyFishSearchResponse {
  query?: string;
  results?: TinyFishSearchResult[];
}

interface TinyFishFetchResponse {
  results?: Array<{
    url?: string;
    final_url?: string;
    title?: string;
    description?: string;
    image_links?: string[];
    text?: string | object;
  }>;
  errors?: unknown[];
}

interface TinyFishVaultItem {
  itemId?: string;
  label?: string;
  vaultName?: string;
  domains?: string[];
  fieldMetadata?: Array<{ fieldId?: string; label?: string; type?: string }>;
  hasTotp?: boolean;
}

interface TinyFishVaultItemsResponse {
  items?: TinyFishVaultItem[];
}

interface TinyFishCompleteEvent {
  type: 'COMPLETE';
  status?: string;
  result?: unknown;
  error?: unknown;
  help_message?: string;
}

interface TinyFishStreamingEvent {
  type: 'STREAMING_URL';
  streaming_url?: string;
}

interface TinyFishAsyncRunResponse {
  run_id?: string | null;
  runId?: string | null;
  id?: string | null;
  error?: unknown;
}

interface TinyFishRunRecord {
  run_id?: string;
  runId?: string;
  id?: string;
  status?: string;
  state?: string;
  run_status?: string;
  phase?: string;
  streaming_url?: string;
  streamingUrl?: string;
  result?: unknown;
  output?: unknown;
  final_result?: unknown;
  error?: unknown;
  message?: unknown;
  help_message?: unknown;
}

interface TinyFishBrowserPage {
  url?: string;
  title?: string;
  devtoolsFrontendUrl?: string;
  webSocketDebuggerUrl?: string;
}

type TinyFishSseEvent =
  | TinyFishCompleteEvent
  | TinyFishStreamingEvent
  | { type?: string; [key: string]: unknown };

export class TinyFishAgentRunError extends Error {
  readonly status?: string;
  readonly streamingUrl?: string;
  readonly needsHumanVerification: boolean;
  readonly raw?: unknown;

  constructor(
    message: string,
    details: {
      status?: string;
      streamingUrl?: string;
      needsHumanVerification?: boolean;
      raw?: unknown;
    } = {}
  ) {
    super(message);
    this.name = 'TinyFishAgentRunError';
    this.status = details.status;
    this.streamingUrl = details.streamingUrl;
    this.needsHumanVerification = Boolean(details.needsHumanVerification);
    this.raw = details.raw;
  }
}

export function isTinyFishAgentRunError(value: unknown): value is TinyFishAgentRunError {
  return value instanceof TinyFishAgentRunError;
}

export interface LinkedInVaultDiagnostic {
  configured: boolean;
  configuredItemCount: number;
  matchedItemCount: number;
  linkedInItemCount: number;
  ready: boolean;
  warnings: string[];
  items: Array<{
    itemId: string;
    label?: string;
    vaultName?: string;
    domains: string[];
    hasUsername: boolean;
    hasPassword: boolean;
    hasTotp?: boolean;
    configured: boolean;
  }>;
}

export interface LinkedInWarmSessionResult {
  status: 'started' | 'running' | 'ready' | 'needs_human_verification' | 'failed' | 'vault_not_ready';
  runId?: string;
  streamingUrl?: string;
  inspectorUrl?: string;
  browserBaseUrl?: string;
  needsHumanVerification: boolean;
  result?: unknown;
  error?: string;
  vault?: Omit<LinkedInVaultDiagnostic, 'items'> & {
    items: Array<Omit<LinkedInVaultDiagnostic['items'][number], 'itemId'> & { itemId: 'redacted' }>;
  };
  warnings: string[];
}

interface ScrapedPostPayload {
  url?: string;
  author_name?: string;
  authorName?: string;
  author_handle?: string;
  authorHandle?: string;
  author_url?: string;
  authorUrl?: string;
  author_headline?: string;
  authorHeadline?: string;
  author_location?: string;
  authorLocation?: string;
  author_followers?: number;
  authorFollowers?: number;
  author_description?: string;
  authorDescription?: string;
  text?: string;
  posted_at?: string;
  postedAt?: string;
  likes?: number;
  reposts?: number;
  replies?: number;
  comments?: number;
  reactions?: number;
  impressions?: number;
  views?: number;
  tags?: string[];
  media?: unknown;
  media_urls?: unknown;
  mediaUrls?: unknown;
  image_urls?: unknown;
  imageUrls?: unknown;
  image_links?: unknown;
  imageLinks?: unknown;
  images?: unknown;
  comments_list?: ScrapedCommentPayload[];
  commentsList?: ScrapedCommentPayload[];
  visible_comments?: ScrapedCommentPayload[];
  visibleComments?: ScrapedCommentPayload[];
}

interface ScrapedCommentPayload {
  url?: string;
  author_name?: string;
  authorName?: string;
  author_handle?: string;
  authorHandle?: string;
  author_url?: string;
  authorUrl?: string;
  author_headline?: string;
  authorHeadline?: string;
  text?: string;
  posted_at?: string;
  postedAt?: string;
  likes?: number;
  reactions?: number;
}

function apiKey(): string {
  const key = process.env.TINYFISH_API_KEY?.trim();
  if (!key && process.env.NODE_ENV === 'test') return 'test-tinyfish-key';
  if (!key) throw new Error('TINYFISH_API_KEY is not set');
  return key;
}

export async function resolveEventViaTinyFish(
  input: { name: string; contextHint?: string },
  fetcher: Fetcher = fetch
): Promise<EventResolution> {
  const query = `${input.name} Singapore event date official ${input.contextHint ?? ''}`.trim();
  const searchUrl = new URL(SEARCH_ENDPOINT);
  searchUrl.searchParams.set('query', query);
  searchUrl.searchParams.set('location', 'SG');
  searchUrl.searchParams.set('language', 'en');

  const searchRes = await fetcher(searchUrl, {
    headers: { 'X-API-Key': apiKey() },
  });
  if (!searchRes.ok) {
    throw new Error(`TinyFish Search failed: HTTP ${searchRes.status}`);
  }
  const searchJson = (await searchRes.json()) as TinyFishSearchResponse;
  const topResults = (searchJson.results ?? []).slice(0, 5);
  const urls = topResults
    .map((result) => result.url)
    .filter((url): url is string => Boolean(url));

  const fetched = urls.length
    ? await fetchEventPages(urls.slice(0, 3), fetcher).catch(() => null)
    : null;
  const text = [
    ...topResults.map((result) => `${result.title ?? ''}\n${result.snippet ?? ''}`),
    ...(fetched?.results ?? []).map((page) =>
      typeof page.text === 'string' ? `${page.title ?? ''}\n${page.text.slice(0, 3000)}` : ''
    ),
  ].join('\n\n');
  const dates = inferDateRange(text);

  return {
    canonicalName: inferName(input.name, topResults),
    officialUrl: urls[0],
    location: inferLocation(text) ?? 'Singapore',
    startsAt: dates.startsAt,
    endsAt: dates.endsAt,
    querySet: deriveSeedFrontier({
      eventName: input.name,
      contextHint: input.contextHint,
      officialUrl: urls[0],
      sourceUrls: urls,
    }).querySet,
    sourceUrls: urls,
    warnings: fetched?.errors?.length
      ? [`TinyFish Fetch returned ${fetched.errors.length} page errors`]
      : [],
  };
}

async function fetchEventPages(
  urls: string[],
  fetcher: Fetcher
): Promise<TinyFishFetchResponse> {
  const res = await fetcher(FETCH_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey(),
    },
    body: JSON.stringify({ urls, format: 'markdown', links: true, image_links: true }),
  });
  if (!res.ok) throw new Error(`TinyFish Fetch failed: HTTP ${res.status}`);
  return (await res.json()) as TinyFishFetchResponse;
}

export async function scrapePlatformViaTinyFish(
  input: {
    platform: EventPlatform;
    querySet: string[];
    windowStart: string;
    windowEnd: string;
    maxItems: number;
    credentialItemIds?: string[];
  },
  fetcher: Fetcher = fetch
): Promise<PlatformScrapeResult> {
  const goal = buildScrapeGoal(input);
  const payload: Record<string, unknown> = {
    url: platformSearchUrl(input.platform, input.querySet),
    goal,
    browser_profile: 'stealth',
    use_vault: input.platform === 'linkedin',
  };
  if (input.platform === 'linkedin' && process.env.TINYFISH_LINKEDIN_USE_PROFILE === '1') {
    payload.use_profile = true;
  }
  if (process.env.TINYFISH_USE_OUTPUT_SCHEMA === '1') {
    payload.output_schema = postOutputSchema(input.maxItems);
  }

  const proxyCountry = process.env.TINYFISH_PROXY_COUNTRY?.trim();
  if (proxyCountry) {
    payload.proxy_config = {
      enabled: true,
      type: 'tetra',
      country_code: proxyCountry,
    };
  }
  if (input.platform === 'linkedin' && input.credentialItemIds?.length) {
    payload.credential_item_ids = input.credentialItemIds;
  }

  const events = await runSse(payload, fetcher);
  const complete = events.find(
    (event): event is TinyFishCompleteEvent => event.type === 'COMPLETE'
  );
  const streaming = events.find(
    (event): event is TinyFishStreamingEvent => event.type === 'STREAMING_URL'
  );
  const streamingUrl = streaming?.streaming_url;
  if (!complete) {
    throw new TinyFishAgentRunError('TinyFish Agent stream ended without COMPLETE', {
      streamingUrl,
      needsHumanVerification: eventsNeedHumanVerification(events),
      raw: events,
    });
  }
  if (complete.status && complete.status !== 'COMPLETED') {
    const errorDetail = complete.error ? JSON.stringify(complete.error).slice(0, 600) : '';
    const help = complete.help_message ? ` Help: ${complete.help_message}` : '';
    const message =
      `TinyFish Agent ${input.platform} run failed (${complete.status})${
        errorDetail ? `: ${errorDetail}` : ''
      }${help}`;
    throw new TinyFishAgentRunError(message, {
      status: complete.status,
      streamingUrl,
      needsHumanVerification: eventsNeedHumanVerification(events),
      raw: complete.error ?? events,
    });
  }

  const posts = normalizeTinyFishPosts(input.platform, complete.result);
  return {
    platform: input.platform,
    posts: posts.slice(0, input.maxItems),
    streamingUrl,
    warnings: posts.length === 0 ? [`TinyFish returned no ${input.platform} posts`] : [],
    raw: complete.result,
  };
}

export async function scrapePlatformFrontierViaTinyFish(
  input: {
    platform: EventPlatform;
    querySet: string[];
    windowStart: string;
    windowEnd: string;
    maxItems: number;
    credentialItemIds?: string[];
    maxQueries?: number;
  },
  fetcher: Fetcher = fetch
): Promise<PlatformScrapeResult> {
  const queries = platformFrontierQueries(input.platform, input.querySet, input.maxQueries ?? 4);
  const maxPerQuery = Math.max(10, Math.ceil(input.maxItems / Math.max(1, Math.min(queries.length, 4))));
  const byUrl = new Map<string, PlatformScrapeResult['posts'][number]>();
  const streamingUrls: string[] = [];
  const warnings: string[] = [];
  const rawQueries: unknown[] = [];

  for (const query of queries) {
    if (byUrl.size >= input.maxItems) break;
    const result = await scrapePlatformViaTinyFish(
      {
        platform: input.platform,
        querySet: [query],
        windowStart: input.windowStart,
        windowEnd: input.windowEnd,
        maxItems: maxPerQuery,
        credentialItemIds: input.credentialItemIds,
      },
      fetcher
    );
    if (result.streamingUrl) streamingUrls.push(result.streamingUrl);
    warnings.push(...result.warnings.map((warning) => `${query}: ${warning}`));
    rawQueries.push({ query, raw: result.raw, posts: result.posts.length });
    for (const post of result.posts) byUrl.set(post.url, post);
  }

  return {
    platform: input.platform,
    posts: Array.from(byUrl.values()).slice(0, input.maxItems),
    streamingUrl: streamingUrls[0],
    warnings,
    raw: { queries: rawQueries, streamingUrls },
  };
}

export async function searchPlatformFallbackViaTinyFish(
  input: {
    platform: EventPlatform;
    querySet: string[];
    maxItems: number;
  },
  fetcher: Fetcher = fetch
): Promise<PlatformScrapeResult> {
  const query = platformSearchFallbackQuery(input.platform, input.querySet);
  const searchUrl = new URL(SEARCH_ENDPOINT);
  searchUrl.searchParams.set('query', query);
  searchUrl.searchParams.set('location', 'SG');
  searchUrl.searchParams.set('language', 'en');

  const searchRes = await fetcher(searchUrl, {
    headers: { 'X-API-Key': apiKey() },
  });
  if (!searchRes.ok) {
    throw new Error(`TinyFish Search fallback failed: HTTP ${searchRes.status}`);
  }
  const searchJson = (await searchRes.json()) as TinyFishSearchResponse;
  const results = (searchJson.results ?? [])
    .filter((result) => isPlatformPostUrl(input.platform, result.url))
    .slice(0, input.maxItems);

  return {
    platform: input.platform,
    posts: results.map((result) => {
      const text = result.snippet?.trim() || result.title?.trim() || '';
      const url = result.url as string;
      return {
        postId: makePostId(input.platform, url, text),
        platform: input.platform,
        url,
        authorName: authorFromSearchResult(input.platform, result),
        authorHandle: handleFromUrl(input.platform, url),
        authorUrl: profileUrlFromPostUrl(input.platform, url),
        text,
        metrics: {},
        tags: ['search-fallback'],
        raw: result,
      };
    }),
    warnings: [
      `TinyFish Agent could not access ${input.platform} posts directly; used Search API snippets as cited fallback`,
    ],
    raw: searchJson,
  };
}

export async function diagnoseLinkedInVault(
  input: { credentialItemIds?: string[]; sync?: boolean } = {},
  fetcher: Fetcher = fetch
): Promise<LinkedInVaultDiagnostic> {
  const configuredIds = input.credentialItemIds ?? [];
  const items = input.sync
    ? await syncTinyFishVaultItems(fetcher)
    : await listTinyFishVaultItems(fetcher);
  const configuredSet = new Set(configuredIds);
  const linkedInItems = items.filter((item) => vaultItemDomains(item).some(isLinkedInDomain));
  const matchedItems = configuredIds.length
    ? items.filter((item) => item.itemId && configuredSet.has(item.itemId))
    : [];
  const relevantItems = configuredIds.length ? matchedItems : linkedInItems;
  const normalized = relevantItems.map((item) => ({
    itemId: item.itemId ?? '',
    label: item.label,
    vaultName: item.vaultName,
    domains: vaultItemDomains(item),
    hasUsername: vaultItemHasField(item, 'username'),
    hasPassword: vaultItemHasField(item, 'password'),
    hasTotp: item.hasTotp,
    configured: Boolean(item.itemId && configuredSet.has(item.itemId)),
  }));
  const warnings: string[] = [];
  if (!configuredIds.length) {
    warnings.push('TINYFISH_LINKEDIN_CREDENTIAL_ITEM_IDS is not set; LinkedIn runs may not receive the intended Vault login.');
  }
  if (configuredIds.length && matchedItems.length === 0) {
    warnings.push('Configured LinkedIn credential item id was not found in TinyFish Vault. Sync Vault and update TINYFISH_LINKEDIN_CREDENTIAL_ITEM_IDS.');
  }
  if (matchedItems.length && !matchedItems.some((item) => vaultItemDomains(item).some(isLinkedInDomain))) {
    warnings.push('Configured LinkedIn credential item does not list linkedin.com in its domains.');
  }
  if (matchedItems.length && !matchedItems.some((item) => vaultItemHasField(item, 'password'))) {
    warnings.push('Configured LinkedIn credential item does not expose a password field to TinyFish.');
  }
  if (!linkedInItems.length) {
    warnings.push('TinyFish Vault has no credential item with a linkedin.com domain.');
  }

  return {
    configured: configuredIds.length > 0,
    configuredItemCount: configuredIds.length,
    matchedItemCount: matchedItems.length,
    linkedInItemCount: linkedInItems.length,
    ready:
      configuredIds.length > 0 &&
      matchedItems.some(
        (item) => vaultItemDomains(item).some(isLinkedInDomain) && vaultItemHasField(item, 'password')
      ),
    warnings,
    items: normalized,
  };
}

export async function warmLinkedInSessionViaTinyFish(
  input: {
    credentialItemIds?: string[];
    syncVault?: boolean;
    holdMinutes?: number;
    pollSeconds?: number;
    targetUrl?: string;
  } = {},
  fetcher: Fetcher = fetch
): Promise<LinkedInWarmSessionResult> {
  const credentialItemIds = input.credentialItemIds ?? linkedInCredentialItemIdsFromEnv();
  let vault: LinkedInVaultDiagnostic | undefined;
  try {
    vault = await diagnoseLinkedInVault({
      credentialItemIds,
      sync: input.syncVault,
    }, fetcher);
  } catch (err) {
    return {
      status: 'failed',
      needsHumanVerification: false,
      error: err instanceof Error ? err.message : String(err),
      warnings: ['TinyFish Vault diagnostic failed before LinkedIn warm-up.'],
    };
  }

  if (!vault.ready) {
    return {
      status: 'vault_not_ready',
      needsHumanVerification: false,
      vault: redactVaultDiagnostic(vault),
      warnings: vault.warnings,
    };
  }

  const holdMinutes = clampInteger(input.holdMinutes, 1, 20, 10);
  const payload: Record<string, unknown> = {
    url: input.targetUrl ?? 'https://www.linkedin.com/feed/',
    goal: buildLinkedInWarmGoal(holdMinutes),
    browser_profile: 'stealth',
    use_vault: true,
    credential_item_ids: credentialItemIds,
    agent_config: {
      max_duration_seconds: Math.max(120, holdMinutes * 60 + 90),
    },
  };
  if (process.env.TINYFISH_LINKEDIN_USE_PROFILE === '1') {
    payload.use_profile = true;
  }
  const proxyCountry = process.env.TINYFISH_PROXY_COUNTRY?.trim();
  if (proxyCountry) {
    payload.proxy_config = {
      enabled: true,
      type: 'tetra',
      country_code: proxyCountry,
    };
  }

  const created = await fetcher(AGENT_ASYNC_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey(),
    },
    body: JSON.stringify(payload),
  });
  const createdJson = (await created.json().catch(() => ({}))) as TinyFishAsyncRunResponse;
  if (!created.ok) {
    return {
      status: 'failed',
      needsHumanVerification: false,
      vault: redactVaultDiagnostic(vault),
      error: stringifyShort(createdJson.error ?? createdJson),
      warnings: ['TinyFish LinkedIn warm-up run could not be started.'],
    };
  }

  const runId = createdJson.run_id ?? createdJson.runId ?? createdJson.id ?? undefined;
  if (!runId) {
    return {
      status: 'failed',
      needsHumanVerification: false,
      vault: redactVaultDiagnostic(vault),
      error: stringifyShort(createdJson.error ?? createdJson),
      warnings: ['TinyFish LinkedIn warm-up response did not include a run id.'],
    };
  }

  const record = await pollTinyFishRunForBrowser(runId, input.pollSeconds ?? 18, fetcher);
  const runStatus = tinyFishRunStatus(record);
  const streamingUrl = stringValue(record?.streaming_url ?? record?.streamingUrl);
  const browserBaseUrl = tinyFishBrowserBaseUrl(streamingUrl);
  const inspectorUrl = browserBaseUrl
    ? await findTinyFishInspectorUrl(browserBaseUrl, fetcher).catch(() => undefined)
    : undefined;
  const result = record?.result ?? record?.output ?? record?.final_result;
  const status = linkedInWarmStatus(runStatus, result, record?.error, Boolean(inspectorUrl));
  const warnings = [
    ...vault.warnings,
    'TinyFish streamingUrl is a read-only live preview; use inspectorUrl for human LinkedIn verification when present.',
    'TinyFish documents that streaming URLs may become unavailable after a run completes.',
  ];
  if (status === 'needs_human_verification' && !inspectorUrl) {
    warnings.push('LinkedIn needs human verification, but no active inspector URL was available from the TinyFish run host.');
  }

  return {
    status,
    runId,
    streamingUrl,
    inspectorUrl,
    browserBaseUrl,
    needsHumanVerification: status === 'needs_human_verification',
    result,
    error: record?.error ? stringifyShort(record.error) : undefined,
    vault: redactVaultDiagnostic(vault),
    warnings,
  };
}

function buildLinkedInWarmGoal(holdMinutes: number): string {
  return [
    'Warm a LinkedIn session for an event recap collection workflow.',
    'Use the selected Vault credential and the default browser profile if available.',
    'Do not post, like, follow, message, search, or change account settings.',
    'If LinkedIn asks for login, identity verification, 2FA, checkpoint, captcha, or any human action, stop on that page and keep the browser active.',
    `Wait up to ${holdMinutes} minutes for a human to complete verification through the DevTools inspector.`,
    'If the LinkedIn feed is visible, leave the browser on LinkedIn and return JSON only shaped as {"status":"ready"}.',
    'If the handoff window ends before the feed is visible, return JSON only shaped as {"status":"needs_human_verification","reason":"human handoff window ended"}.',
  ].join('\n');
}

function linkedInCredentialItemIdsFromEnv(): string[] | undefined {
  const raw = process.env.TINYFISH_LINKEDIN_CREDENTIAL_ITEM_IDS?.trim();
  if (!raw) return undefined;
  const ids = raw
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  return ids.length ? ids : undefined;
}

async function pollTinyFishRunForBrowser(
  runId: string,
  pollSeconds: number,
  fetcher: Fetcher
): Promise<TinyFishRunRecord | undefined> {
  const deadline = Date.now() + Math.max(1, Math.min(60, pollSeconds)) * 1000;
  let record: TinyFishRunRecord | undefined;
  while (Date.now() <= deadline) {
    record = await getTinyFishRun(runId, fetcher);
    const status = tinyFishRunStatus(record);
    if (record?.streaming_url || record?.streamingUrl || isTerminalTinyFishRunStatus(status)) break;
    await sleep(1500);
  }
  return record;
}

async function getTinyFishRun(runId: string, fetcher: Fetcher): Promise<TinyFishRunRecord | undefined> {
  const res = await fetcher(`${AGENT_RUNS_ENDPOINT}/${encodeURIComponent(runId)}`, {
    headers: { 'X-API-Key': apiKey() },
  });
  if (!res.ok) return undefined;
  return (await res.json().catch(() => undefined)) as TinyFishRunRecord | undefined;
}

async function findTinyFishInspectorUrl(
  browserBaseUrl: string,
  fetcher: Fetcher
): Promise<string | undefined> {
  const res = await fetcher(`${browserBaseUrl}/pages`);
  if (!res.ok) return undefined;
  const pages = (await res.json().catch(() => [])) as TinyFishBrowserPage[];
  if (!Array.isArray(pages)) return undefined;
  const page =
    pages.find((candidate) => {
      const url = candidate.url?.trim();
      return url && !['about:blank', 'about:newtab'].includes(url);
    }) ?? pages[0];
  return page?.devtoolsFrontendUrl;
}

export function tinyFishBrowserBaseUrl(streamingUrl?: string): string | undefined {
  if (!streamingUrl) return undefined;
  return streamingUrl.replace(/\/stream\/\d+.*$/, '');
}

function tinyFishRunStatus(record: TinyFishRunRecord | undefined): string | undefined {
  return stringValue(record?.status ?? record?.state ?? record?.run_status ?? record?.phase);
}

function isTerminalTinyFishRunStatus(status?: string): boolean {
  return ['COMPLETED', 'FAILED', 'CANCELLED', 'ERROR'].includes((status ?? '').toUpperCase());
}

function linkedInWarmStatus(
  runStatus?: string,
  result?: unknown,
  error?: unknown,
  hasInspector = false
): LinkedInWarmSessionResult['status'] {
  const status = (runStatus ?? '').toUpperCase();
  if (status === 'RUNNING' && hasInspector) return 'needs_human_verification';
  if (status === 'RUNNING' || status === 'PENDING') return 'running';
  if (error) return needsHumanFromValue(error) ? 'needs_human_verification' : 'failed';
  if (result && typeof result === 'object') {
    const resultStatus = stringValue((result as Record<string, unknown>).status).toLowerCase();
    const loggedIn = (result as Record<string, unknown>).logged_in ?? (result as Record<string, unknown>).loggedIn;
    const feedVisible = (result as Record<string, unknown>).feedVisible;
    if (resultStatus === 'ready' || loggedIn === true || feedVisible === true) return 'ready';
    if (resultStatus.includes('needs_human') || needsHumanFromValue(result)) return 'needs_human_verification';
    if (resultStatus.includes('fail') || resultStatus.includes('block') || failedFromValue(result)) return 'failed';
  }
  if (needsHumanFromValue(result)) return 'needs_human_verification';
  if (failedFromValue(result)) return 'failed';
  if (status === 'COMPLETED') return 'ready';
  return 'started';
}

function needsHumanFromValue(value: unknown): boolean {
  const text = stringifyShort(value, 3000).toLowerCase();
  return [
    'verification code',
    'verify your identity',
    'two-step',
    'two factor',
    '2fa',
    'security code',
    'checkpoint',
    'captcha',
    'challenge',
    'email otp',
    'email pin',
    'needs_human_verification',
  ].some((marker) => text.includes(marker));
}

function failedFromValue(value: unknown): boolean {
  const text = stringifyShort(value, 3000).toLowerCase();
  return [
    'login failed',
    'wrong email or password',
    'blocked by login wall',
    'status":"failed',
    'status":"failure',
    'status":"blocked',
  ].some((marker) => text.includes(marker));
}

function redactVaultDiagnostic(
  diagnostic: LinkedInVaultDiagnostic
): LinkedInWarmSessionResult['vault'] {
  return {
    ...diagnostic,
    items: diagnostic.items.map((item) => ({
      ...item,
      itemId: 'redacted' as const,
    })),
  };
}

function stringifyShort(value: unknown, limit = 600): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value ?? '');
  return text.replace(/\s+/g, ' ').slice(0, limit);
}

function clampInteger(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function listTinyFishVaultItems(fetcher: Fetcher): Promise<TinyFishVaultItem[]> {
  const res = await fetcher(VAULT_ITEMS_ENDPOINT, {
    headers: { 'X-API-Key': apiKey() },
  });
  if (!res.ok) throw new Error(`TinyFish Vault items failed: HTTP ${res.status}`);
  const json = (await res.json()) as TinyFishVaultItemsResponse;
  return Array.isArray(json.items) ? json.items : [];
}

async function syncTinyFishVaultItems(fetcher: Fetcher): Promise<TinyFishVaultItem[]> {
  const res = await fetcher(VAULT_ITEMS_SYNC_ENDPOINT, {
    method: 'POST',
    headers: { 'X-API-Key': apiKey() },
  });
  if (!res.ok) throw new Error(`TinyFish Vault sync failed: HTTP ${res.status}`);
  const json = (await res.json()) as TinyFishVaultItemsResponse;
  return Array.isArray(json.items) ? json.items : [];
}

function vaultItemDomains(item: TinyFishVaultItem): string[] {
  return Array.isArray(item.domains) ? item.domains.filter((domain): domain is string => typeof domain === 'string') : [];
}

function isLinkedInDomain(domain: string): boolean {
  return /(^|\.)linkedin\.com$/i.test(domain);
}

function vaultItemHasField(item: TinyFishVaultItem, name: string): boolean {
  const fields = Array.isArray(item.fieldMetadata) ? item.fieldMetadata : [];
  return fields.some((field) => {
    const id = field.fieldId?.toLowerCase() ?? '';
    const label = field.label?.toLowerCase() ?? '';
    return id.includes(name) || label.includes(name);
  });
}

export async function countPlatformViaTinyFishSearch(
  input: {
    platform: EventPlatform;
    querySet: string[];
    maxQueries?: number;
  },
  fetcher: Fetcher = fetch
): Promise<{
  platform: EventPlatform;
  estimates: Array<{ source: string; query: string; count: number; urls: string[]; error?: string }>;
  totalLowerBound: number;
  warnings: string[];
}> {
  const queries = normalizeQuerySet(input.querySet, input.maxQueries ?? 8);
  const estimates: Array<{ source: string; query: string; count: number; urls: string[]; error?: string }> = [];
  for (const source of queries) {
    const variants = platformCountQueries(input.platform, source);
    const urls = new Set<string>();
    const errors: string[] = [];
    for (const query of variants) {
      const searchUrl = new URL(SEARCH_ENDPOINT);
      searchUrl.searchParams.set('query', query);
      searchUrl.searchParams.set('location', 'SG');
      searchUrl.searchParams.set('language', 'en');
      try {
        const res = await fetcher(searchUrl, { headers: { 'X-API-Key': apiKey() } });
        if (!res.ok) {
          errors.push(`${query}: HTTP ${res.status}`);
          continue;
        }
        const json = (await res.json()) as TinyFishSearchResponse;
        for (const url of (json.results ?? [])
          .map((result) => result.url)
          .filter((url): url is string => Boolean(url))
          .filter((url) => isPlatformPostUrl(input.platform, url))) {
          urls.add(url);
        }
      } catch (err) {
        errors.push(`${query}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    estimates.push({
      source,
      query: variants.join(' || '),
      count: urls.size,
      urls: Array.from(urls),
      error: errors.length ? errors.join(' | ') : undefined,
    });
  }
  return {
    platform: input.platform,
    estimates,
    totalLowerBound: new Set(estimates.flatMap((estimate) => estimate.urls)).size,
    warnings: [
      `${input.platform} TinyFish Search counts are indexed-public URL estimates, not platform-total counts.`,
      'Search-index results are biased toward public, indexed, and high-ranking posts; use browser scraping for recall.',
    ],
  };
}

function platformCountQueries(platform: EventPlatform, source: string): string[] {
  if (platform !== 'linkedin') return [platformSearchFallbackQuery(platform, [source])];

  return normalizeQuerySet(
    linkedinQueryVariants(source).flatMap((variant) => {
      const stripped = stripLinkedInQueryHandleSyntax(variant);
      const quoted = stripped.startsWith('"') ? stripped : `"${stripped}"`;
      const withoutQuotes = stripped.replace(/"/g, '');
      return [
        `site:linkedin.com/posts ${quoted}`,
        `linkedin posts ${quoted}`,
        withoutQuotes ? `site:linkedin.com/posts ${withoutQuotes}` : '',
      ];
    }),
    6
  );
}

export function platformFrontierQueries(
  platform: EventPlatform,
  querySet: string[],
  limit = 4
): string[] {
  if (platform !== 'linkedin') return normalizeQuerySet(querySet, limit);
  return normalizeQuerySet(querySet.flatMap(linkedinQueryVariants), limit);
}

export function linkedinQueryVariants(source: string): string[] {
  const stripped = stripLinkedInQueryHandleSyntax(source);
  const spaced = splitCamelCaseHandles(stripped);
  return normalizeQuerySet([
    spaced,
    stripped,
    source,
  ], 4);
}

function stripLinkedInQueryHandleSyntax(source: string): string {
  return source
    .replace(/@([A-Za-z0-9_]+)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitCamelCaseHandles(source: string): string {
  return source
    .split(/\s+/)
    .map((token) => {
      if (!/[a-z][A-Z]/.test(token)) return token;
      return token
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
    })
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function runSse(
  payload: Record<string, unknown>,
  fetcher: Fetcher
): Promise<TinyFishSseEvent[]> {
  const timeoutMs = tinyFishAgentTimeoutMs();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const events: TinyFishSseEvent[] = [];
  try {
    const res = await fetcher(AGENT_SSE_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey(),
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!res.ok) {
      const errorBody = await res.text().catch(() => '');
      throw new Error(
        `TinyFish Agent SSE failed: HTTP ${res.status}${errorBody ? `: ${errorBody.slice(0, 300)}` : ''}`
      );
    }
    await readSseEvents(res, controller.signal, events);
  } catch (err) {
    if (controller.signal.aborted) {
      const streamingUrl = latestStreamingUrl(events);
      const suffix = streamingUrl ? `; streamingUrl=${streamingUrl}` : '';
      throw new TinyFishAgentRunError(`TinyFish Agent SSE timed out after ${timeoutMs}ms${suffix}`, {
        status: 'timeout',
        streamingUrl,
        needsHumanVerification: eventsNeedHumanVerification(events),
        raw: events,
      });
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
  return events;
}

async function readSseEvents(
  res: Response,
  signal: AbortSignal,
  events: TinyFishSseEvent[]
): Promise<TinyFishSseEvent[]> {
  if (!res.body) {
    events.push(...parseSseBody(await res.text()));
    return events;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (!signal.aborted) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let boundary = sseBoundary(buffer);
      while (boundary) {
        const block = buffer.slice(0, boundary.index);
        buffer = buffer.slice(boundary.index + boundary.length);
        const event = parseSseBlock(block);
        if (event) {
          events.push(event);
          if (event.type === 'COMPLETE') {
            await reader.cancel().catch(() => undefined);
            return events;
          }
        }
        boundary = sseBoundary(buffer);
      }
    }
  } finally {
    reader.releaseLock();
  }

  const tail = decoder.decode();
  if (tail) buffer += tail;
  const finalEvents = parseSseBody(buffer);
  events.push(...finalEvents);
  return events;
}

function parseSseBody(body: string): TinyFishSseEvent[] {
  const events: TinyFishSseEvent[] = [];
  for (const block of body.split(/(?:\r?\n){2,}/)) {
    const event = parseSseBlock(block);
    if (event) events.push(event);
  }
  return events;
}

function parseSseBlock(block: string): TinyFishSseEvent | null {
  const json = block
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.replace(/^data:\s*/, ''))
    .join('\n')
    .trim();
  if (!json) return null;
  try {
    return JSON.parse(json) as TinyFishSseEvent;
  } catch {
    // Ignore malformed progress chunks; COMPLETE still determines success.
    return null;
  }
}

function sseBoundary(buffer: string): { index: number; length: number } | null {
  const match = /\r?\n\r?\n/.exec(buffer);
  if (!match || match.index === undefined) return null;
  return { index: match.index, length: match[0].length };
}

function latestStreamingUrl(events: TinyFishSseEvent[]): string | undefined {
  return [...events]
    .reverse()
    .find((event): event is TinyFishStreamingEvent => event.type === 'STREAMING_URL')
    ?.streaming_url;
}

function eventsNeedHumanVerification(events: TinyFishSseEvent[]): boolean {
  const text = JSON.stringify(events).toLowerCase();
  return [
    'verification code',
    'verify your identity',
    'two-step',
    'two factor',
    '2fa',
    'security code',
    'checkpoint',
    'captcha',
    'challenge',
  ].some((marker) => text.includes(marker));
}

function tinyFishAgentTimeoutMs(): number {
  const raw = Number(process.env.TINYFISH_AGENT_TIMEOUT_MS ?? 110_000);
  if (!Number.isFinite(raw)) return 110_000;
  return Math.max(10_000, Math.min(300_000, Math.round(raw)));
}

function buildScrapeGoal(input: {
  platform: EventPlatform;
  querySet: string[];
  windowStart: string;
  windowEnd: string;
  maxItems: number;
}): string {
  const label = input.platform === 'x' ? 'X/Twitter' : 'LinkedIn';
  return [
    `Search ${label} public posts for this event recap corpus.`,
    `Queries: ${input.querySet.join(' | ')}`,
    `Only include posts about the event or "AI engineer Singapore" conversation, posted from ${input.windowStart} through ${input.windowEnd}.`,
    `Return at most ${input.maxItems} posts.`,
    input.platform === 'linkedin' && input.querySet.some((query) => isPlatformUrl('linkedin', query))
      ? 'Exclude job ads, generic hiring spam, and profile-only matches. On profile/activity pages, include visible reposted/shared posts when the original post is event-relevant even if the profile added no commentary; tag these as account-discovered and repost.'
      : 'Exclude job ads, generic hiring spam, profile-only matches, and duplicate reposts unless the repost text adds new commentary.',
    'Return ONLY valid JSON shaped as {"posts":[...]} with no markdown wrapper.',
    'For each post include url, author_name, author_handle, author_url, author_headline, author_location, author_followers, text, posted_at, likes/reposts/replies/comments/reactions/impressions/views when visible, and tags.',
    input.platform === 'linkedin'
      ? 'Use LinkedIn content search directly. If a query looks like a person, company, or account name and content search is sparse, open the most relevant LinkedIn profile/company page and its Posts/Activity tab, then collect event-relevant posts from there. When a post has visible comments, include up to 5 substantive attendee comments in comments_list with author_name, author_handle, author_url, author_headline, text, posted_at, likes/reactions. Avoid generic congratulations-only comments.'
      : 'Prefer posts with visible reach or engagement, but keep a mix of high-reach voices and useful niche commentary.',
    'Prefer attendee reactions, questions, critiques, takeaways, and useful resources over announcements.',
  ].join('\n');
}

function platformSearchUrl(platform: EventPlatform, querySet: string[]): string {
  const directUrl = querySet.map((query) => query.trim()).find((query) => isPlatformUrl(platform, query));
  if (directUrl) return directUrl;
  const q = encodeURIComponent(querySet.slice(0, 3).join(' OR '));
  if (platform === 'x') return `https://x.com/search?q=${q}&src=typed_query&f=live`;
  return `https://www.linkedin.com/search/results/content/?keywords=${q}`;
}

function isPlatformUrl(platform: EventPlatform, value: string): boolean {
  try {
    const url = new URL(value);
    if (platform === 'x') return /(^|\.)x\.com$/i.test(url.hostname);
    return /(^|\.)linkedin\.com$/i.test(url.hostname);
  } catch {
    return false;
  }
}

function platformSearchFallbackQuery(platform: EventPlatform, querySet: string[]): string {
  const quotedEvent = querySet.find((query) => query.startsWith('"')) ?? `"${querySet[0] ?? ''}"`;
  if (platform === 'x') return `site:x.com ${quotedEvent}`;
  return `site:linkedin.com/posts ${quotedEvent}`;
}

function isPlatformPostUrl(platform: EventPlatform, url?: string): boolean {
  if (!url) return false;
  if (platform === 'x') return /^https:\/\/x\.com\/[^/]+\/status\/\d+/i.test(url);
  return /^https:\/\/(?:www\.)?linkedin\.com\/posts\//i.test(url);
}

function authorFromSearchResult(
  platform: EventPlatform,
  result: TinyFishSearchResult
): string {
  const title = result.title?.trim();
  if (!title) return handleFromUrl(platform, result.url ?? '') ?? 'unknown';
  if (platform === 'linkedin') return title.split(' - LinkedIn')[0]?.trim() || title;
  return title.split(' on X')[0]?.trim() || handleFromUrl(platform, result.url ?? '') || title;
}

function handleFromUrl(platform: EventPlatform, url: string): string | undefined {
  try {
    const parsed = new URL(url);
    if (platform === 'x') return parsed.pathname.split('/').filter(Boolean)[0];
    if (platform === 'linkedin') return parsed.pathname.split('/')[2]?.split('_')[0];
  } catch {
    return undefined;
  }
  return undefined;
}

function profileUrlFromPostUrl(platform: EventPlatform, url: string): string | undefined {
  const handle = handleFromUrl(platform, url);
  if (!handle) return undefined;
  if (platform === 'x') return `https://x.com/${handle}`;
  return `https://www.linkedin.com/in/${handle}/`;
}

function postOutputSchema(maxItems: number) {
  return {
    type: 'object',
    properties: {
      posts: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            url: { type: 'string' },
            author_name: { type: 'string' },
            author_handle: { type: 'string' },
            author_url: { type: 'string' },
            author_headline: { type: 'string' },
            author_location: { type: 'string' },
            author_followers: { type: 'number' },
            text: { type: 'string' },
            posted_at: { type: 'string' },
            likes: { type: 'number' },
            reposts: { type: 'number' },
            replies: { type: 'number' },
            comments: { type: 'number' },
            reactions: { type: 'number' },
            impressions: { type: 'number' },
            views: { type: 'number' },
            image_urls: { type: 'array', items: { type: 'string' } },
            media_urls: { type: 'array', items: { type: 'string' } },
            media: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  url: { type: 'string' },
                  type: { type: 'string' },
                  alt_text: { type: 'string' },
                  preview_url: { type: 'string' },
                  width: { type: 'number' },
                  height: { type: 'number' },
                },
              },
            },
            tags: { type: 'array', items: { type: 'string' } },
            comments_list: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  url: { type: 'string' },
                  author_name: { type: 'string' },
                  author_handle: { type: 'string' },
                  author_url: { type: 'string' },
                  author_headline: { type: 'string' },
                  text: { type: 'string' },
                  posted_at: { type: 'string' },
                  likes: { type: 'number' },
                  reactions: { type: 'number' },
                },
              },
            },
          },
          required: ['url', 'author_name', 'text'],
        },
      },
    },
    required: ['posts'],
  };
}

export function normalizeTinyFishPosts(platform: EventPlatform, value: unknown) {
  const parsed = parseResultObject(value);
  const record = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  const posts = Array.isArray(record.posts) ? record.posts : [];
  return posts
    .filter((post): post is ScrapedPostPayload => Boolean(post && typeof post === 'object'))
    .flatMap((post) => {
      const text = stringValue(post.text);
      const url = stringValue(post.url) || platformSearchUrl(platform, [text.slice(0, 60)]);
      const authorName = stringValue(post.author_name ?? post.authorName) || 'unknown';
      const baseTags = Array.isArray(post.tags)
        ? post.tags.filter((tag): tag is string => typeof tag === 'string')
        : [];
      const normalized = [{
        postId: makePostId(platform, url, text),
        platform,
        url,
        authorName,
        authorHandle: stringValue(post.author_handle ?? post.authorHandle) || undefined,
        authorUrl: stringValue(post.author_url ?? post.authorUrl) || undefined,
        authorMeta: {
          headline: stringValue(post.author_headline ?? post.authorHeadline) || undefined,
          location: stringValue(post.author_location ?? post.authorLocation) || undefined,
          followers: numberValue(post.author_followers ?? post.authorFollowers),
          description: stringValue(post.author_description ?? post.authorDescription) || undefined,
        },
        text,
        postedAt: stringValue(post.posted_at ?? post.postedAt) || undefined,
        metrics: {
          likes: numberValue(post.likes),
          reposts: numberValue(post.reposts),
          replies: numberValue(post.replies),
          comments: numberValue(post.comments),
          reactions: numberValue(post.reactions),
          impressions: numberValue(post.impressions),
          views: numberValue(post.views),
        },
        media: mediaFromTinyFishPost(platform, post),
        tags: baseTags,
        raw: post,
      }];
      const comments = commentList(post)
        .map((comment, index) => normalizeTinyFishComment(platform, url, comment, index))
        .filter((comment) => comment.text.length > 0);
      return [...normalized, ...comments];
    })
    .filter((post) => post.text.length > 0);
}

function commentList(post: ScrapedPostPayload): ScrapedCommentPayload[] {
  const value = post.comments_list ?? post.commentsList ?? post.visible_comments ?? post.visibleComments;
  return Array.isArray(value) ? value.filter((comment) => Boolean(comment && typeof comment === 'object')) : [];
}

function normalizeTinyFishComment(
  platform: EventPlatform,
  parentUrl: string,
  comment: ScrapedCommentPayload,
  index: number
) {
  const text = stringValue(comment.text);
  const url = stringValue(comment.url) || `${parentUrl}#comment-${index + 1}-${makePostId(platform, parentUrl, text)}`;
  const authorName = stringValue(comment.author_name ?? comment.authorName) || 'unknown';
  return {
    postId: makePostId(platform, url, text),
    platform,
    url,
    authorName,
    authorHandle: stringValue(comment.author_handle ?? comment.authorHandle) || undefined,
    authorUrl: stringValue(comment.author_url ?? comment.authorUrl) || undefined,
    authorMeta: {
      headline: stringValue(comment.author_headline ?? comment.authorHeadline) || undefined,
    },
    text,
    postedAt: stringValue(comment.posted_at ?? comment.postedAt) || undefined,
    metrics: {
      likes: numberValue(comment.likes),
      reactions: numberValue(comment.reactions),
    },
    tags: [`${platform}-comment`, 'comment', 'conversation'],
    raw: comment,
  };
}

function parseResultObject(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  const candidate = fenced ?? trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    return {};
  }
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function mediaFromTinyFishPost(
  platform: EventPlatform,
  post: ScrapedPostPayload
): EventPostMedia[] | undefined {
  const byUrl = new Map<string, EventPostMedia>();
  const addMedia = (media: EventPostMedia) => {
    const key = media.url.trim();
    if (!key || byUrl.has(key)) return;
    byUrl.set(key, { ...media, url: key });
  };

  for (const source of [
    post.image_urls,
    post.imageUrls,
    post.image_links,
    post.imageLinks,
    post.media_urls,
    post.mediaUrls,
  ]) {
    for (const url of stringArray(source)) {
      addMedia({
        url,
        type: mediaTypeFromUrl(url, 'image'),
        source: `${platform}-tinyfish`,
      });
    }
  }

  for (const item of objectArray(post.media ?? post.images)) {
    const url = stringValue(item.url ?? item.src ?? item.href ?? item.image_url ?? item.imageUrl);
    if (!url) continue;
    addMedia({
      url,
      type: mediaTypeFromValue(stringValue(item.type), url),
      source: `${platform}-tinyfish`,
      previewUrl: stringValue(item.preview_url ?? item.previewUrl ?? item.preview_image_url) || undefined,
      altText: stringValue(item.alt_text ?? item.altText ?? item.alt) || undefined,
      width: numberValue(item.width),
      height: numberValue(item.height),
      localPath: stringValue(item.local_path ?? item.localPath) || undefined,
    });
  }

  const media = Array.from(byUrl.values());
  return media.length ? media : undefined;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => stringValue(item)).filter(Boolean);
}

function objectArray(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'));
}

function mediaTypeFromValue(value: string, url: string): EventPostMedia['type'] {
  const normalized = value.toLowerCase();
  if (normalized.includes('gif')) return 'gif';
  if (normalized.includes('video')) return 'video';
  if (normalized.includes('image') || normalized.includes('photo')) return 'image';
  return mediaTypeFromUrl(url);
}

function mediaTypeFromUrl(url: string, fallback: EventPostMedia['type'] = 'unknown'): EventPostMedia['type'] {
  const pathname = new URL(url, 'https://placeholder.local').pathname.toLowerCase();
  if (/\.(png|jpe?g|webp|avif|heic)$/.test(pathname)) return 'image';
  if (/\.gif$/.test(pathname)) return 'gif';
  if (/\.(mp4|mov|webm|m4v)$/.test(pathname)) return 'video';
  return fallback;
}

function inferName(fallback: string, results: TinyFishSearchResult[]): string {
  const title = results.find((result) => result.title)?.title;
  if (!title) return fallback;
  return title.split(/[|–-]/)[0]?.trim() || fallback;
}

function inferLocation(text: string): string | undefined {
  return /\bSingapore\b/i.test(text) ? 'Singapore' : undefined;
}

function inferDateRange(text: string): { startsAt?: string; endsAt?: string } {
  const range = text.match(
    /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2})\s*[-–]\s*(\d{1,2}),?\s+(20\d{2})\b/i
  );
  if (range) {
    const month = range[1];
    const startDay = Number(range[2]);
    const endDay = Number(range[3]);
    const year = range[4];
    const startsAt = parseDate(`${month} ${startDay}, ${year}`);
    const endsAt = parseDate(`${month} ${endDay}, ${year}`);
    return { startsAt, endsAt };
  }

  const single = inferIsoDate(text);
  return { startsAt: single, endsAt: single };
}

function inferIsoDate(text: string): string | undefined {
  const iso = text.match(/\b20\d{2}-\d{2}-\d{2}\b/)?.[0];
  if (iso) return new Date(`${iso}T00:00:00.000Z`).toISOString();
  const longDate = text.match(
    /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+20\d{2}\b/i
  )?.[0];
  if (!longDate) return undefined;
  return parseDate(longDate);
}

function parseDate(value: string): string | undefined {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}
