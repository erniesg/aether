#!/usr/bin/env node
/**
 * Headless Chromium drives /workspace/<wsId>?campaign=<cachedCampaign> and
 * records the auto-mode flow with the cached lap pre-loaded into the canvas.
 *
 * Beats captured (in order):
 *  1. Workspace mounts with ?campaign=<id> — Convex subscription populates
 *     the right rail (research / clusters / lap log) immediately.
 *  2. The 4 format frames seed onto the canvas. Each variation drops its
 *     native-per-format hero into the matching frame.
 *  3. Auto-mode chip popover opens — Managed Agents toggle, variation
 *     count, run mode, notify mode.
 *  4. Composer URL drop hint at the bottom.
 *
 * Output: scripts/recordings/out/workspace-auto-mode/<timestamp>.webm
 *
 * Usage:
 *   node scripts/recordings/workspace-auto-mode-walkthrough.mjs \
 *     [wsId] [campaignId] [base]
 *
 * Defaults — point at the most recent successful Eight Sleep lap:
 *   wsId       = demo-eightsleep-final
 *   campaignId = jx70avqwdx7j48g6fdcshbe02585kvrh
 *   base       = http://localhost:3030
 */

import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const WS_ID = process.argv[2] ?? 'demo-eightsleep-final';
const CAMPAIGN_ID =
  process.argv[3] ?? 'jx70avqwdx7j48g6fdcshbe02585kvrh';
const BASE_URL = process.argv[4] ?? 'http://localhost:3030';
const OUT_DIR = resolve(
  process.cwd(),
  'scripts/recordings/out/workspace-auto-mode'
);
mkdirSync(OUT_DIR, { recursive: true });

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    // 1920x1200 fits all 4 standard format frames laid out left-to-right
    // (1x1 + 4x5 + 9x16 + 16x9 + gaps ≈ 5300px at native scale, but tldraw
    // applies an initial zoom-to-fit on first mount when the camera lands
    // on the workspace bounds). Wider viewport gives that fit room to
    // breathe so all four populated frames read.
    viewport: { width: 1920, height: 1200 },
    deviceScaleFactor: 2,
    recordVideo: {
      dir: OUT_DIR,
      size: { width: 1920, height: 1200 },
    },
  });
  const page = await context.newPage();

  const url = `${BASE_URL}/workspace/${encodeURIComponent(WS_ID)}?campaign=${encodeURIComponent(CAMPAIGN_ID)}`;
  console.log(`▸ navigating to ${url}`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });

  // Beat 1 — wait for the canvas + right rail to finish hydrating, then for
  // the Convex subscription to push the cached lap data. Convex queries
  // typically resolve in 200-800ms and `dropVariationOnCanvas` fires per
  // variation as the data arrives, so 10s is generous headroom plus extra
  // time for the 4 format frames + native heroes to render.
  await page.waitForTimeout(10000);

  // Zoom-to-fit so all 4 format frames (1x1, 4x5, 9x16, 16x9) read on
  // camera at once. tldraw exposes "Zoom to Fit" via Shift+1 and "Zoom
  // 100%" via plain "1" in v3. Try Shift+1 first, then ctrl+scroll-wheel
  // as a fallback to zoom out enough that all 4 frames fit.
  await page.keyboard.press('Shift+1').catch(() => {});
  await page.waitForTimeout(1500);
  // Wheel-zoom out a few notches so even very wide format layouts read.
  for (let i = 0; i < 6; i += 1) {
    await page.mouse.move(960, 600);
    await page.mouse.wheel(0, 240);
    await page.waitForTimeout(150);
  }
  await page.waitForTimeout(2000);

  // Beat 2 — open the auto-mode popover so the camera reads the four chips:
  // Variations / Run / When done / Agent path.
  const autoBtn = page.getByLabel('Auto Mode configuration').first();
  if (await autoBtn.isVisible().catch(() => false)) {
    await autoBtn.click();
    await page.waitForTimeout(2800);
    // Hover Managed Agents toggle so it highlights.
    const managed = page
      .locator('[data-testid="auto-mode-managed-agents-toggle"]')
      .first();
    if (await managed.isVisible().catch(() => false)) {
      await managed.hover();
      await page.waitForTimeout(1800);
    }
    // Close the popover by clicking on the canvas.
    await page.mouse.click(720, 480);
    await page.waitForTimeout(1500);
  }

  // Beat 3 — focus the prompt composer and type a URL so the camera reads
  // the "drop in references or prompts" entry surface.
  const composer = page.locator('textarea').first();
  if (await composer.isVisible().catch(() => false)) {
    await composer.click();
    await page.waitForTimeout(600);
    await composer.type('https://www.eightsleep.com/', { delay: 35 });
    await page.waitForTimeout(2200);
  }

  // Beat 4 — slow pan back to the canvas centre with tldraw's "1" key
  // (zoom-to-fit) so the populated frames read as the closing shot.
  await page.keyboard.press('1');
  await page.waitForTimeout(2500);

  // Tail — linger on the populated canvas state.
  await page.waitForTimeout(2500);

  await context.close();
  await browser.close();
  console.log(`✓ recording saved under ${OUT_DIR}/`);
}

main().catch((err) => {
  console.error('✗ recording failed:', err);
  process.exit(1);
});
