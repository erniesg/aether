import { NextResponse } from 'next/server';
import { sketchToComponent } from '@/lib/agent/sketch-to-component';
import type { FormatTarget } from '@/lib/types/semantic-component';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ParsedFormat {
  id: string;
  w: number;
  h: number;
  label?: string;
}

function parseFormats(value: unknown): ParsedFormat[] | null {
  if (!Array.isArray(value)) return null;
  const out: ParsedFormat[] = [];
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) continue;
    const v = entry as Record<string, unknown>;
    const id = typeof v.id === 'string' && v.id.trim() ? v.id.trim() : null;
    const w = typeof v.w === 'number' && Number.isFinite(v.w) && v.w > 0 ? v.w : null;
    const h = typeof v.h === 'number' && Number.isFinite(v.h) && v.h > 0 ? v.h : null;
    if (!id || w === null || h === null) continue;
    out.push({
      id,
      w,
      h,
      label: typeof v.label === 'string' && v.label.trim() ? v.label.trim() : undefined,
    });
  }
  return out;
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid JSON body' }, { status: 400 });
  }

  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ ok: false, error: 'body must be an object' }, { status: 400 });
  }

  const b = body as Record<string, unknown>;
  const sketchImageUrl = typeof b.sketchImageUrl === 'string' ? b.sketchImageUrl : '';
  if (!sketchImageUrl) {
    return NextResponse.json(
      { ok: false, error: 'sketchImageUrl is required' },
      { status: 400 }
    );
  }

  const formats = parseFormats(b.formats);
  if (!formats || formats.length === 0) {
    return NextResponse.json(
      { ok: false, error: 'at least one format is required' },
      { status: 400 }
    );
  }

  const creatorIntent =
    typeof b.creatorIntent === 'string' && b.creatorIntent.trim()
      ? b.creatorIntent.trim()
      : undefined;

  try {
    const outcome = await sketchToComponent({
      sketchImageUrl,
      formats: formats as FormatTarget[],
      creatorIntent,
    });
    return NextResponse.json({
      ok: true,
      component: outcome.component,
      plannerMode: outcome.plannerMode,
      plannerModel: outcome.plannerModel,
      plannerError: outcome.plannerError,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
