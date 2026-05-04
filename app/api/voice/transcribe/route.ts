import { NextResponse } from 'next/server';
import {
  LocalWhisperUnavailableError,
  transcribeWithLocalWhisper,
} from '@/lib/voice/local-whisper';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 180;

const MAX_AUDIO_BYTES = 50 * 1024 * 1024;

function jsonError(status: number, error: string, code?: string) {
  return NextResponse.json(
    { ok: false, error, ...(code ? { code } : {}) },
    { status }
  );
}

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonError(400, 'multipart form data is required');
  }

  const file = form.get('file') ?? form.get('audio');
  if (!(file instanceof File)) {
    return jsonError(400, 'file field is required');
  }
  if (file.size <= 0) return jsonError(400, 'audio file is empty');
  if (file.size > MAX_AUDIO_BYTES) {
    return jsonError(400, 'audio file exceeds 50 MB');
  }

  try {
    const result = await transcribeWithLocalWhisper({
      audio: await file.arrayBuffer(),
      fileName: file.name || 'voice-command.webm',
      mimeType: file.type || 'audio/webm',
      language:
        typeof form.get('language') === 'string'
          ? String(form.get('language'))
          : undefined,
      prompt:
        typeof form.get('prompt') === 'string'
          ? String(form.get('prompt'))
          : undefined,
    });

    return NextResponse.json({
      ok: true,
      transcript: result.text,
      provider: result.provider,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (err instanceof LocalWhisperUnavailableError) {
      return jsonError(503, message, 'local_whisper_unavailable');
    }
    return jsonError(502, message, 'local_whisper_failed');
  }
}
