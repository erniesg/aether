#!/usr/bin/env node

import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl = process.argv[2] ?? 'http://127.0.0.1:4310';

const captures = [
  {
    url: '/experiments/video/double-exposure-image/index.html',
    output: 'experiments/video/double-exposure-image/browser-shot.png',
    waitMs: 1800,
  },
  {
    url: '/experiments/video/double-exposure-video/index.html',
    output: 'experiments/video/double-exposure-video/browser-shot.png',
    waitMs: 2200,
  },
  {
    url: '/experiments/video/double-exposure-compare/index.html',
    output: 'experiments/video/double-exposure-compare/browser-shot-effect-off.png',
    waitMs: 1500,
  },
  {
    url: '/experiments/video/double-exposure-compare/index.html',
    output: 'experiments/video/double-exposure-compare/browser-shot-effect-on.png',
    waitMs: 1500,
    action: async (page) => {
      await page.getByRole('button', { name: 'Effect Off' }).click();
      await page.waitForTimeout(700);
    },
  },
];

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1600, height: 900 },
  deviceScaleFactor: 1,
});

try {
  for (const capture of captures) {
    const page = await context.newPage();
    await page.goto(new URL(capture.url, baseUrl).toString(), {
      waitUntil: 'domcontentloaded',
    });
    await page.waitForTimeout(capture.waitMs);
    if (capture.action) {
      await capture.action(page);
    }
    const outputPath = path.resolve(capture.output);
    await mkdir(path.dirname(outputPath), { recursive: true });
    await page.screenshot({ path: outputPath });
    await page.close();
    console.log(`wrote ${outputPath}`);
  }
} finally {
  await context.close();
  await browser.close();
}
