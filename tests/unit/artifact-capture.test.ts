import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import {
  ARTIFACT_CAPTURE_MARKER,
  ARTIFACT_CAPTURE_SCHEMA,
  artifactDirForPr,
  artifactNameForPr,
  buildArtifactComment,
  buildManifest,
  discoverArtifactFiles,
  extractIssueNumberFromBranch,
  extractIssueNumberFromPrBody,
  prNeedsArtifactCapture,
  selectArtifactSpec,
} from '../../.github/scripts/artifact-capture.mjs';

function baseManifest(overrides = {}) {
  return buildManifest({
    prNumber: 146,
    issueNumber: 146,
    headRef: 'claude/issue-146-artifact-capture',
    headSha: 'abc123',
    specPath: 'tests/artifacts/issue-146.spec.ts',
    specSource: 'issue-specific',
    baseUrl: '',
    localPreview: true,
    captureOutcome: 'success',
    files: ['artifacts/pr-146/workspace.png'],
    runId: '12345',
    repository: 'erniesg/aether',
    artifactName: artifactNameForPr(146),
    ...overrides,
  });
}

describe('artifact capture planning', () => {
  it('extracts issue numbers from agent branches and PR close syntax', () => {
    expect(extractIssueNumberFromBranch('claude/issue-146-artifact-capture')).toBe(146);
    expect(extractIssueNumberFromBranch('codex/issue-150-qa-plan')).toBe(150);
    expect(extractIssueNumberFromBranch('feat/no-agent')).toBeNull();
    expect(extractIssueNumberFromPrBody('Summary\n\nCloses #146')).toBe(146);
  });

  it('prefers issue-specific artifact specs when present', () => {
    const selected = selectArtifactSpec(146, (path) => path === 'tests/artifacts/issue-146.spec.ts');
    expect(selected).toEqual({
      specPath: 'tests/artifacts/issue-146.spec.ts',
      source: 'issue-specific',
    });
  });

  it('falls back to the generic artifact spec when issue-specific capture is absent', () => {
    const selected = selectArtifactSpec(146, () => false);
    expect(selected).toEqual({
      specPath: 'tests/artifacts/generic.spec.ts',
      source: 'generic-fallback',
    });
  });

  it('requires capture only for UI/product paths', () => {
    expect(prNeedsArtifactCapture(['app/workspace/page.tsx'])).toBe(true);
    expect(prNeedsArtifactCapture(['lib/providers/image/openai.ts'])).toBe(true);
    expect(prNeedsArtifactCapture(['tests/artifacts/issue-146.spec.ts'])).toBe(true);
    expect(prNeedsArtifactCapture(['docs/agent-routing.md', '.github/pull_request_template.md'])).toBe(false);
  });

  it('uses stable PR artifact names and directories', () => {
    expect(artifactDirForPr(146)).toBe('artifacts/pr-146');
    expect(artifactNameForPr(146)).toBe('aether-artifacts-pr-146');
  });
});

describe('artifact manifest and comment', () => {
  it('discovers generic and legacy issue-specific screenshot outputs', () => {
    const root = mkdtempSync(join(tmpdir(), 'aether-artifacts-'));
    try {
      mkdirSync(join(root, 'artifacts/pr-146'), { recursive: true });
      mkdirSync(join(root, 'playwright-report/issue-146'), { recursive: true });
      writeFileSync(join(root, 'artifacts/pr-146/workspace.png'), 'png');
      writeFileSync(join(root, 'playwright-report/issue-146/focus.png'), 'png');

      expect(
        discoverArtifactFiles({
          artifactDir: 'artifacts/pr-146',
          issueNumber: 146,
          cwd: root,
        })
      ).toEqual([
        'artifacts/pr-146/workspace.png',
        'playwright-report/issue-146/focus.png',
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('fails closed when GitHub artifact upload did not return a URL', () => {
    expect(() => buildArtifactComment(baseManifest(), {})).toThrow(/upload URL is required/);
  });

  it('renders a stable machine-readable PR comment with media proof', () => {
    const comment = buildArtifactComment(baseManifest(), {
      artifactUrl: 'https://github.com/erniesg/aether/actions/runs/1/artifacts/2',
      artifactId: '2',
    });

    expect(comment).toContain(ARTIFACT_CAPTURE_MARKER);
    expect(comment).toContain('Media files: 1');
    expect(comment).toContain('workspace.png');
    expect(comment).toContain(ARTIFACT_CAPTURE_SCHEMA);
    expect(comment).toContain('```json');
  });
});

describe('artifact-capture workflow contract', () => {
  it('runs capture, uploads the bundle, and comments the manifest', () => {
    const workflow = readFileSync(
      resolve(process.cwd(), '.github/workflows/artifact-capture.yml'),
      'utf8'
    );

    expect(workflow).toContain('node .github/scripts/artifact-capture.mjs plan');
    expect(workflow).toContain('npx playwright test --config=playwright.artifacts.config.ts');
    expect(workflow).toContain('actions/upload-artifact@v4');
    expect(workflow).toContain('node .github/scripts/artifact-capture.mjs comment');
    expect(workflow).toContain('AETHER_ARTIFACT_BASE_URL');
    expect(workflow).toContain("steps.capture.outcome != 'success'");
  });
});
