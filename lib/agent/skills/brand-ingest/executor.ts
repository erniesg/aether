/**
 * brand-ingest/executor.ts
 *
 * Reference Skill executor for the `brand-ingest` skill. Delegates directly
 * to `lib/brand/ingest.ts` — this is the pattern proof that a Skill executor
 * is a thin adapter, not a reimplementation.
 *
 * The `callSkill` tool invokes the inner Claude call; the executor is only
 * used when a programmatic caller (test, API route) wants a typed shortcut
 * that bypasses the LLM call and uses the deterministic ingest pipeline.
 */

import path from 'node:path';
import { ingestBrand, type IngestOptions } from '@/lib/brand/ingest';
import type { BrandIngestRequest } from '@/lib/brand/types';
import { loadSkillManifest } from '../loader';
import type { SkillRef, SkillRuntimeInput, SkillRuntimeOutput } from '../types';

const SKILL_DIR = path.resolve(__dirname);

/**
 * Load the brand-ingest SkillRef from its SKILL.md.
 * Used by tests and by the capability factory when registering the skill.
 */
export async function loadBrandIngestSkillRef(): Promise<SkillRef> {
  const manifest = await loadSkillManifest(SKILL_DIR);
  return {
    kind: 'skill',
    id: 'brand-ingest',
    version: manifest.version,
    manifestPath: path.join(SKILL_DIR, 'SKILL.md'),
    manifest,
  };
}

/**
 * Execute the brand-ingest skill deterministically (bypasses the inner Claude
 * call, uses the local ingest pipeline).
 *
 * Input must conform to `BrandIngestRequest`.
 */
export async function executeBrandIngest(
  input: SkillRuntimeInput,
  opts: IngestOptions = {}
): Promise<SkillRuntimeOutput> {
  // Coerce and validate input
  const request = coerceRequest(input);
  if (!request) {
    return {
      ok: false,
      result: null,
      error: 'Invalid input: expected { kind, source } matching BrandIngestRequest.',
    };
  }

  try {
    const snapshot = await ingestBrand(request, opts);
    return {
      ok: true,
      result: {
        palette: snapshot.palette,
        typography: snapshot.typography,
        voice: snapshot.voice,
        logos: snapshot.logos,
        productImages: snapshot.productImages,
        confidence: snapshot.confidence,
        source: snapshot.source,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      result: null,
      error: message,
    };
  }
}

function coerceRequest(input: SkillRuntimeInput): BrandIngestRequest | null {
  if (!input || typeof input !== 'object') return null;
  const i = input as Record<string, unknown>;
  const kind = i['kind'];
  if (kind !== 'url' && kind !== 'repo' && kind !== 'files') return null;
  return { kind, source: i['source'] } as BrandIngestRequest;
}
