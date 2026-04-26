#!/usr/bin/env node
/**
 * Drives the canvas at /workspace/<wsId>?campaign=<cachedCampaign> and
 * records a text-overlay edit with `meta.scope='global'` propagating
 * across every variation frame — visual evidence for the voiceover beat
 * "Everything is editable, with global / local scope".
 *
 * Steps:
 *  1. Mount the workspace at the cached campaign so the 4 format frames
 *     drop onto the canvas with their text overlays.
 *  2. Read window.__aetherEditor (exposed by EditorRefProvider in dev).
 *  3. Locate every shape with meta.autoModeTextOverlay AND meta.scope='global'
 *     across the variation's 4 format frames.
 *  4. Patch ONE of them (the headline) to a fresh string. Per
 *     buildGlobalTextPropagator, the same text fans out to every sibling
 *     frame within ~one tick.
 *  5. Linger so the camera reads the propagated text on every frame.
 *
 * Output: scripts/recordings/out/canvas-text-propagation/<timestamp>.webm
 *
 * Usage:
 *   node scripts/recordings/canvas-text-propagation-walkthrough.mjs \
 *     [wsId] [campaignId] [base]
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
  'scripts/recordings/out/canvas-text-propagation'
);
mkdirSync(OUT_DIR, { recursive: true });

const NEW_HEADLINE = 'Edited live · global scope · same bed.';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1200 },
    deviceScaleFactor: 2,
    recordVideo: { dir: OUT_DIR, size: { width: 1920, height: 1200 } },
  });
  const page = await context.newPage();

  const url = `${BASE_URL}/workspace/${encodeURIComponent(WS_ID)}?campaign=${encodeURIComponent(CAMPAIGN_ID)}`;
  console.log(`▸ ${url}`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });

  // Beat 1 — wait for hydration + Convex subscription + canvas dropping.
  // dropVariationOnCanvas inserts the format frames + per-format heroes +
  // text overlay shapes within ~5-8s of the campaign id landing.
  await page.waitForTimeout(10_000);

  // Beat 2 — zoom out so all 4 frames read.
  await page.keyboard.press('Shift+1').catch(() => {});
  await page.waitForTimeout(800);
  for (let i = 0; i < 6; i += 1) {
    await page.mouse.move(960, 600);
    await page.mouse.wheel(0, 240);
    await page.waitForTimeout(150);
  }
  await page.waitForTimeout(2000);

  // Beat 3 — count global text shapes BEFORE the edit (sanity log).
  const before = await page.evaluate(() => {
    const editor = window.__aetherEditor;
    if (!editor || typeof editor !== 'object') return null;
    const all = editor.getCurrentPageShapes();
    const global = all.filter(
      (s) =>
        s &&
        s.meta &&
        s.meta.autoModeTextOverlay === true &&
        s.meta.scope === 'global'
    );
    return { total: all.length, globalText: global.length };
  });
  console.log(`  ↳ shapes on canvas: ${JSON.stringify(before)}`);

  // Beat 4 — patch the first global headline-purpose text overlay.
  // buildGlobalTextPropagator listens for editor.store updates and fans
  // the change out to every sibling frame on the next tick.
  const patched = await page.evaluate((newText) => {
    const editor = window.__aetherEditor;
    if (!editor || typeof editor !== 'object') return false;
    const all = editor.getCurrentPageShapes();
    const target = all.find(
      (s) =>
        s &&
        s.type === 'geo' &&
        s.meta &&
        s.meta.autoModeTextOverlay === true &&
        s.meta.scope === 'global' &&
        // canvas.ts stores the role as `zone` (the purpose string from
        // the layout planner), e.g. 'headline' / 'caption' / 'cta'.
        s.meta.zone === 'headline'
    );
    if (!target) return false;
    editor.updateShape({
      id: target.id,
      type: 'geo',
      props: { text: newText },
    });
    return true;
  }, NEW_HEADLINE);
  console.log(`  ↳ patched: ${patched}`);

  // Beat 5 — linger so the propagated text reads across every frame.
  await page.waitForTimeout(4500);

  // Beat 6 — pan back to centre as the closing shot.
  await page.keyboard.press('Shift+1').catch(() => {});
  await page.waitForTimeout(2500);

  await context.close();
  await browser.close();
  console.log(`✓ recording saved under ${OUT_DIR}/`);
}

main().catch((err) => {
  console.error('✗ recording failed:', err);
  process.exit(1);
});
