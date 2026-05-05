#!/usr/bin/env node
/**
 * Live creator flow recorder:
 * voice audio -> local Whisper -> voice command planner -> references ->
 * Replicate/OpenAI image generation -> storyboard toggles -> canvas return.
 *
 * Output defaults to:
 *   test-results/live-voice-storyboard-<timestamp>/
 *
 * Usage:
 *   AETHER_E2E_AUDIO_PATH=/tmp/aether-e2e-multilang-auto.wav \
 *   node scripts/recordings/live-voice-storyboard-e2e.mjs
 */

import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';

const TRANSCRIPT =
  process.env.AETHER_E2E_TRANSCRIPT ??
  'Generate a campaign for the big sleeping part in different formats and languages and auto publish to Twitter only.';
const BASE_URL = process.env.AETHER_E2E_BASE_URL ?? process.argv[2] ?? 'http://localhost:3000';
const WORKSPACE_ID = process.env.AETHER_E2E_WORKSPACE ?? 'demo-ws';
const AUDIO_PATH = process.env.AETHER_E2E_AUDIO_PATH ?? '/tmp/aether-e2e-multilang-auto.wav';
const PROVIDER = process.env.AETHER_E2E_IMAGE_PROVIDER ?? 'replicate';
const MODEL = process.env.AETHER_E2E_IMAGE_MODEL ?? 'openai/gpt-image-2';
const STAMP = new Date().toISOString().replace(/[:.]/g, '-');
const OUT_DIR = resolve(
  process.cwd(),
  process.env.AETHER_E2E_OUT_DIR ?? `test-results/live-voice-storyboard-${STAMP}`
);
const IMAGE_DIR = join(OUT_DIR, 'images');

function ensureAudio() {
  if (existsSync(AUDIO_PATH)) return;
  const aiffPath = AUDIO_PATH.replace(/\.wav$/i, '.aiff');
  execFileSync('say', ['-o', aiffPath, TRANSCRIPT], { stdio: 'ignore' });
  execFileSync('afconvert', ['-f', 'WAVE', '-d', 'LEI16@16000', aiffPath, AUDIO_PATH], {
    stdio: 'ignore',
  });
}

function writeJson(fileName, value) {
  writeFileSync(join(OUT_DIR, fileName), `${JSON.stringify(value, null, 2)}\n`);
}

function parseSseEvents(text) {
  const events = [];
  for (const block of String(text ?? '').split(/\n\n+/)) {
    const data = block
      .split(/\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n')
      .trim();
    if (!data) continue;
    try {
      events.push(JSON.parse(data));
    } catch {
      events.push({ type: 'unparsed', data });
    }
  }
  return events;
}

function collectImageUrls(runCompleted) {
  const urls = new Set();
  if (typeof runCompleted?.firstImageUrl === 'string') urls.add(runCompleted.firstImageUrl);
  const byHero = runCompleted?.nativePerFormatUrlsByHero;
  if (byHero && typeof byHero === 'object') {
    for (const byFormat of Object.values(byHero)) {
      if (!byFormat || typeof byFormat !== 'object') continue;
      for (const url of Object.values(byFormat)) {
        if (typeof url === 'string' && url) urls.add(url);
      }
    }
  }
  return [...urls];
}

async function downloadImages(urls) {
  const downloaded = [];
  for (const [index, url] of urls.entries()) {
    try {
      const res = await fetch(url);
      if (!res.ok) {
        downloaded.push({ url, ok: false, status: res.status });
        continue;
      }
      const contentType = res.headers.get('content-type') ?? '';
      const ext =
        contentType.includes('png')
          ? '.png'
          : contentType.includes('jpeg') || contentType.includes('jpg')
            ? '.jpg'
            : extname(new URL(url).pathname) || '.img';
      const fileName = `${String(index + 1).padStart(2, '0')}${ext}`;
      writeFileSync(join(IMAGE_DIR, fileName), Buffer.from(await res.arrayBuffer()));
      downloaded.push({ url, ok: true, file: join(IMAGE_DIR, fileName), contentType });
    } catch (err) {
      downloaded.push({
        url,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return downloaded;
}

async function screenshot(page, fileName) {
  const path = join(OUT_DIR, fileName);
  await page.screenshot({ path, fullPage: true });
  return path;
}

async function main() {
  ensureAudio();
  mkdirSync(OUT_DIR, { recursive: true });
  mkdirSync(IMAGE_DIR, { recursive: true });
  copyFileSync(AUDIO_PATH, join(OUT_DIR, basename(AUDIO_PATH)));

  const audioBase64 = readFileSync(AUDIO_PATH).toString('base64');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 980 },
    deviceScaleFactor: 1,
    recordVideo: {
      dir: OUT_DIR,
      size: { width: 1440, height: 980 },
    },
  });
  const page = await context.newPage();

  await page.addInitScript(({ audioBase64: wavBase64 }) => {
    const bytes = Uint8Array.from(atob(wavBase64), (char) => char.charCodeAt(0));
    window.__aetherLive = {
      voiceTranscribe: null,
      voiceCommand: null,
      voiceReferences: null,
      generateRequests: [],
      generateEventTexts: [],
      fetchErrors: [],
    };

    class FakeMediaRecorder extends EventTarget {
      static isTypeSupported() {
        return true;
      }

      constructor(stream) {
        super();
        this.stream = stream;
        this.mimeType = 'audio/wav';
        this.state = 'inactive';
      }

      start() {
        this.state = 'recording';
        this.dispatchEvent(new Event('start'));
      }

      stop() {
        this.state = 'inactive';
        window.setTimeout(() => {
          const data = new Event('dataavailable');
          Object.defineProperty(data, 'data', {
            value: new Blob([bytes], { type: 'audio/wav' }),
          });
          this.dispatchEvent(data);
          this.dispatchEvent(new Event('stop'));
        }, 0);
      }
    }

    Object.defineProperty(window, 'MediaRecorder', {
      configurable: true,
      value: FakeMediaRecorder,
    });
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: async () => ({
          getTracks: () => [{ stop() {} }],
        }),
      },
    });

    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const rawUrl =
        typeof input === 'string'
          ? input
          : input instanceof Request
            ? input.url
            : String(input);
      const path = new URL(rawUrl, window.location.href).pathname;
      const method = String(
        init?.method ?? (input instanceof Request ? input.method : 'GET')
      ).toUpperCase();
      let requestText = null;
      if (method === 'POST') {
        if (typeof init?.body === 'string') {
          requestText = init.body;
        } else if (input instanceof Request) {
          try {
            requestText = await input.clone().text();
          } catch {
            requestText = null;
          }
        }
      }

      const response = await originalFetch(input, init);
      try {
        if (method === 'POST' && path.endsWith('/api/generate')) {
          if (requestText) {
            try {
              window.__aetherLive.generateRequests.push(JSON.parse(requestText));
            } catch {
              window.__aetherLive.generateRequests.push({ raw: requestText });
            }
          }
          response
            .clone()
            .text()
            .then((text) => {
              window.__aetherLive.generateEventTexts.push(text);
            })
            .catch((err) => {
              window.__aetherLive.fetchErrors.push({
                endpoint: '/api/generate',
                error: String(err),
              });
            });
        }
        if (method === 'POST' && path.endsWith('/api/voice/transcribe')) {
          response
            .clone()
            .json()
            .then((json) => {
              window.__aetherLive.voiceTranscribe = json;
            })
            .catch(() => {});
        }
        if (method === 'POST' && path.endsWith('/api/voice/command')) {
          response
            .clone()
            .json()
            .then((json) => {
              window.__aetherLive.voiceCommand = json;
            })
            .catch(() => {});
        }
        if (method === 'POST' && path.endsWith('/api/voice/references')) {
          response
            .clone()
            .json()
            .then((json) => {
              window.__aetherLive.voiceReferences = json;
            })
            .catch(() => {});
        }
      } catch (err) {
        window.__aetherLive.fetchErrors.push({ endpoint: path, error: String(err) });
      }
      return response;
    };
  }, { audioBase64 });

  const startedAt = Date.now();
  const screenshots = [];
  const videoHandle = page.video();
  const workspaceUrl = `${BASE_URL}/workspace/${WORKSPACE_ID}?provider=${encodeURIComponent(
    PROVIDER
  )}&model=${encodeURIComponent(MODEL)}`;

  await page.goto(workspaceUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.locator('.tl-container').waitFor({ state: 'visible', timeout: 60_000 });
  await page
    .locator('.tl-container .tl-canvas, .tl-container .tl-svg-container')
    .first()
    .waitFor({ timeout: 60_000 });
  screenshots.push(await screenshot(page, '00-canvas-ready.png'));

  const voiceButton = page
    .getByTestId('composer-voice-slot')
    .locator('button[data-async-voice-state]');
  await voiceButton.dispatchEvent('pointerdown');
  await voiceButton.waitFor({ state: 'visible', timeout: 15_000 });
  await page.waitForTimeout(500);
  await voiceButton.dispatchEvent('pointerup');

  await page.getByTestId('async-voice-review-ready').waitFor({
    state: 'visible',
    timeout: 180_000,
  });
  screenshots.push(await screenshot(page, '01-voice-review-ready.png'));

  await page.getByTestId('view-switch-storyboard').click();
  await page.getByTestId('storyboard-lens').waitFor({ state: 'visible', timeout: 15_000 });
  screenshots.push(await screenshot(page, '02-storyboard-overview-during-review.png'));

  await page.getByTestId('storyboard-slide-card').filter({ hasText: 'Why Now' }).click();
  await page.getByTestId('storyboard-zoom-stage').waitFor({ state: 'visible', timeout: 15_000 });
  screenshots.push(await screenshot(page, '03-slide-03-why-now-zoom.png'));
  await page.getByTestId('storyboard-close').click();
  await page.getByTestId('storyboard-lens').waitFor({ state: 'detached', timeout: 15_000 });

  const keepReferenceButtons = page.getByRole('button', { name: /keep reference/i });
  const keepCount = await keepReferenceButtons.count();
  for (let index = 0; index < Math.min(2, keepCount); index += 1) {
    await keepReferenceButtons.nth(index).click({ timeout: 60_000 });
  }
  await page.getByRole('button', { name: /use selected/i }).click({ timeout: 60_000 });

  await page.waitForFunction(
    () => window.__aetherLive?.generateRequests?.length > 0,
    undefined,
    { timeout: 60_000 }
  );
  screenshots.push(await screenshot(page, '04-generation-started-canvas.png'));

  await page.getByTestId('view-switch-storyboard').click();
  await page.getByTestId('storyboard-lens').waitFor({ state: 'visible', timeout: 15_000 });
  await page.getByTestId('storyboard-slide-card').filter({ hasText: 'Aether for socials' }).click();
  await page.getByTestId('storyboard-zoom-stage').waitFor({ state: 'visible', timeout: 15_000 });
  await page.waitForTimeout(300);
  screenshots.push(await screenshot(page, '05-slide-04-loop-start.png'));
  await page.waitForTimeout(3600);
  screenshots.push(await screenshot(page, '06-slide-04-fanout.png'));
  await page.getByTestId('storyboard-close').click();
  await page.getByTestId('storyboard-lens').waitFor({ state: 'detached', timeout: 15_000 });

  await page.waitForFunction(
    () =>
      window.__aetherLive?.generateEventTexts?.some((text) =>
        String(text).includes('"type":"run.completed"')
      ),
    undefined,
    { timeout: 900_000 }
  );
  await page
    .getByTestId('canvas')
    .locator('.tl-frame-label')
    .filter({ hasText: 'LinkedIn · 1920×1080' })
    .waitFor({ state: 'visible', timeout: 60_000 });
  await page.waitForFunction(
    () =>
      document.querySelectorAll('[aria-label="text overlay (en-SG)"]').length >= 4,
    undefined,
    { timeout: 60_000 }
  );
  screenshots.push(await screenshot(page, '07-canvas-generated-after-storyboard-return.png'));

  const live = await page.evaluate(() => window.__aetherLive);
  writeJson('transcribe-response.json', live.voiceTranscribe);
  writeJson('command-response.json', live.voiceCommand);
  writeJson('references-response.json', live.voiceReferences);
  writeJson('generate-request.json', live.generateRequests.at(-1) ?? null);

  const sseText = live.generateEventTexts.at(-1) ?? '';
  writeFileSync(join(OUT_DIR, 'generate-events.sse'), sseText);
  const events = parseSseEvents(sseText);
  writeFileSync(
    join(OUT_DIR, 'generate-events.ndjson'),
    events.map((event) => JSON.stringify(event)).join('\n') + '\n'
  );
  const runCompleted = [...events].reverse().find((event) => event.type === 'run.completed');
  writeJson('visual-qa.json', runCompleted?.visualQa ?? null);

  const downloadedImages = await downloadImages(collectImageUrls(runCompleted));
  writeJson('downloaded-images.json', downloadedImages);

  await page.locator('[data-rail-section="scheduled"]').click();
  await page.waitForTimeout(1200);
  screenshots.push(await screenshot(page, '08-publish-rail-after-live-run.png'));

  const summary = {
    ok:
      live.voiceTranscribe?.ok === true &&
      live.voiceTranscribe?.provider?.id === 'local-whisper' &&
      live.voiceCommand?.command?.product?.canonicalName === 'Eight Sleep Pod' &&
      live.voiceCommand?.command?.publishMode === 'auto-post' &&
      Array.isArray(live.voiceCommand?.command?.targetPlatforms) &&
      live.voiceCommand.command.targetPlatforms.includes('x') &&
      runCompleted?.type === 'run.completed' &&
      runCompleted?.status === 'ok',
    durationMs: Date.now() - startedAt,
    workspaceUrl,
    transcriptionProvider: live.voiceTranscribe?.provider ?? null,
    commandPlanner: live.voiceCommand?.planner ?? live.voiceCommand?.command?.commandPlanner ?? null,
    command: {
      product: live.voiceCommand?.command?.product?.canonicalName ?? null,
      publishMode: live.voiceCommand?.command?.publishMode ?? null,
      targetPlatforms: live.voiceCommand?.command?.targetPlatforms ?? null,
      renderMode: live.voiceCommand?.command?.renderMode ?? null,
    },
    generateRequest: live.generateRequests.at(-1) ?? null,
    generation: runCompleted
      ? {
          status: runCompleted.status,
          mode: runCompleted.mode,
          frames: runCompleted.frames,
          provider: runCompleted.provider,
          elapsedMs: runCompleted.elapsedMs,
          persistedCampaign: runCompleted.persistedCampaign,
          heroDirections: runCompleted.heroDirections,
        }
      : null,
    screenshots,
    downloadedImages,
    fetchErrors: live.fetchErrors ?? [],
  };
  writeJson('summary.json', summary);

  await context.close();
  await browser.close();
  const videoPath = await videoHandle.path();
  const finalVideoPath = join(OUT_DIR, 'live-generation.webm');
  copyFileSync(videoPath, finalVideoPath);
  writeJson('video.json', { videoPath: finalVideoPath });

  console.log(`summary: ${join(OUT_DIR, 'summary.json')}`);
  console.log(`video: ${finalVideoPath}`);
  if (!summary.ok) process.exit(1);
}

main().catch(async (err) => {
  try {
    mkdirSync(OUT_DIR, { recursive: true });
    writeJson('error.json', {
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
  } catch {
    // ignore
  }
  console.error('live voice storyboard e2e failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
