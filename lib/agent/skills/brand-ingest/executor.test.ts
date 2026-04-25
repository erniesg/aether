/**
 * executor.test.ts — AC4: brand-ingest reference Skill end-to-end.
 *
 * Verifies that:
 * 1. `loadBrandIngestSkillRef()` can load the SKILL.md and return a SkillRef.
 * 2. `executeBrandIngest()` delegates to `lib/brand/ingest.ts` (via bypassAgent).
 * 3. The loader recognises the brand-ingest SKILL.md correctly.
 */

import { describe, expect, it } from 'vitest';
import { loadBrandIngestSkillRef, executeBrandIngest } from './executor';

describe('brand-ingest SkillRef loader', () => {
  it('loads SKILL.md and returns a valid SkillRef', async () => {
    const ref = await loadBrandIngestSkillRef();
    expect(ref.kind).toBe('skill');
    expect(ref.id).toBe('brand-ingest');
    expect(ref.version).toBe(1);
    expect(ref.manifest.name).toBe('brand-ingest');
    expect(ref.manifest.description).toBeTruthy();
    expect(ref.manifest.instructions).toContain('Brand Ingest Skill');
  });

  it('manifest lists tools', async () => {
    const ref = await loadBrandIngestSkillRef();
    expect(ref.manifest.tools).toContain('read_url');
    expect(ref.manifest.tools).toContain('read_files');
  });

  it('manifest lists referenceFiles', async () => {
    const ref = await loadBrandIngestSkillRef();
    expect(ref.manifest.referenceFiles).toContain('lib/brand/types.ts');
  });

  it('manifestPath points to SKILL.md on disk', async () => {
    const ref = await loadBrandIngestSkillRef();
    expect(ref.manifestPath).toContain('brand-ingest/SKILL.md');
  });
});

describe('executeBrandIngest', () => {
  it('delegates to ingestBrand for files kind with bypassAgent', async () => {
    const output = await executeBrandIngest(
      {
        kind: 'files',
        source: {
          texts: ['Bold, vibrant, modern. We make tools for creators.'],
          images: [],
        },
      },
      { bypassAgent: true }
    );

    expect(output.ok).toBe(true);
    // Result should have palette, typography, voice fields from BrandSnapshot
    const result = output.result as Record<string, unknown>;
    expect(result).toHaveProperty('palette');
    expect(result).toHaveProperty('typography');
    expect(result).toHaveProperty('voice');
  });

  it('returns ok: false for invalid input', async () => {
    const output = await executeBrandIngest({ kind: 'unknown', source: '' });
    expect(output.ok).toBe(false);
    expect(output.error).toBeTruthy();
  });

  it('returns ok: false when ingest throws', async () => {
    // url ingest with empty source should throw inside ingestBrand
    const output = await executeBrandIngest(
      { kind: 'url', source: '' },
      { bypassAgent: true }
    );
    expect(output.ok).toBe(false);
    expect(output.error).toBeTruthy();
  });
});
