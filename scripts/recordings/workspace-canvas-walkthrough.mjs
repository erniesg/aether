#!/usr/bin/env node
/**
 * Headless Chromium drives /workspace/demo-ws and records:
 *  - empty canvas
 *  - auto-mode popover (toggle, variations, run, notify, agent path chips)
 *  - voice orb + prompt composer
 *  - canvas hero in full format frames
 *
 * Output: scripts/recordings/out/workspace-canvas/<timestamp>.webm
 *
 * Usage:
 *   node scripts/recordings/workspace-canvas-walkthrough.mjs [base]
 *
 * NOTE: this records UI state, not a full live lap (a lap takes ~3 min). For
 * the "drop URL → variations populate" beat, run inspect-walkthrough.mjs on
 * the cached Eight Sleep lap instead.
 */

import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const BASE_URL = process.argv[2] ?? 'http://localhost:3030';
const OUT_DIR = resolve(
  process.cwd(),
  'scripts/recordings/out/workspace-canvas'
);
mkdirSync(OUT_DIR, { recursive: true });

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    recordVideo: {
      dir: OUT_DIR,
      size: { width: 1440, height: 900 },
    },
  });
  const page = await context.newPage();

  console.log(`▸ navigating to ${BASE_URL}/workspace`);
  await page.goto(`${BASE_URL}/workspace`, {
    waitUntil: 'networkidle',
    timeout: 60_000,
  });

  // Linger on empty workspace so the camera reads the canvas + rails.
  await page.waitForTimeout(3500);

  // Open the auto-mode popover. The toggle has aria-label="Auto Mode
  // configuration" — that's the most stable selector.
  const autoBtn = page.getByLabel('Auto Mode configuration').first();
  if (await autoBtn.isVisible().catch(() => false)) {
    await autoBtn.click();
    await page.waitForTimeout(3000);
    // Hover the Managed Agents row by its data-testid.
    const managed = page
      .locator('[data-testid="auto-mode-managed-agents-toggle"]')
      .first();
    if (await managed.isVisible().catch(() => false)) {
      await managed.hover();
      await page.waitForTimeout(2000);
    }
    // Close popover by clicking elsewhere on the canvas.
    await page.mouse.click(720, 500);
    await page.waitForTimeout(2000);
  }

  // Drop an Eight Sleep URL into the prompt composer and hit Enter — this
  // visually demonstrates the "drop in references or prompts" beat without
  // having to wait through a full lap. The lap will fire in the background;
  // we don't wait for it here.
  const composer = page.locator('textarea').first();
  if (await composer.isVisible().catch(() => false)) {
    await composer.click();
    await page.waitForTimeout(800);
    await composer.type('https://www.eightsleep.com/', { delay: 35 });
    await page.waitForTimeout(2500);
  }

  // Tail: linger so the framing of the canvas + rails reads.
  await page.waitForTimeout(3500);

  await context.close();
  await browser.close();
  console.log(`✓ recording saved under ${OUT_DIR}/`);
}

main().catch((err) => {
  console.error('✗ recording failed:', err);
  process.exit(1);
});
