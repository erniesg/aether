import { NextResponse } from 'next/server';
import { VOICE_TOOL_DEFINITIONS } from '@/lib/voice/tools';
import type {
  VoiceProviderId,
  VoiceSessionCredentials,
} from '@/lib/voice/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEFAULT_MODEL = 'gpt-4o-realtime-preview';
const DEFAULT_VOICE = 'alloy';
const OPENAI_SESSIONS_URL = 'https://api.openai.com/v1/realtime/sessions';

interface SessionIssuerDeps {
  apiKey?: string;
  provider?: VoiceProviderId;
  fetchImpl?: typeof fetch;
  model?: string;
  voice?: string;
}

/**
 * Mint an ephemeral realtime-session token from OpenAI. Extracted from the
 * route so tests can call it directly with a fetch stub instead of spinning
 * up a Next server.
 */
export async function issueVoiceSession(
  deps: SessionIssuerDeps = {}
): Promise<VoiceSessionCredentials> {
  const provider = deps.provider ?? ((process.env.VOICE_PROVIDER ??
    'openai-realtime') as VoiceProviderId);

  if (provider !== 'openai-realtime') {
    throw new Error(`voice: unsupported provider "${provider}"`);
  }

  const apiKey = deps.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'voice: OPENAI_API_KEY is required to mint a realtime session'
    );
  }

  const model = deps.model ?? process.env.VOICE_MODEL ?? DEFAULT_MODEL;
  const voice = deps.voice ?? process.env.VOICE_VOICE ?? DEFAULT_VOICE;
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

export async function POST() {
  try {
    const session = await issueVoiceSession();
    return NextResponse.json({ ok: true, session });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const code =
      message.includes('OPENAI_API_KEY') || message.includes('unsupported provider')
        ? 503
        : 502;
    return NextResponse.json({ ok: false, error: message }, { status: code });
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    provider:
      (process.env.VOICE_PROVIDER as VoiceProviderId | undefined) ??
      'openai-realtime',
    model: process.env.VOICE_MODEL ?? DEFAULT_MODEL,
    configured: Boolean(process.env.OPENAI_API_KEY),
  });
}
