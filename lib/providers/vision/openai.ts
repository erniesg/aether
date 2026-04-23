import { fetchWithTimeout, mark } from '@/lib/providers/image/util';
import type {
  ImageElementInventory,
  ImageElementSuggestion,
  VisionAnalyzeRequest,
  VisionAnalyzeResult,
  VisionProvider,
} from './types';
import { VisionError } from './types';

const RESPONSES_ENDPOINT = 'https://api.openai.com/v1/responses';
const DEFAULT_MODEL = 'gpt-4.1-mini';
const OPENAI_TIMEOUT_MS = 60_000;

function isAbortError(error: unknown): error is { name: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name?: unknown }).name === 'AbortError'
  );
}

async function fetchOpenAI(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetchWithTimeout(url, init, OPENAI_TIMEOUT_MS);
  } catch (error) {
    if (isAbortError(error)) {
      throw new VisionError(
        `request timed out after ${OPENAI_TIMEOUT_MS / 1000}s`,
        'openai',
        error
      );
    }
    throw error;
  }
}

function extractOutputText(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const record = payload as Record<string, unknown>;
  if (typeof record.output_text === 'string' && record.output_text.trim()) {
    return record.output_text.trim();
  }

  const output = Array.isArray(record.output) ? record.output : [];
  for (const item of output) {
    if (typeof item !== 'object' || item === null) continue;
    const content = Array.isArray((item as Record<string, unknown>).content)
      ? ((item as Record<string, unknown>).content as unknown[])
      : [];
    for (const part of content) {
      if (typeof part !== 'object' || part === null) continue;
      const text = (part as Record<string, unknown>).text;
      if (typeof text === 'string' && text.trim()) {
        return text.trim();
      }
    }
  }

  return null;
}

function inventorySchema(maxElements: number) {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['summary', 'elements'],
    properties: {
      summary: {
        type: 'string',
        description:
          'One sentence summarizing the main visually distinct elements in the image.',
      },
      elements: {
        type: 'array',
        maxItems: maxElements,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['id', 'label', 'prompt', 'prominence'],
          properties: {
            id: { type: 'string' },
            label: {
              type: 'string',
              description:
                'Neutral, visually grounded label for a distinct extractable element.',
            },
            prompt: {
              type: 'string',
              description:
                'Short segmentation prompt phrase matching the same element.',
            },
            prominence: {
              type: 'string',
              enum: ['primary', 'secondary', 'accent'],
            },
          },
        },
      },
    },
  } as const;
}

function normalizeInventory(value: unknown, maxElements: number): ImageElementInventory {
  if (typeof value !== 'object' || value === null) {
    throw new VisionError('analysis returned an invalid inventory payload', 'openai');
  }

  const candidate = value as Record<string, unknown>;
  const summary =
    typeof candidate.summary === 'string' && candidate.summary.trim()
      ? candidate.summary.trim()
      : 'Image analyzed.';
  const elements = Array.isArray(candidate.elements) ? candidate.elements : [];

  return {
    summary,
    elements: elements
      .flatMap((item, index) => {
        if (typeof item !== 'object' || item === null) return [];
        const record = item as Record<string, unknown>;
        const label =
          typeof record.label === 'string' && record.label.trim()
            ? record.label.trim()
            : null;
        const prompt =
          typeof record.prompt === 'string' && record.prompt.trim()
            ? record.prompt.trim()
            : label;
        const prominence: ImageElementSuggestion['prominence'] =
          record.prominence === 'secondary' || record.prominence === 'accent'
            ? record.prominence
            : 'primary';
        if (!label || !prompt) return [];
        return [
          {
            id:
              typeof record.id === 'string' && record.id.trim()
                ? record.id.trim()
                : `element-${index + 1}`,
            label,
            prompt,
            prominence,
          },
        ];
      })
      .slice(0, maxElements),
  };
}

export function createOpenAIVisionProvider(
  apiKey: string | undefined = process.env.OPENAI_API_KEY
): VisionProvider {
  const provider: VisionProvider = {
    id: 'openai',
    displayName: 'OpenAI Vision',
    isAvailable: () => Boolean(apiKey),
    listModels: () => [process.env.VISION_ANALYSIS_MODEL ?? DEFAULT_MODEL],
    async analyze(
      req: VisionAnalyzeRequest,
      opts: { model: string }
    ): Promise<VisionAnalyzeResult> {
      if (!apiKey) throw new VisionError('OPENAI_API_KEY not set', 'openai');
      const model = opts.model || process.env.VISION_ANALYSIS_MODEL || DEFAULT_MODEL;
      const maxElements = Math.min(Math.max(req.maxElements ?? 6, 1), 8);

      const elapsed = mark();
      const res = await fetchOpenAI(RESPONSES_ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          input: [
            {
              role: 'system',
              content: [
                {
                  type: 'input_text',
                  text:
                    'You identify the main visually distinct elements in an image before segmentation. Stay grounded in what is actually visible. Prefer neutral labels over speculative or stylistic interpretations. Return only the most useful extractable elements, usually 2 to 5 items. Group tiny repeated details together instead of listing noise or fragments.',
                },
              ],
            },
            {
              role: 'user',
              content: [
                {
                  type: 'input_text',
                  text: `Return JSON describing the main extractable image elements. List at most ${maxElements} elements, but use fewer when the image only has a few meaningful targets. Focus on objects, subjects, overlays, and obvious graphical motifs that a creator might want to isolate.`,
                },
                {
                  type: 'input_image',
                  image_url: req.sourceUrl,
                  detail: 'high',
                },
              ],
            },
          ],
          text: {
            format: {
              type: 'json_schema',
              name: 'image_element_inventory',
              strict: true,
              schema: inventorySchema(maxElements),
            },
          },
          max_output_tokens: 700,
        }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => res.statusText);
        throw new VisionError(`${res.status} ${text}`, 'openai');
      }

      const json = (await res.json()) as Record<string, unknown>;
      const outputText = extractOutputText(json);
      if (!outputText) {
        throw new VisionError('analysis returned no structured output', 'openai');
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(outputText);
      } catch (error) {
        throw new VisionError('analysis returned invalid JSON', 'openai', error);
      }

      return {
        provider: 'openai',
        model,
        latencyMs: elapsed(),
        inventory: normalizeInventory(parsed, maxElements),
        raw: json,
      };
    },
  };

  return provider;
}
