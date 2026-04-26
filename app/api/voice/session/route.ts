import { NextResponse } from 'next/server';
import { VOICE_TOOL_DEFINITIONS } from '@/lib/voice/tools';
import type {
  VoiceProviderId,
  VoiceSessionCredentials,
} from '@/lib/voice/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const OPENAI_DEFAULT_MODEL = 'gpt-4o-realtime-preview';
const OPENAI_DEFAULT_VOICE = 'alloy';
// Per the provider mandate: Gemini is the voice layer for aether. Default to
// the current Live preview model; env override via GEMINI_LIVE_MODEL.
const GEMINI_DEFAULT_MODEL = 'gemini-3.1-flash-live-preview';
const GEMINI_DEFAULT_VOICE = 'Kore';
const OPENAI_SESSIONS_URL = 'https://api.openai.com/v1/realtime/sessions';

interface SessionIssuerDeps {
  apiKey?: string;
  geminiApiKey?: string;
  provider?: VoiceProviderId;
  fetchImpl?: typeof fetch;
  model?: string;
  voice?: string;
  issueGeminiTokenImpl?: (params: {
    apiKey: string;
    model: string;
    voice: string;
  }) => Promise<{ name?: string; expireTime?: string }>;
}

function currentProvider(
  override?: VoiceProviderId
): VoiceProviderId {
  // Per the provider mandate: Gemini is the voice layer for aether.
  // OpenAI Realtime stays as a fallback adapter behind the same seam, but
  // is no longer the default — it must be opted into via env override.
  return override ?? ((process.env.VOICE_PROVIDER ??
    'gemini-live') as VoiceProviderId);
}

/**
 * Fetch workspace provider prefs from Convex via HTTP client.
 * Returns null gracefully when Convex is not provisioned or the lookup fails.
 */
async function fetchWorkspaceVoicePrefs(
  workspaceId: string
): Promise<{ providerId?: VoiceProviderId; model?: string } | null> {
  try {
    const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
    const deployKey = process.env.CONVEX_DEPLOY_KEY;
    if (!convexUrl || !deployKey) return null;

    const { ConvexHttpClient } = await import('convex/browser');
    const { anyApi } = await import('convex/server');
    const client = new ConvexHttpClient(convexUrl);
    const clientWithAuth = client as unknown as { setAdminAuth?: (k: string) => void };
    if (typeof clientWithAuth.setAdminAuth === 'function') clientWithAuth.setAdminAuth(deployKey);

    const prefsApi = (anyApi as unknown as { providerPrefs: { getProviderPrefs: unknown } })
      .providerPrefs.getProviderPrefs;
    const prefs = await (client as unknown as { query: (fn: unknown, args: unknown) => Promise<unknown> }).query(prefsApi, { workspaceId });
    if (!prefs) return null;
    const p = prefs as { voiceProviderId?: string; voiceModel?: string };
    return {
      providerId: p.voiceProviderId as VoiceProviderId | undefined,
      model: p.voiceModel,
    };
  } catch {
    return null;
  }
}

function resolveModel(
  provider: VoiceProviderId,
  override?: string
): string {
  if (override) return override;
  if (provider === 'gemini-live') {
    const configured =
      process.env.GEMINI_LIVE_MODEL ?? process.env.VOICE_MODEL;
    if (configured && !/^gpt-/i.test(configured)) return configured;
    return GEMINI_DEFAULT_MODEL;
  }

  const configured =
    process.env.OPENAI_REALTIME_MODEL ?? process.env.VOICE_MODEL;
  if (configured && !/^gemini/i.test(configured)) return configured;
  return OPENAI_DEFAULT_MODEL;
}

function resolveVoice(
  provider: VoiceProviderId,
  override?: string
): string {
  if (override) return override;
  if (provider === 'gemini-live') {
    return (
      process.env.GEMINI_LIVE_VOICE ??
      process.env.VOICE_VOICE ??
      GEMINI_DEFAULT_VOICE
    );
  }

  return (
    process.env.OPENAI_REALTIME_VOICE ??
    process.env.VOICE_VOICE ??
    OPENAI_DEFAULT_VOICE
  );
}

async function defaultIssueGeminiToken({
  apiKey,
}: {
  apiKey: string;
  model: string;
  voice: string;
}): Promise<{ name?: string; expireTime?: string }> {
  const { GoogleGenAI } = await import('@google/genai/node');
  const client = new GoogleGenAI({
    apiKey,
    apiVersion: 'v1alpha',
  });
  return client.authTokens.create({
    config: {
      uses: 1,
      expireTime: new Date(Date.now() + 30 * 60_000).toISOString(),
      newSessionExpireTime: new Date(Date.now() + 60_000).toISOString(),
    },
  });
}

async function issueGeminiLiveSession(
  deps: SessionIssuerDeps = {}
): Promise<VoiceSessionCredentials> {
  const apiKey =
    deps.geminiApiKey ?? deps.apiKey ?? process.env.GOOGLE_GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'voice: GOOGLE_GEMINI_API_KEY is required to mint a Gemini Live token'
    );
  }

  const provider: VoiceProviderId = 'gemini-live';
  const model = resolveModel(provider, deps.model);
  const voice = resolveVoice(provider, deps.voice);
  const issueGeminiToken =
    deps.issueGeminiTokenImpl ?? defaultIssueGeminiToken;
  const token = await issueGeminiToken({ apiKey, model, voice });
  const clientSecret = token.name;
  if (!clientSecret) {
    throw new Error('voice: Gemini token request returned no token name');
  }

  return {
    sessionId: clientSecret,
    clientSecret,
    expiresAt: token.expireTime
      ? Date.parse(token.expireTime)
      : Date.now() + 30 * 60_000,
    model,
    voice,
    provider,
  };
}

/**
 * Mint an ephemeral realtime-session token from OpenAI. Extracted from the
 * route so tests can call it directly with a fetch stub instead of spinning
 * up a Next server.
 */
export async function issueVoiceSession(
  deps: SessionIssuerDeps = {}
): Promise<VoiceSessionCredentials> {
  const provider = currentProvider(deps.provider);

  if (provider === 'gemini-live') {
    return issueGeminiLiveSession(deps);
  }

  if (provider !== 'openai-realtime') {
    throw new Error(`voice: unsupported provider "${provider}"`);
  }

  const apiKey = deps.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'voice: OPENAI_API_KEY is required to mint a realtime session'
    );
  }

  const model = resolveModel(provider, deps.model);
  const voice = resolveVoice(provider, deps.voice);
  const fetchImpl = deps.fetchImpl ?? fetch;

  const res = await fetchImpl(OPENAI_SESSIONS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      voice,
      modalities: ['audio', 'text'],
      tools: VOICE_TOOL_DEFINITIONS.map((t) => ({
        type: 'function',
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      })),
      tool_choice: 'auto',
      instructions:
        "You are aether's voice companion. Keep replies brief. Call the provided tools eagerly rather than narrating.",
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(
      `voice: OpenAI session request failed (${res.status})${text ? ` · ${text.slice(0, 200)}` : ''}`
    );
  }

  const json = (await res.json()) as {
    id?: string;
    model?: string;
    voice?: string;
    expires_at?: number;
    client_secret?: { value?: string; expires_at?: number };
  };

  const clientSecret = json.client_secret?.value;
  if (!clientSecret) {
    throw new Error('voice: OpenAI session returned no client_secret');
  }

  const expiresAt =
    (json.client_secret?.expires_at ?? json.expires_at ?? 0) * 1000 ||
    Date.now() + 60_000;

  return {
    sessionId: json.id ?? '',
    clientSecret,
    expiresAt,
    model: json.model ?? model,
    voice: json.voice ?? voice,
    provider,
  };
}

export async function POST(request?: Request) {
  try {
    // Read optional workspaceId from request body to apply per-workspace prefs.
    let workspaceId: string | undefined;
    if (request) {
      try {
        const body = await request.clone().json().catch(() => ({})) as Record<string, unknown>;
        if (typeof body.workspaceId === 'string') workspaceId = body.workspaceId;
      } catch {
        // no body / invalid JSON — fine, proceed with env defaults
      }
    }

    let providerOverride: VoiceProviderId | undefined;
    let modelOverride: string | undefined;

    if (workspaceId) {
      const wsprefs = await fetchWorkspaceVoicePrefs(workspaceId);
      if (wsprefs?.providerId) providerOverride = wsprefs.providerId;
      if (wsprefs?.model) modelOverride = wsprefs.model;
    }

    const session = await issueVoiceSession({
      provider: providerOverride,
      model: modelOverride,
    });
    return NextResponse.json({ ok: true, session });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const code =
      message.includes('OPENAI_API_KEY') ||
      message.includes('GOOGLE_GEMINI_API_KEY') ||
      message.includes('unsupported provider')
        ? 503
        : 502;
    return NextResponse.json({ ok: false, error: message }, { status: code });
  }
}

export async function GET() {
  const provider = currentProvider();
  return NextResponse.json({
    ok: true,
    provider,
    model: resolveModel(provider),
    voice: resolveVoice(provider),
    configured:
      provider === 'gemini-live'
        ? Boolean(process.env.GOOGLE_GEMINI_API_KEY)
        : Boolean(process.env.OPENAI_API_KEY),
  });
}
