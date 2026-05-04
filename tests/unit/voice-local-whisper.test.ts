import { describe, expect, it, vi } from 'vitest';
import {
  LocalWhisperUnavailableError,
  resolveLocalWhisperConfig,
  transcribeWithLocalWhisper,
} from '@/lib/voice/local-whisper';

describe('local Whisper transcription', () => {
  it('reports unavailable when no local endpoint is configured', async () => {
    expect(resolveLocalWhisperConfig({})).toEqual({ available: false });
    await expect(
      transcribeWithLocalWhisper({
        audio: Buffer.from('audio'),
        env: {},
      })
    ).rejects.toBeInstanceOf(LocalWhisperUnavailableError);
  });

  it('posts audio as multipart form data to the configured local sidecar', async () => {
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.method).toBe('POST');
      expect(init?.headers).toMatchObject({
        Authorization: 'Bearer local-token',
      });
      const body = init?.body as FormData;
      expect(body).toBeInstanceOf(FormData);
      expect(body.get('model')).toBe('whisper-large-v3');
      expect(body.get('language')).toBe('en');
      const file = body.get('file') as File;
      expect(file).toBeInstanceOf(File);
      expect(file.name).toBe('ptt.webm');
      expect(file.type).toBe('audio/webm');
      expect(file.size).toBeGreaterThan(0);
      return new Response(
        JSON.stringify({ text: 'generate socials for Eight Sleep' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }) as unknown as typeof fetch;

    const result = await transcribeWithLocalWhisper({
      audio: Buffer.from('audio-bytes'),
      fileName: 'ptt.webm',
      mimeType: 'audio/webm',
      language: 'en',
      env: {
        LOCAL_WHISPER_URL: 'http://127.0.0.1:9000/transcribe',
        LOCAL_WHISPER_MODEL: 'whisper-large-v3',
        LOCAL_WHISPER_TOKEN: 'local-token',
      },
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      'http://127.0.0.1:9000/transcribe',
      expect.any(Object)
    );
    expect(result).toMatchObject({
      text: 'generate socials for Eight Sleep',
      provider: {
        id: 'local-whisper',
        model: 'whisper-large-v3',
      },
    });
  });
});
