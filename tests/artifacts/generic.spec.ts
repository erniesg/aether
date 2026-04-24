import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

// Fallback artifact-capture script for the reviewer-agent pipeline (issue #55).
//
// The autonomous-loop CI runs this after every `claude/issue-*` PR pushes,
// against the CF preview deploy for that PR. If an issue-specific capture
// exists at `tests/artifacts/issue-<n>.spec.ts`, that is preferred and this
// generic pass is skipped. Otherwise, this pass:
//
//   1. Opens the landing page and the workspace route against AETHER_BASE_URL.
//   2. Screenshots each.
//   3. Asserts no console errors fired during load.
//
// Outputs land in PLAYWRIGHT_ARTIFACT_DIR (default `artifacts/`) to be picked
// up by the R2 uploader and surfaced to the reviewer agent.
//
// Uses the `artifacts` project from playwright.config.ts — `npm run test:e2e`
// does NOT include this file, so it does not affect the main e2e run.

const ARTIFACT_DIR = process.env.PLAYWRIGHT_ARTIFACT_DIR || 'artifacts';

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

test.describe('artifact capture (generic)', () => {
  test('landing page renders with no console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    ensureDir(ARTIFACT_DIR);
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'landing.png'),
      fullPage: true,
    });

    expect(errors, `console/page errors on /:\n${errors.join('\n')}`).toEqual([]);
  });

  test('workspace demo route renders with no console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
    });

    await page.goto('/workspace/demo-ws');
    await page.waitForLoadState('networkidle');

    ensureDir(ARTIFACT_DIR);
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'workspace.png'),
      fullPage: true,
    });

    expect(errors, `console/page errors on /workspace/demo-ws:\n${errors.join('\n')}`).toEqual([]);
  });
});
