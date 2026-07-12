import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();

function read(path: string): string {
  return readFileSync(resolve(root, path), 'utf8');
}

describe('current product identity copy', () => {
  it('keeps package and landing metadata creator-first rather than hackathon-branded', () => {
    const currentIdentityFiles = [
      'package.json',
      'app/page.tsx',
      'app/layout.tsx',
    ].map(read);

    for (const contents of currentIdentityFiles) {
      expect(contents).not.toMatch(/hackathon/i);
      expect(contents).not.toMatch(/built with claude opus/i);
    }

    expect(read('package.json')).toContain('Creator-first canvas');
    expect(read('app/page.tsx')).toContain('Open canvas');
    expect(read('app/layout.tsx')).toContain('creator-first canvas');
  });
});
