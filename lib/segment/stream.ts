import type {
  SegmentationBoxPrompt,
  SegmentationMode,
  SegmentationProviderId,
  SegmentationProviderStatus,
} from '@/lib/providers/segmentation/types';

export type SegmentStreamMode = 'removebg' | 'prompt' | 'refine';
export type SegmentStreamPhase = 'uploading' | 'inference' | 'postprocess';

export interface SegmentStreamProviderRef {
  id: SegmentationProviderId;
  displayName?: string;
  model: string;
}

export interface SegmentStreamPreview {
  sourceDataUrl: string;
  maskDataUrl: string;
  cutoutDataUrl: string;
  width: number;
  height: number;
  bbox?: SegmentationBoxPrompt;
  invertMask?: boolean;
}

export type SegmentStreamEvent =
  | {
      type: 'segment.started';
      at: number;
      runId: string;
      provider: SegmentStreamProviderRef;
      mode: SegmentStreamMode;
      verb: SegmentationMode;
    }
  | {
      type: 'segment.progress';
      at: number;
      runId: string;
      phase: SegmentStreamPhase;
    }
  | {
      type: 'segment.completed';
      at: number;
      runId: string;
      provider: SegmentStreamProviderRef;
      latencyMs: number;
      outputs: {
        maskUrl: string;
        cutoutUrl?: string;
        backgroundFillUrl?: string;
      };
      preview: SegmentStreamPreview;
    }
  | {
      type: 'segment.failed';
      at: number;
      runId: string;
      error: string;
      code?: string;
      providers?: SegmentationProviderStatus[];
    };

const encoder = new TextEncoder();

export function encodeSegmentEvent(event: SegmentStreamEvent): Uint8Array {
  return encoder.encode(`event: segment\ndata: ${JSON.stringify(event)}\n\n`);
}

export async function readSegmentStream(
  response: Response,
  onEvent: (event: SegmentStreamEvent) => void | Promise<void>
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
        await onEvent(JSON.parse(payload) as SegmentStreamEvent);
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
  if (payload) await onEvent(JSON.parse(payload) as SegmentStreamEvent);
}

export function inferSegmentMode(input: {
  verb: SegmentationMode;
  hasPoints: boolean;
  hasBox: boolean;
  hasPrompt: boolean;
}): SegmentStreamMode {
  if (input.hasPoints || input.hasBox) return 'refine';
  if (input.hasPrompt) return 'prompt';
  return 'removebg';
}
