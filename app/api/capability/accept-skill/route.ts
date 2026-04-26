import path from 'node:path';
import { NextResponse } from 'next/server';
import { persistDraftSkill } from '@/lib/agent/skills/persistManifest';
import type { SkillManifest } from '@/lib/agent/skills/types';
import { recordSkillInsert } from '@/lib/convex/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface AcceptSkillBody {
  manifest?: SkillManifest;
}

function looksLikeManifest(value: unknown): value is SkillManifest {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.name === 'string' &&
    typeof v.version === 'number' &&
    typeof v.description === 'string' &&
    typeof v.instructions === 'string' &&
    Array.isArray(v.tools) &&
    Array.isArray(v.referenceFiles)
  );
}

/**
 * POST /api/capability/accept-skill
 * body: { manifest: SkillManifest }
 *
 * Materialises a drafted SKILL.md to disk at lib/agent/skills/<name>/SKILL.md
 * and (when Convex is provisioned) inserts a row into the `skill` table.
 *
 * Returns { ok: true, skillRef: SkillRef, convexId?: string }.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid JSON body' }, { status: 400 });
  }
  const b = (body ?? {}) as AcceptSkillBody;
  if (!looksLikeManifest(b.manifest)) {
    return NextResponse.json(
      { ok: false, error: 'body.manifest must be a SkillManifest' },
      { status: 400 }
    );
  }

  try {
    const persisted = await persistDraftSkill({ manifest: b.manifest });
    const repoRoot = process.cwd();
    const relativeManifestPath = path.relative(repoRoot, persisted.manifestPath);

    const convexId = await recordSkillInsert({
      name: b.manifest.name,
      version: b.manifest.version,
      description: b.manifest.description,
      manifestPath: relativeManifestPath,
      referenceFilePaths: b.manifest.referenceFiles,
    });

    return NextResponse.json({
      ok: true,
      skillRef: persisted.skillRef,
      convexId: convexId ?? undefined,
      manifestPathRelative: relativeManifestPath,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
