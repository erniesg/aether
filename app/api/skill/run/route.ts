import path from 'node:path';
import { NextResponse } from 'next/server';
import { callSkill } from '@/lib/agent/skills/callSkill';
import { loadSkillManifest } from '@/lib/agent/skills/loader';
import type { SkillManifest, SkillRef } from '@/lib/agent/skills/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RunSkillBody {
  /** Path to SKILL.md, absolute or relative to repo root. */
  manifestPath?: string;
  /** Skill name + version (alternative locator — caller resolves the path). */
  skillRef?: { id: string; version: number; manifestPath?: string };
  /** Skill input (free-form). */
  input?: Record<string, unknown>;
  /** Skip Claude — return a deterministic local stub for tests / demos. */
  bypassAgent?: boolean;
}

function resolveManifestPath(input: RunSkillBody): string | null {
  const fromBody = input.manifestPath ?? input.skillRef?.manifestPath;
  if (!fromBody || typeof fromBody !== 'string') return null;
  return path.isAbsolute(fromBody) ? fromBody : path.resolve(process.cwd(), fromBody);
}

function localBypass(manifest: SkillManifest, input: Record<string, unknown>) {
  // Lightweight echo so chip clicks produce visible feedback without an API
  // key. The shape mirrors callSkill's SkillRuntimeOutput so callers can pipe
  // either path identically.
  return {
    ok: true,
    result: {
      skill: manifest.name,
      version: manifest.version,
      ranAt: Date.now(),
      input,
      message: `Local-bypass run of "${manifest.name}".`,
    },
    cacheHitTokens: 0,
  };
}

/**
 * POST /api/skill/run
 * body: { manifestPath?, skillRef?, input?, bypassAgent? }
 *
 * Loads the SKILL.md at the resolved path and executes it via callSkill.
 * Returns the SkillRuntimeOutput directly.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid JSON body' }, { status: 400 });
  }
  const b = (body ?? {}) as RunSkillBody;
  const manifestPath = resolveManifestPath(b);
  if (!manifestPath) {
    return NextResponse.json(
      { ok: false, error: 'manifestPath (or skillRef.manifestPath) is required' },
      { status: 400 }
    );
  }

  let manifest: SkillManifest;
  try {
    manifest = await loadSkillManifest(path.dirname(manifestPath));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 404 });
  }

  if (b.bypassAgent === true) {
    return NextResponse.json(localBypass(manifest, b.input ?? {}));
  }

  const skillRef: SkillRef = {
    kind: 'skill',
    id: manifest.name,
    version: manifest.version,
    manifestPath,
    manifest,
  };
  try {
    const output = await callSkill({ skillRef, input: b.input ?? {} });
    return NextResponse.json(output);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
