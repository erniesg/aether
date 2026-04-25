/**
 * loader.test.ts — AC1: SKILL.md parser.
 *
 * Tests that `loadSkillManifest` correctly parses front-matter and body from a
 * fixture SKILL.md and returns the expected SkillManifest shape.
 */

import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { loadSkillManifest } from './loader';

const FIXTURE_DIR = path.resolve(__dirname, '__fixtures__/sample-skill');

describe('loadSkillManifest', () => {
  it('parses name, version, description from front-matter', async () => {
    const manifest = await loadSkillManifest(FIXTURE_DIR);
    expect(manifest.name).toBe('sample-skill');
    expect(manifest.version).toBe(1);
    expect(manifest.description).toBe('A minimal fixture skill for loader tests.');
  });

  it('parses tools array from front-matter', async () => {
    const manifest = await loadSkillManifest(FIXTURE_DIR);
    expect(manifest.tools).toEqual(['read_file', 'write_file']);
  });

  it('parses referenceFiles array from front-matter', async () => {
    const manifest = await loadSkillManifest(FIXTURE_DIR);
    expect(manifest.referenceFiles).toEqual(['docs/style-guide.md']);
  });

  it('strips front-matter and returns markdown body as instructions', async () => {
    const manifest = await loadSkillManifest(FIXTURE_DIR);
    // Body should NOT contain the YAML front-matter block
    expect(manifest.instructions).not.toContain('---');
    // Should contain the skill heading
    expect(manifest.instructions).toContain('# Sample Skill');
  });

  it('throws if SKILL.md is missing', async () => {
    await expect(loadSkillManifest('/does/not/exist')).rejects.toThrow(/SKILL\.md/i);
  });

  it('throws if required front-matter field is missing', async () => {
    // Supply a path to the malformed fixture
    const malformedDir = path.resolve(__dirname, '__fixtures__/malformed-skill');
    await expect(loadSkillManifest(malformedDir)).rejects.toThrow(/name/i);
  });
});
