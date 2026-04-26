#!/usr/bin/env node
/**
 * Headless Chromium drives /inspect/<campaignId> and records the scroll.
 * Covers voiceover beats: research signals, clusters, variations, atlas.
 *
 * Output: scripts/recordings/out/inspect-walkthrough/<timestamp>.webm
 *
 * Usage:
 *   node scripts/recordings/inspect-walkthrough.mjs [campaignId] [base]
 *
 * Defaults:
 *   campaignId = jx70avqwdx7j48g6fdcshbe02585kvrh (Eight Sleep cached lap)
 *   base       = http://localhost:3030
 */

import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const CAMPAIGN_ID =
  process.argv[2] ?? 'jx70avqwdx7j48g6fdcshbe02585kvrh';
const BASE_URL = process.argv[3] ?? 'http://localhost:3030';
const OUT_DIR = resolve(
  process.cwd(),
  'scripts/recordings/out/inspect-walkthrough'
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

  // Tween scrollY from current to target with cubic ease-out.
  async function smoothScrollTo(target, durMs) {
    await page.evaluate(
      ({ target, durMs }) => {
        return new Promise((resolve) => {
          const start = performance.now();
          const startY = window.scrollY;
          const endY = target === 'bottom'
            ? document.documentElement.scrollHeight
            : target;
          function step(t) {
            const k = Math.min(1, (t - start) / durMs);
            const eased = 1 - Math.pow(1 - k, 3);
            window.scrollTo(0, startY + eased * (endY - startY));
            if (k < 1) requestAnimationFrame(step);
            else resolve(undefined);
          }
          requestAnimationFrame(step);
        });
      },
      { target, durMs }
    );
  }

  // Click a `<summary>` matching `text` to expand its `<details>` parent.
  // Falls through silently if the summary isn't found — keeps the recording
  // running even when section labels evolve.
  async function expandSection(text) {
    const summary = page
      .locator('summary')
      .filter({ hasText: text })
      .first();
    if (!(await summary.isVisible().catch(() => false))) {
      console.log(`  ↳ skipping "${text}" (not found)`);
      return;
    }
    await summary.scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    await summary.click();
    await page.waitForTimeout(400);
  }

  console.log(`▸ navigating to ${BASE_URL}/inspect/${CAMPAIGN_ID}`);
  await page.goto(`${BASE_URL}/inspect/${CAMPAIGN_ID}`, {
    waitUntil: 'networkidle',
    timeout: 60_000,
  });

  // Beat 1 — linger on the header so the campaign id, brand, status read.
  await page.waitForTimeout(2200);

  // Beat 2 — research signals: scroll to the section and pause so the
  // competitors / locale insights / sources read on camera.
  await smoothScrollTo(380, 2000);
  await page.waitForTimeout(2500);

  // Beat 3 — clusters region.
  await smoothScrollTo(900, 1800);
  await page.waitForTimeout(2200);

  // Beat 4 — scroll to the variation card so its collapsed sections come
  // into view (atlas / native per-format / text overlays / agent steps).
  await smoothScrollTo(1500, 1800);
  await page.waitForTimeout(1200);

  // Beat 5 — expand each collapsible section in order, lingering after
  // each so the contents read. The "atlas" expansion reveals the 1520×1969
  // multiformat × multilingual tile — the demo's headline visual.
  await expandSection('atlas');
  await page.waitForTimeout(3500);

  await expandSection('native per-format');
  await page.waitForTimeout(2800);

  await expandSection('text overlays');
  await page.waitForTimeout(2800);

  await expandSection('agent steps');
  await page.waitForTimeout(2500);

  // Beat 6 — slow scroll to the bottom so the lap-event timeline is
  // captured even after the expansions have grown the page.
  await smoothScrollTo('bottom', 3500);
  await page.waitForTimeout(2500);

  await context.close();
  await browser.close();
  console.log(`✓ recording saved under ${OUT_DIR}/`);
}

main().catch((err) => {
  console.error('✗ recording failed:', err);
  process.exit(1);
});
