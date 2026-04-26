import { NextResponse } from 'next/server';
import { draftSkillManifest } from '@/lib/agent/skills/draftManifest';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/capability/draft-skill
 * body: { prompt: string, bypassAgent?: boolean }
 * Returns { ok: true, manifest: SkillManifest }
 *
 * AC5 step 1 — Claude drafts a SKILL.md from the creator's natural-language
 * prompt. The caller (workspace shell) renders the draft in the accept/reject
 * modal. On accept the manifest is POSTed to /api/capability/accept-skill.
 */
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
  const prompt = typeof b.prompt === 'string' ? b.prompt.trim() : '';
  if (!prompt) {
    return NextResponse.json({ ok: false, error: 'prompt is required' }, { status: 400 });
  }
  const bypassAgent = b.bypassAgent === true;

  try {
    const manifest = await draftSkillManifest({ prompt, bypassAgent });
    return NextResponse.json({ ok: true, manifest });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
