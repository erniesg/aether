export interface LocalWhisperConfig {
  available: boolean;
  endpoint?: string;
  token?: string;
  model?: string;
  timeoutMs: number;
}

export interface LocalWhisperInput {
  audio: Blob | ArrayBuffer | Uint8Array;
  fileName?: string;
  mimeType?: string;
  language?: string;
  prompt?: string;
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
}

export interface LocalWhisperResult {
  text: string;
  provider: {
    id: 'local-whisper';
    model?: string;
    endpoint: string;
  };
  raw?: unknown;
}

export class LocalWhisperUnavailableError extends Error {
  constructor(message = 'LOCAL_WHISPER_URL is not configured') {
    super(message);
    this.name = 'LocalWhisperUnavailableError';
  }
}

const DEFAULT_TIMEOUT_MS = 120_000;

export function resolveLocalWhisperConfig(
  env: Record<string, string | undefined> = process.env
): LocalWhisperConfig | { available: false } {
  const endpoint =
    env.LOCAL_WHISPER_URL?.trim() || env.WHISPER_TRANSCRIBE_URL?.trim();
  if (!endpoint) return { available: false };
  const timeoutRaw = env.LOCAL_WHISPER_TIMEOUT_MS ?? env.WHISPER_TIMEOUT_MS;
  const timeoutMs =
    timeoutRaw && Number.isFinite(Number(timeoutRaw))
      ? Number(timeoutRaw)
      : DEFAULT_TIMEOUT_MS;
  return {
    available: true,
    endpoint,
    token:
      env.LOCAL_WHISPER_TOKEN?.trim() ||
      env.WHISPER_TRANSCRIBE_TOKEN?.trim() ||
      undefined,
    model:
      env.LOCAL_WHISPER_MODEL?.trim() ||
      env.WHISPER_MODEL?.trim() ||
      undefined,
    timeoutMs,
  };
}

function toBlob(audio: Blob | ArrayBuffer | Uint8Array, mimeType: string): Blob {
  if (audio instanceof Blob) return audio;
  const bytes = audio instanceof ArrayBuffer ? new Uint8Array(audio) : audio;
  const arrayBuffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer;
  return new Blob([arrayBuffer], { type: mimeType });
}

function extractTranscript(json: unknown): string {
  if (!json || typeof json !== 'object') return '';
  const data = json as Record<string, unknown>;
  const direct = data.text ?? data.transcript;
  if (typeof direct === 'string') return direct.trim();
  if (Array.isArray(data.segments)) {
    return data.segments
      .map((segment) =>
        segment && typeof segment === 'object'
          ? (segment as Record<string, unknown>).text
          : ''
      )
      .filter((text): text is string => typeof text === 'string')
      .join(' ')
      .trim();
  }
  return '';
}

export async function transcribeWithLocalWhisper(
  input: LocalWhisperInput
): Promise<LocalWhisperResult> {
  const config = resolveLocalWhisperConfig(input.env);
  if (!config.available) throw new LocalWhisperUnavailableError();
  const endpoint = config.endpoint;
  if (!endpoint) throw new LocalWhisperUnavailableError();

  const mimeType = input.mimeType || 'audio/webm';
  const fileName = input.fileName || 'voice-command.webm';
  const form = new FormData();
  form.append('file', toBlob(input.audio, mimeType), fileName);
  if (config.model) form.append('model', config.model);
  if (input.language) form.append('language', input.language);
  if (input.prompt) form.append('prompt', input.prompt);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  const headers: HeadersInit = config.token
    ? { Authorization: `Bearer ${config.token}` }
    : {};

  try {
    const res = await (input.fetchImpl ?? fetch)(endpoint, {
      method: 'POST',
      headers,
      body: form,
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new Error(
        `local whisper failed (${res.status})${text ? ` · ${text.slice(0, 200)}` : ''}`
      );
    }
    const json = await res.json();
    const transcript = extractTranscript(json);
    if (!transcript) {
      throw new Error('local whisper returned no transcript text');
    }
    return {
      text: transcript,
      provider: {
        id: 'local-whisper',
        ...(config.model ? { model: config.model } : {}),
        endpoint,
      },
      raw: json,
    };
  } finally {
    clearTimeout(timer);
  }
}
