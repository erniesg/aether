import type { AspectRatio, GeneratedImage } from '@/lib/providers/image/types';

export interface GenerateStreamFrameRef {
  id: string;
  label?: string;
  index: number;
  total: number;
  aspectRatio: AspectRatio;
}

export interface GenerateStreamProviderRef {
  id: string;
  displayName?: string;
  model: string;
}

export type GenerateStreamEvent =
  | {
      type: 'run.started';
      at: number;
      mode: 'single' | 'fanout' | 'crop';
      frames: { total: number };
    }
  | {
      type: 'planner.started';
      at: number;
      plannerModel: string;
    }
  | {
      type: 'plan.ready';
      at: number;
      plannerMode: 'anthropic' | 'bypass' | 'fallback';
      plannerModel?: string;
      plannerError?: string;
      rewrittenPrompt: string;
      aspectRatio: AspectRatio;
      rationale?: string;
      provider: GenerateStreamProviderRef;
      toolCall?: {
        name: 'generate_image';
        prompt: string;
        aspectRatio: string;
        rationale?: string;
        seed?: number;
      };
    }
  | {
      type: 'frame.started';
      at: number;
      frame: GenerateStreamFrameRef;
      provider: GenerateStreamProviderRef;
    }
  | {
      type: 'frame.completed';
      at: number;
      frame: GenerateStreamFrameRef;
      provider: GenerateStreamProviderRef;
      latencyMs: number;
      image: Pick<GeneratedImage, 'url' | 'width' | 'height' | 'mimeType'>;
    }
  | {
      type: 'frame.failed';
      at: number;
      frame: GenerateStreamFrameRef;
      provider: GenerateStreamProviderRef;
      error: string;
      code?: string;
    }
  | {
      type: 'run.completed';
      at: number;
      status: 'ok' | 'partial' | 'error';
      frames: { total: number; completed: number; failed: number };
      provider?: GenerateStreamProviderRef;
      rewrittenPrompt?: string;
      rationale?: string;
      aspectRatio?: AspectRatio;
      firstImageUrl?: string;
      elapsedMs: number;
      error?: string;
      /** Which execution mode was used — present when the generate route ran multi-format. */
      mode?: 'crop' | 'fanout';
    };

const encoder = new TextEncoder();

export function encodeGenerateEvent(event: GenerateStreamEvent): Uint8Array {
  return encoder.encode(`event: generate\ndata: ${JSON.stringify(event)}\n\n`);
}

export async function readGenerateStream(
  response: Response,
  onEvent: (event: GenerateStreamEvent) => void | Promise<void>
): Promise<void> {
  const body = response.body;
  if (!body) throw new Error('stream body missing');

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });

    let boundary = buffer.indexOf('\n\n');
    while (boundary !== -1) {
      const chunk = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);

      const payload = chunk
        .split('\n')
        .filter((line) => line.startsWith('data: '))
        .map((line) => line.slice(6))
        .join('\n')
        .trim();

      if (payload) {
        await onEvent(JSON.parse(payload) as GenerateStreamEvent);
      }

      boundary = buffer.indexOf('\n\n');
    }

    if (done) break;
  }

  const trailing = buffer.trim();
  if (!trailing) return;
  const payload = trailing
    .split('\n')
    .filter((line) => line.startsWith('data: '))
    .map((line) => line.slice(6))
    .join('\n')
    .trim();
  if (payload) await onEvent(JSON.parse(payload) as GenerateStreamEvent);
}
