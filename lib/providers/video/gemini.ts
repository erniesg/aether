import { GoogleGenAI, createUserContent, createPartFromUri } from '@google/genai';
import type {
  VideoUnderstandingProvider,
  VideoUnderstandingRequest,
  VideoUnderstandingResult,
  VideoUnderstandingTask,
} from './types';
import { VideoProviderUnavailableError } from './types';

const DEFAULT_MODEL = 'gemini-2.5-flash';

const TASK_PROMPTS: Record<VideoUnderstandingTask, string> = {
  summarize:
    'Summarize this video in 3 short bullet points. Cover: subject, mood, and what a creator could remix from it.',
  transcribe: 'Transcribe any spoken dialogue in this video. Include timestamps in [HH:MM:SS] format.',
  'extract-moments':
    'List the 5 most visually distinct moments. For each, give a [HH:MM:SS] timestamp, a one-line description, and the reason it stands out.',
  'describe-shots':
    'Describe the camera work shot-by-shot. For each shot give shot type (close/medium/wide), motion (static/pan/dolly/handheld), framing notes.',
  'free-form': '',
};

function resolvePrompt(req: VideoUnderstandingRequest): string {
  if (req.prompt && req.prompt.trim()) return req.prompt.trim();
  const task = req.task ?? 'summarize';
  return TASK_PROMPTS[task] || TASK_PROMPTS.summarize;
}

export function createGeminiVideoProvider(): VideoUnderstandingProvider {
  const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
  return {
    id: 'gemini',
    displayName: 'Gemini video understanding',
    available: () => Boolean(apiKey),
    async understand(req: VideoUnderstandingRequest): Promise<VideoUnderstandingResult> {
      if (!apiKey) {
        throw new VideoProviderUnavailableError('GOOGLE_GEMINI_API_KEY not set');
      }
      const ai = new GoogleGenAI({ apiKey });
      const t0 = Date.now();

      const fetchRes = await fetch(req.videoUrl);
      if (!fetchRes.ok) {
        throw new Error(`fetch ${req.videoUrl} → HTTP ${fetchRes.status}`);
      }
      const mimeType = fetchRes.headers.get('content-type') || 'video/mp4';
      const bytes = Buffer.from(await fetchRes.arrayBuffer());
      const blob = new Blob([bytes], { type: mimeType });

      const uploaded = await ai.files.upload({
        file: blob,
        config: { mimeType, displayName: `aether-video-${Date.now()}` },
      });

      // Files become ACTIVE asynchronously after upload — small videos finish in seconds.
      const uploadedName = uploaded.name;
      if (!uploadedName) throw new Error('Gemini upload returned no name');
      let state = uploaded.state;
      let attempts = 0;
      while (state === 'PROCESSING' && attempts < 60) {
        await new Promise((r) => setTimeout(r, 2000));
        const check = await ai.files.get({ name: uploadedName });
        state = check.state;
        attempts += 1;
      }
      if (state !== 'ACTIVE') {
        throw new Error(`Gemini file did not become ACTIVE (got ${state ?? 'unknown'})`);
      }

      const promptText = resolvePrompt(req);
      const fileUri = uploaded.uri;
      if (!fileUri) throw new Error('Gemini upload returned no uri');
      const response = await ai.models.generateContent({
        model: DEFAULT_MODEL,
        contents: createUserContent([
          createPartFromUri(fileUri, mimeType),
          promptText,
        ]),
      });

      const text = response.text ?? '';
      return {
        text,
        modelId: DEFAULT_MODEL,
        usageMs: Date.now() - t0,
      };
    },
  };
}
