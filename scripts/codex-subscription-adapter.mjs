#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

export const CODEX_PROVIDER_ID = 'codex';
export const CODEX_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';
export const CODEX_DEVICE_USERCODE_URL =
  'https://auth.openai.com/api/accounts/deviceauth/usercode';
export const CODEX_DEVICE_TOKEN_URL =
  'https://auth.openai.com/api/accounts/deviceauth/token';
export const CODEX_DEVICE_VERIFY_URL = 'https://auth.openai.com/codex/device';
export const CODEX_OAUTH_TOKEN_URL = 'https://auth.openai.com/oauth/token';
export const CODEX_OAUTH_REDIRECT_URI = 'https://auth.openai.com/deviceauth/callback';
export const CODEX_RESPONSES_URL = 'https://chatgpt.com/backend-api/codex/responses';
export const DEFAULT_CODEX_MODEL = 'gpt-5.3-codex';
export const DEFAULT_REASONING_EFFORT = 'medium';
export const CODEX_CUSTOM_HEADERS = Object.freeze({ originator: 'forge' });
export const CODEX_SCOPES = Object.freeze([
  'openid',
  'profile',
  'email',
  'offline_access',
]);

const REFRESH_BUFFER_MS = 5 * 60 * 1000;
const DEFAULT_DEVICE_EXPIRES_SECONDS = 300;

function usage() {
  return [
    'Usage:',
    '  node scripts/codex-subscription-adapter.mjs print-config',
    '  node scripts/codex-subscription-adapter.mjs login --live [--credential-path <path>]',
    '  node scripts/codex-subscription-adapter.mjs refresh --live [--credential-path <path>]',
    '  node scripts/codex-subscription-adapter.mjs request --live --prompt-file <path> [--credential-path <path>]',
    '  node scripts/codex-subscription-adapter.mjs import-codegraff --codegraff-path <path> [--credential-path <path>]',
    '',
    'Live commands require --live so tests, CI, and accidental local runs do not export repo context.',
  ].join('\n');
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      args._.push(token);
      continue;
    }
    const [rawKey, inlineValue] = token.slice(2).split(/=(.*)/s, 2);
    const key = rawKey.replace(/-([a-z])/g, (_, chr) => chr.toUpperCase());
    if (inlineValue !== undefined) {
      args[key] = inlineValue;
      continue;
    }
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    i += 1;
  }
  return args;
}

export function defaultCredentialPath(env = process.env) {
  if (env.AETHER_CODEX_CREDENTIAL_PATH) return resolve(env.AETHER_CODEX_CREDENTIAL_PATH);
  const configRoot =
    env.XDG_CONFIG_HOME ||
    (env.HOME ? join(env.HOME, '.config') : join(homedir(), '.config'));
  return join(configRoot, 'aether', 'codex-subscription.json');
}

export function defaultCodeGraffCredentialPath(env = process.env) {
  const basePath = env.FORGE_CONFIG || (env.HOME ? join(env.HOME, '.forge') : join(homedir(), '.forge'));
  return join(basePath, '.credentials.json');
}

function asBoolean(value) {
  return value === true || value === 'true' || value === '1';
}

function assertLive(args, action) {
  if (asBoolean(args.live)) return;
  throw new Error(
    `Refusing live network call for ${action}. Pass --live when you intentionally want to contact ChatGPT Codex.`
  );
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function parseInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function redact(value) {
  return String(value ?? '')
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/g, 'Bearer [redacted]')
    .replace(/"access_token"\s*:\s*"[^"]+"/g, '"access_token":"[redacted]"')
    .replace(/"refresh_token"\s*:\s*"[^"]+"/g, '"refresh_token":"[redacted]"')
    .replace(/"id_token"\s*:\s*"[^"]+"/g, '"id_token":"[redacted]"')
    .replace(/"accessToken"\s*:\s*"[^"]+"/g, '"accessToken":"[redacted]"')
    .replace(/"refreshToken"\s*:\s*"[^"]+"/g, '"refreshToken":"[redacted]"')
    .replace(/"idToken"\s*:\s*"[^"]+"/g, '"idToken":"[redacted]"')
    .replace(/\b(access_token|refresh_token|id_token|code_verifier|code)=([^&\s]+)/g, '$1=[redacted]');
}

function readJsonFile(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function writeJsonFile(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  try {
    chmodSync(path, 0o600);
  } catch {
    // chmod is best-effort on filesystems that do not preserve POSIX modes.
  }
}

function normalizeBase64Url(input) {
  const padded = input.padEnd(input.length + ((4 - (input.length % 4)) % 4), '=');
  return padded.replace(/-/g, '+').replace(/_/g, '/');
}

export function base64UrlDecodeJson(input) {
  return JSON.parse(Buffer.from(normalizeBase64Url(input), 'base64').toString('utf8'));
}

export function extractChatGptAccountId(token = '') {
  const parts = String(token).split('.');
  if (parts.length !== 3) return '';
  let claims;
  try {
    claims = base64UrlDecodeJson(parts[1]);
  } catch {
    return '';
  }
  return (
    claims.chatgpt_account_id ||
    claims['https://api.openai.com/auth']?.chatgpt_account_id ||
    ''
  );
}

export function buildDeviceCodeRequestBody(clientId = CODEX_CLIENT_ID) {
  return { client_id: clientId };
}

export function buildDeviceTokenPollBody({ deviceAuthId, userCode }) {
  if (!deviceAuthId || !userCode) {
    throw new Error('deviceAuthId and userCode are required to poll Codex device auth.');
  }
  return {
    device_auth_id: deviceAuthId,
    user_code: userCode,
  };
}

export function buildTokenExchangeBody({
  authorizationCode,
  codeVerifier,
  clientId = CODEX_CLIENT_ID,
}) {
  if (!authorizationCode || !codeVerifier) {
    throw new Error('authorizationCode and codeVerifier are required for token exchange.');
  }
  return new URLSearchParams({
    grant_type: 'authorization_code',
    code: authorizationCode,
    redirect_uri: CODEX_OAUTH_REDIRECT_URI,
    client_id: clientId,
    code_verifier: codeVerifier,
  });
}

export function buildRefreshTokenBody({ refreshToken, clientId = CODEX_CLIENT_ID }) {
  if (!refreshToken) throw new Error('refreshToken is required to refresh Codex OAuth.');
  return new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
  });
}

export function normalizeCredential(raw, { requireAccessToken = true } = {}) {
  const source = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (Array.isArray(source)) {
    const found = source.find((entry) => entry?.id === CODEX_PROVIDER_ID);
    if (!found) throw new Error('No codex credential found in credential array.');
    return normalizeCredential(found, { requireAccessToken });
  }

  const authDetails = source?.auth_details || source?.authDetails || {};
  const oauthDetails =
    authDetails.oauth ||
    authDetails.OAuth ||
    authDetails.OAuthDevice ||
    authDetails.oauth_device ||
    {};
  const tokens = source?.tokens || oauthDetails.tokens || {};
  const config = source?.config || oauthDetails.config || {};
  const urlParams = source?.url_params || source?.urlParams || {};
  const accessToken = source?.accessToken || source?.access_token || tokens.access_token || '';
  const idToken = source?.idToken || source?.id_token || tokens.id_token || '';
  const chatgptAccountId =
    source?.chatgptAccountId ||
    source?.chatgpt_account_id ||
    urlParams.chatgpt_account_id ||
    extractChatGptAccountId(idToken) ||
    extractChatGptAccountId(accessToken) ||
    '';

  if (requireAccessToken && !accessToken) {
    throw new Error('Codex credential is missing accessToken.');
  }

  return {
    provider: CODEX_PROVIDER_ID,
    clientId: source?.clientId || source?.client_id || config.client_id || CODEX_CLIENT_ID,
    accessToken,
    refreshToken: source?.refreshToken || source?.refresh_token || tokens.refresh_token || '',
    expiresAt: source?.expiresAt || source?.expires_at || tokens.expires_at || '',
    tokenType: source?.tokenType || source?.token_type || 'Bearer',
    idToken,
    chatgptAccountId,
    responseUrl: CODEX_RESPONSES_URL,
    updatedAt: source?.updatedAt || source?.updated_at || new Date().toISOString(),
  };
}

export function credentialNeedsRefresh(credential, at = new Date(), bufferMs = REFRESH_BUFFER_MS) {
  const normalized = normalizeCredential(credential);
  if (!normalized.refreshToken) return false;
  if (!normalized.expiresAt) return true;
  const expiresAt = Date.parse(normalized.expiresAt);
  if (!Number.isFinite(expiresAt)) return true;
  return expiresAt - at.getTime() <= bufferMs;
}

export function buildCredentialFromTokenResponse(response, previous = {}, at = new Date()) {
  if (!response?.access_token) throw new Error('Token response is missing access_token.');
  const previousCredential = previous ? normalizeCredential(previous, { requireAccessToken: false }) : {};
  const expiresIn = parseInteger(response.expires_in, 3600);
  const expiresAt = new Date(at.getTime() + expiresIn * 1000).toISOString();
  const idToken = response.id_token || previousCredential.idToken || '';
  return normalizeCredential(
    {
      accessToken: response.access_token,
      refreshToken: response.refresh_token || previousCredential.refreshToken || '',
      expiresAt,
      tokenType: response.token_type || 'Bearer',
      clientId: previousCredential.clientId || CODEX_CLIENT_ID,
      idToken,
      chatgptAccountId:
        extractChatGptAccountId(idToken) ||
        extractChatGptAccountId(response.access_token) ||
        previousCredential.chatgptAccountId ||
        '',
      updatedAt: at.toISOString(),
    },
    { requireAccessToken: true }
  );
}

export function buildCodexHeaders(credential, { conversationId } = {}) {
  const normalized = normalizeCredential(credential);
  const headers = {
    Authorization: `Bearer ${normalized.accessToken}`,
    'Content-Type': 'application/json',
    Accept: 'text/event-stream, application/json',
    ...CODEX_CUSTOM_HEADERS,
  };
  if (normalized.chatgptAccountId) {
    headers['ChatGPT-Account-Id'] = normalized.chatgptAccountId;
  }
  if (conversationId) {
    headers['x-client-request-id'] = conversationId;
    headers.session_id = conversationId;
  }
  return headers;
}

export function buildCodexResponsesRequest({
  model = DEFAULT_CODEX_MODEL,
  prompt,
  instructions = '',
  reasoningEffort = DEFAULT_REASONING_EFFORT,
  stream = true,
  serviceTier,
} = {}) {
  if (!prompt || !String(prompt).trim()) {
    throw new Error('prompt is required for Codex Responses requests.');
  }
  const request = {
    model,
    input: [
      {
        type: 'message',
        role: 'user',
        content: String(prompt),
      },
    ],
    stream: Boolean(stream),
    store: false,
    include: ['reasoning.encrypted_content'],
    reasoning: {
      effort: reasoningEffort,
      summary: 'auto',
    },
  };
  if (instructions && String(instructions).trim()) request.instructions = String(instructions);
  if (serviceTier) request.service_tier = serviceTier;
  return request;
}

export function parseSseEvents(raw = '') {
  const normalized = String(raw).replace(/\r\n/g, '\n');
  return normalized
    .split(/\n\n+/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const event = { event: 'message', data: '' };
      const data = [];
      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) event.event = line.slice('event:'.length).trim();
        if (line.startsWith('data:')) data.push(line.slice('data:'.length).trimStart());
      }
      event.data = data.join('\n');
      return event;
    });
}

export function extractTextDeltaFromSseEvent(event) {
  if (!event?.data || event.data === '[DONE]') return '';
  let payload;
  try {
    payload = JSON.parse(event.data);
  } catch {
    return '';
  }
  if (typeof payload.delta === 'string') return payload.delta;
  if (typeof payload.text === 'string' && payload.type === 'response.output_text.delta') {
    return payload.text;
  }
  return '';
}

export function extractTextFromResponsesJson(payload) {
  const chunks = [];
  const visit = (value) => {
    if (!value) return;
    if (typeof value === 'string') return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (typeof value !== 'object') return;
    if (typeof value.output_text === 'string') chunks.push(value.output_text);
    if (typeof value.text === 'string') chunks.push(value.text);
    if (typeof value.delta === 'string') chunks.push(value.delta);
    visit(value.content);
    visit(value.output);
  };
  visit(payload);
  return chunks.join('');
}

export function extractTextFromCodexResponse(raw = '') {
  const text = String(raw);
  const deltas = parseSseEvents(text).map(extractTextDeltaFromSseEvent).join('');
  if (deltas) return deltas;
  try {
    return extractTextFromResponsesJson(JSON.parse(text)) || text;
  } catch {
    return text;
  }
}

async function fetchText(fetchFn, url, init, label) {
  const response = await fetchFn(url, { redirect: 'manual', ...init });
  const text = await response.text();
  return { response, text, label };
}

async function fetchJson(fetchFn, url, init, label) {
  const { response, text } = await fetchText(fetchFn, url, init, label);
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`${label} returned non-JSON response (${response.status}): ${redact(text)}`);
  }
  if (!response.ok) {
    throw new Error(`${label} failed (${response.status}): ${redact(JSON.stringify(json))}`);
  }
  return json;
}

export async function startDeviceAuthorization({ live = false, fetchFn = fetch } = {}) {
  assertLive({ live }, 'Codex device authorization');
  const json = await fetchJson(
    fetchFn,
    CODEX_DEVICE_USERCODE_URL,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...CODEX_CUSTOM_HEADERS,
      },
      body: JSON.stringify(buildDeviceCodeRequestBody()),
    },
    'Codex device authorization'
  );
  return {
    deviceAuthId: json.device_auth_id,
    userCode: json.user_code,
    intervalSeconds: parseInteger(json.interval, 5),
    expiresInSeconds: parseInteger(json.expires_in, DEFAULT_DEVICE_EXPIRES_SECONDS),
    verificationUri: CODEX_DEVICE_VERIFY_URL,
  };
}

export async function pollDeviceAuthorization({
  deviceAuthId,
  userCode,
  intervalSeconds = 5,
  expiresInSeconds = DEFAULT_DEVICE_EXPIRES_SECONDS,
  live = false,
  fetchFn = fetch,
} = {}) {
  assertLive({ live }, 'Codex device token polling');
  const deadline = Date.now() + expiresInSeconds * 1000;
  const pollDelayMs = Math.max(1, intervalSeconds + 3) * 1000;
  const body = buildDeviceTokenPollBody({ deviceAuthId, userCode });

  while (Date.now() < deadline) {
    await sleep(pollDelayMs);
    const { response, text } = await fetchText(
      fetchFn,
      CODEX_DEVICE_TOKEN_URL,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...CODEX_CUSTOM_HEADERS,
        },
        body: JSON.stringify(body),
      },
      'Codex device token polling'
    );

    if (response.ok) {
      const json = JSON.parse(text);
      return {
        authorizationCode: json.authorization_code,
        codeVerifier: json.code_verifier,
      };
    }

    if (response.status === 403 || response.status === 404) continue;
    throw new Error(`Codex device token polling failed (${response.status}): ${redact(text)}`);
  }

  throw new Error('Timed out waiting for Codex device authorization.');
}

export async function exchangeAuthorizationCode({
  authorizationCode,
  codeVerifier,
  live = false,
  fetchFn = fetch,
} = {}) {
  assertLive({ live }, 'Codex OAuth token exchange');
  return fetchJson(
    fetchFn,
    CODEX_OAUTH_TOKEN_URL,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: buildTokenExchangeBody({ authorizationCode, codeVerifier }).toString(),
    },
    'Codex OAuth token exchange'
  );
}

export async function refreshAccessToken(credential, { live = false, fetchFn = fetch } = {}) {
  assertLive({ live }, 'Codex OAuth refresh');
  const normalized = normalizeCredential(credential);
  const tokenResponse = await fetchJson(
    fetchFn,
    CODEX_OAUTH_TOKEN_URL,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: buildRefreshTokenBody({
        refreshToken: normalized.refreshToken,
        clientId: normalized.clientId,
      }).toString(),
    },
    'Codex OAuth refresh'
  );
  return buildCredentialFromTokenResponse(tokenResponse, normalized);
}

export async function requestCodexText({
  credential,
  prompt,
  instructions = '',
  model = DEFAULT_CODEX_MODEL,
  reasoningEffort = DEFAULT_REASONING_EFFORT,
  serviceTier,
  conversationId,
  live = false,
  fetchFn = fetch,
} = {}) {
  assertLive({ live }, 'Codex Responses request');
  const normalized = normalizeCredential(credential);
  const request = buildCodexResponsesRequest({
    model,
    prompt,
    instructions,
    reasoningEffort,
    serviceTier,
    stream: true,
  });

  const response = await fetchFn(CODEX_RESPONSES_URL, {
    method: 'POST',
    redirect: 'manual',
    headers: buildCodexHeaders(normalized, { conversationId }),
    body: JSON.stringify(request),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Codex Responses request failed (${response.status}): ${redact(text)}`);
  }
  return extractTextFromCodexResponse(text);
}

async function runLogin(args) {
  assertLive(args, 'Codex subscription login');
  const device = await startDeviceAuthorization({ live: true });
  console.log(`Open ${device.verificationUri}`);
  console.log(`Enter code: ${device.userCode}`);
  const code = await pollDeviceAuthorization({ ...device, live: true });
  const tokenResponse = await exchangeAuthorizationCode({ ...code, live: true });
  const credential = buildCredentialFromTokenResponse(tokenResponse);
  const path = resolve(args.credentialPath || defaultCredentialPath());
  writeJsonFile(path, credential);
  console.log(`Saved Codex subscription credential to ${path}`);
}

function loadCredential(args) {
  const path = resolve(args.credentialPath || defaultCredentialPath());
  if (!existsSync(path)) {
    throw new Error(`Credential file not found: ${path}`);
  }
  return {
    path,
    credential: normalizeCredential(readJsonFile(path)),
  };
}

async function runRefresh(args) {
  assertLive(args, 'Codex subscription refresh');
  const { path, credential } = loadCredential(args);
  const refreshed = await refreshAccessToken(credential, { live: true });
  writeJsonFile(path, refreshed);
  console.log(`Refreshed Codex subscription credential at ${path}`);
}

function readPrompt(args) {
  if (args.prompt) return String(args.prompt);
  if (args.promptFile) return readFileSync(resolve(String(args.promptFile)), 'utf8');
  throw new Error('Pass --prompt or --prompt-file for a Codex request.');
}

async function printSseResponse(response) {
  if (!response.body?.getReader) {
    const text = await response.text();
    const deltas = parseSseEvents(text).map(extractTextDeltaFromSseEvent).join('');
    process.stdout.write(deltas || text);
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
    const splitAt = buffer.lastIndexOf('\n\n');
    if (splitAt === -1) continue;
    const complete = buffer.slice(0, splitAt);
    buffer = buffer.slice(splitAt + 2);
    for (const event of parseSseEvents(complete)) {
      process.stdout.write(extractTextDeltaFromSseEvent(event));
    }
  }
  for (const event of parseSseEvents(buffer)) {
    process.stdout.write(extractTextDeltaFromSseEvent(event));
  }
}

async function runRequest(args) {
  assertLive(args, 'Codex Responses request');
  const loaded = loadCredential(args);
  let credential = loaded.credential;
  if (credentialNeedsRefresh(credential)) {
    credential = await refreshAccessToken(credential, { live: true });
    writeJsonFile(loaded.path, credential);
  }

  const request = buildCodexResponsesRequest({
    model: args.model || DEFAULT_CODEX_MODEL,
    prompt: readPrompt(args),
    instructions: args.instructions || '',
    reasoningEffort: args.reasoningEffort || DEFAULT_REASONING_EFFORT,
    stream: args.stream !== 'false',
    serviceTier: args.serviceTier,
  });

  const response = await fetch(CODEX_RESPONSES_URL, {
    method: 'POST',
    redirect: 'manual',
    headers: buildCodexHeaders(credential, { conversationId: args.conversationId }),
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Codex Responses request failed (${response.status}): ${redact(text)}`);
  }

  if (asBoolean(args.raw)) {
    process.stdout.write(await response.text());
  } else {
    await printSseResponse(response);
  }
}

function runImportCodeGraff(args) {
  const codeGraffPath = resolve(args.codegraffPath || defaultCodeGraffCredentialPath());
  const targetPath = resolve(args.credentialPath || defaultCredentialPath());
  const credential = normalizeCredential(readJsonFile(codeGraffPath));
  writeJsonFile(targetPath, credential);
  console.log(`Imported CodeGraff Codex credential from ${codeGraffPath}`);
  console.log(`Saved local aether credential to ${targetPath}`);
}

function runPrintConfig(args) {
  const config = {
    provider: CODEX_PROVIDER_ID,
    clientId: CODEX_CLIENT_ID,
    deviceUsercodeUrl: CODEX_DEVICE_USERCODE_URL,
    deviceTokenUrl: CODEX_DEVICE_TOKEN_URL,
    deviceVerifyUrl: CODEX_DEVICE_VERIFY_URL,
    oauthTokenUrl: CODEX_OAUTH_TOKEN_URL,
    responsesUrl: CODEX_RESPONSES_URL,
    credentialPath: resolve(args.credentialPath || defaultCredentialPath()),
    codeGraffCredentialPath: resolve(args.codegraffPath || defaultCodeGraffCredentialPath()),
    liveCallsRequireFlag: true,
    githubActionsCredentialBridge: false,
  };
  console.log(JSON.stringify(config, null, 2));
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const command = args._[0] || 'help';

  if (command === 'help' || command === '--help' || command === '-h') {
    console.log(usage());
    return;
  }
  if (command === 'print-config') return runPrintConfig(args);
  if (command === 'login') return runLogin(args);
  if (command === 'refresh') return runRefresh(args);
  if (command === 'request') return runRequest(args);
  if (command === 'import-codegraff') return runImportCodeGraff(args);

  throw new Error(`Unknown command: ${command}\n${usage()}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(redact(error?.stack || error?.message || error));
    process.exitCode = 1;
  });
}
