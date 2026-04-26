import { NextResponse } from 'next/server';
import { resolveVideoProvider } from '@/lib/providers/video/registry';
import {
  VideoProviderUnavailableError,
  type VideoUnderstandingTask,
} from '@/lib/providers/video/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const VALID_TASKS: ReadonlySet<VideoUnderstandingTask> = new Set([
  'summarize',
  'transcribe',
  'extract-moments',
  'describe-shots',
  'free-form',
]);

interface RequestBody {
  videoUrl?: string;
  prompt?: string;
  task?: string;
  providerId?: string;
}

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function POST(request: Request) {
  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return jsonError(400, 'request body must be JSON');
  }
  if (!body.videoUrl || typeof body.videoUrl !== 'string') {
    return jsonError(400, 'videoUrl is required');
  }
  const task =
    body.task && VALID_TASKS.has(body.task as VideoUnderstandingTask)
      ? (body.task as VideoUnderstandingTask)
      : 'summarize';

  try {
    const provider = resolveVideoProvider(body.providerId);
    const result = await provider.understand({
      videoUrl: body.videoUrl,
      prompt: body.prompt,
      task,
    });
    return NextResponse.json({
      ok: true,
      provider: provider.id,
      modelId: result.modelId,
      task,
      text: result.text,
      usageMs: result.usageMs,
    });
  } catch (err) {
    if (err instanceof VideoProviderUnavailableError) {
      return jsonError(503, err.message);
    }
    return jsonError(500, err instanceof Error ? err.message : String(err));
  }
}
