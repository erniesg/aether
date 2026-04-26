/**
 * persistManifest.test.ts — AC5 step 2: SKILL.md round-trips on disk.
 *
 * Verifies:
 *  - persistDraftSkill writes a valid SKILL.md the loader can read back.
 *  - Tools and referenceFiles round-trip as block sequences.
 *  - Refusing to overwrite an existing skill keeps disk state safe.
 *  - Unsafe ids (path traversal, illegal chars) are rejected.
 */

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { persistDraftSkill, renderManifestToMarkdown } from './persistManifest';
import { loadSkillManifest } from './loader';
import type { SkillManifest } from './types';

let tmpRoot: string;

function makeManifest(partial?: Partial<SkillManifest>): SkillManifest {
  return {
    name: 'neon-drench',
    version: 1,
    description: 'Drench an image in neon light wash.',
    tools: ['image_edit'],
    referenceFiles: [],
    instructions: [
      '# neon drench',
      '',
      '## Output format',
      '',
      '```json',
      '{ "ok": true, "result": { "imageUrl": "..." } }',
      '```',
    ].join('\n'),
    ...partial,
  };
}

beforeEach(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'aether-skill-persist-'));
});

afterEach(async () => {
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

describe('persistDraftSkill', () => {
  it('writes a SKILL.md the loader can read back', async () => {
    const manifest = makeManifest();
    const result = await persistDraftSkill({ manifest, repoRoot: tmpRoot });

    expect(result.skillDir).toBe(
      path.join(tmpRoot, 'lib', 'agent', 'skills', manifest.name)
    );
    expect(result.manifestPath).toBe(path.join(result.skillDir, 'SKILL.md'));

    const loaded = await loadSkillManifest(result.skillDir);
    expect(loaded.name).toBe(manifest.name);
    expect(loaded.version).toBe(manifest.version);
    expect(loaded.description).toBe(manifest.description);
    expect(loaded.tools).toEqual(manifest.tools);
    expect(loaded.referenceFiles).toEqual([]);
    expect(loaded.instructions).toContain('Output format');
  });

  it('refuses to overwrite an existing SKILL.md by default', async () => {
    const manifest = makeManifest();
    await persistDraftSkill({ manifest, repoRoot: tmpRoot });
    await expect(
      persistDraftSkill({ manifest, repoRoot: tmpRoot })
    ).rejects.toThrow(/already exists/);
  });

  it('rejects unsafe skill ids', async () => {
    await expect(
      persistDraftSkill({
        manifest: makeManifest({ name: '../escape' }),
        repoRoot: tmpRoot,
      })
    ).rejects.toThrow(/unsafe/);
  });
});

describe('renderManifestToMarkdown', () => {
  it('emits block-sequence arrays for tools and referenceFiles', () => {
    const md = renderManifestToMarkdown(
      makeManifest({ tools: ['a', 'b'], referenceFiles: ['notes.md'] })
    );
    expect(md).toContain('tools:\n  - a\n  - b');
    expect(md).toContain('referenceFiles:\n  - notes.md');
  });

  it('emits empty-array literals when there are no tools or referenceFiles', () => {
    const md = renderManifestToMarkdown(makeManifest({ tools: [], referenceFiles: [] }));
    expect(md).toContain('tools: []');
    expect(md).toContain('referenceFiles: []');
  });
});
