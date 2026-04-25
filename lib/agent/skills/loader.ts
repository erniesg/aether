/**
 * loader.ts — SKILL.md manifest parser.
 *
 * Reads `<skillDir>/SKILL.md`, extracts YAML front-matter, and returns a
 * `SkillManifest`. The front-matter block is delimited by `---` fences.
 * Required fields: `name`, `version`, `description`.
 * Optional arrays: `tools[]`, `referenceFiles[]`.
 *
 * Front-matter is parsed with a minimal hand-rolled parser so we have zero
 * additional deps and the logic stays auditable.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import type { SkillManifest } from './types';

const FRONT_MATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

/**
 * Parse a minimal YAML subset: string scalars, integer scalars, and inline
 * flow sequences (`[item1, item2]`) or block sequences (`- item`).
 */
function parseFrontMatter(yaml: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = yaml.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;
    // Skip blank lines
    if (!line.trim()) {
      i++;
      continue;
    }

    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) {
      i++;
      continue;
    }

    const key = line.slice(0, colonIdx).trim();
    const rawValue = line.slice(colonIdx + 1).trim();

    // Inline flow sequence: key: [item1, item2]
    if (rawValue.startsWith('[') && rawValue.endsWith(']')) {
      const inner = rawValue.slice(1, -1);
      result[key] = inner
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      i++;
      continue;
    }

    // Empty value → look ahead for block sequence `  - item`
    if (rawValue === '') {
      const items: string[] = [];
      i++;
      while (i < lines.length) {
        const next = lines[i]!;
        const trimmed = next.trim();
        if (trimmed.startsWith('- ')) {
          items.push(trimmed.slice(2).trim());
          i++;
        } else if (trimmed === '') {
          i++;
        } else {
          break;
        }
      }
      result[key] = items;
      continue;
    }

    // Integer scalar
    if (/^\d+$/.test(rawValue)) {
      result[key] = Number(rawValue);
      i++;
      continue;
    }

    // String scalar (strip optional surrounding quotes)
    result[key] = rawValue.replace(/^['"]|['"]$/g, '');
    i++;
  }

  return result;
}

/**
 * Load and parse `<skillDir>/SKILL.md`.
 *
 * @throws if the file does not exist, the front-matter fences are missing, or
 *         a required field (`name`, `version`, `description`) is absent.
 */
export async function loadSkillManifest(skillDir: string): Promise<SkillManifest> {
  const manifestPath = path.join(skillDir, 'SKILL.md');

  let raw: string;
  try {
    raw = await fs.readFile(manifestPath, 'utf-8');
  } catch {
    throw new Error(`SKILL.md not found at ${manifestPath}`);
  }

  const match = FRONT_MATTER_RE.exec(raw);
  if (!match) {
    throw new Error(
      `SKILL.md at ${manifestPath} is missing YAML front-matter fences (--- ... ---)`
    );
  }

  const frontMatterRaw = match[1]!;
  const body = (match[2] ?? '').trim();
  const fm = parseFrontMatter(frontMatterRaw);

  // Validate required fields
  if (typeof fm['name'] !== 'string' || !fm['name']) {
    throw new Error(`SKILL.md at ${manifestPath} is missing required front-matter field: name`);
  }
  if (typeof fm['version'] !== 'number') {
    throw new Error(`SKILL.md at ${manifestPath} is missing required front-matter field: version`);
  }
  if (typeof fm['description'] !== 'string' || !fm['description']) {
    throw new Error(
      `SKILL.md at ${manifestPath} is missing required front-matter field: description`
    );
  }

  const tools = Array.isArray(fm['tools'])
    ? (fm['tools'] as string[])
    : typeof fm['tools'] === 'string'
      ? [fm['tools']]
      : [];

  const referenceFiles = Array.isArray(fm['referenceFiles'])
    ? (fm['referenceFiles'] as string[])
    : typeof fm['referenceFiles'] === 'string'
      ? [fm['referenceFiles']]
      : [];

  return {
    name: fm['name'] as string,
    version: fm['version'] as number,
    description: fm['description'] as string,
    tools,
    referenceFiles,
    instructions: body,
  };
}
