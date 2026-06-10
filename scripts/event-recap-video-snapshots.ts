/**
 * Capture visual evidence for the event-recap template previews: one frame
 * per template × format × event (timeline seeked to a hero timestamp), plus a
 * per-event contact sheet composed from those frames.
 *
 *   npx tsx scripts/event-recap-video-previews.ts   # first, write the previews
 *   npx tsx scripts/event-recap-video-snapshots.ts
 *
 * Frames land in a scratch dir; only the contact sheets and the vertical
 * reference frames are written into the repo (committed as review evidence):
 *   docs/explorations/motion-graphics/template-previews/snapshots/contact-sheet--<eventId>.png
 *   docs/explorations/motion-graphics/template-previews/snapshots/<eventId>--<templateId>--vertical.png
 *
 * Requires the GSAP CDN to be reachable (the previews load gsap the same way
 * the shipped explorations do). IBM Plex Mono is injected from Google Fonts
 * for the screenshots only, so frames show the intended face even on hosts
 * without the font installed; the HyperFrames compiler embeds it at render
 * time in the real pipeline.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, type Browser } from '@playwright/test';
import { getRecapTemplate, type RecapTemplateId } from '../lib/video/event-recap';

interface ManifestEntry {
  eventId: string;
  templateId: string;
  format: 'vertical' | 'square' | 'landscape';
  width: number;
  height: number;
  status: string;
  file?: string;
}

const PREVIEW_DIR = join(
  __dirname,
  '..',
  'docs',
  'explorations',
  'motion-graphics',
  'template-previews',
);
const SNAP_DIR = join(PREVIEW_DIR, 'snapshots');
const SCRATCH = join(tmpdir(), 'recap-template-frames');

const FONT_CSS_URL =
  'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;700&display=swap';

async function captureFrame(
  browser: Browser,
  entry: ManifestEntry,
  outPath: string,
): Promise<void> {
  const page = await browser.newPage({
    viewport: { width: entry.width, height: entry.height },
    deviceScaleFactor: 0.5,
  });
  await page.goto(`file://${join(PREVIEW_DIR, entry.file!)}`);
  try {
    // Best-effort: show the intended face in the frames. The library output
    // declares the family only; the HyperFrames compiler embeds it for real
    // renders, so a missing font here never blocks evidence capture.
    await page.addStyleTag({ url: FONT_CSS_URL });
    await page.evaluate(
      'Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 5000))]).then(() => true)',
    );
  } catch {
    console.warn(`font injection skipped for ${entry.file}`);
  }
  await page.waitForFunction('!!(window.__timelines && window.__timelines.main)');
  const heroTime = getRecapTemplate(entry.templateId as RecapTemplateId).heroTimeSeconds;
  // seek(t, false): don't suppress events, so counter onUpdate callbacks fire
  // and tweened figures show their seeked value instead of their initial text.
  await page.evaluate(`window.__timelines.main.seek(${heroTime}, false) && true`);
  await page.screenshot({ path: outPath });
  await page.close();
}

async function contactSheet(
  browser: Browser,
  eventId: string,
  frames: Array<{ entry: ManifestEntry; path: string }>,
  outPath: string,
): Promise<void> {
  const cells = frames
    .map(({ entry, path }) => {
      const b64 = readFileSync(path).toString('base64');
      return `      <figure>
        <img src="data:image/png;base64,${b64}" style="width: ${Math.round(entry.width / 4)}px;" />
        <figcaption>${entry.templateId} · ${entry.format} · ${entry.width}×${entry.height}</figcaption>
      </figure>`;
    })
    .join('\n');
  const html = `<!doctype html>
<html><head><meta charset="UTF-8" /><style>
  body { background: #1a1a1a; margin: 0; padding: 28px; font-family: ui-monospace, monospace; }
  h1 { color: #f4ede0; font-size: 20px; font-weight: 400; letter-spacing: 0.12em; }
  .grid { display: flex; flex-wrap: wrap; gap: 20px; align-items: flex-end; }
  figure { margin: 0; }
  img { display: block; outline: 1px solid rgba(244,237,224,0.25); }
  figcaption { color: #f4ede0; font-size: 11px; padding-top: 6px; opacity: 0.8; }
</style></head>
<body>
  <h1>event-recap templates · ${eventId} · template × format fan-out</h1>
  <div class="grid">
${cells}
  </div>
</body></html>`;
  const sheetPath = join(SCRATCH, `contact-sheet--${eventId}.html`);
  writeFileSync(sheetPath, html);
  const page = await browser.newPage({ viewport: { width: 1660, height: 900 } });
  await page.goto(`file://${sheetPath}`);
  await page.screenshot({ path: outPath, fullPage: true });
  await page.close();
}

async function main(): Promise<void> {
  const manifest: ManifestEntry[] = JSON.parse(
    readFileSync(join(PREVIEW_DIR, 'manifest.json'), 'utf8'),
  );
  const renderable = manifest.filter((m) => m.status === 'renderable' && m.file);
  mkdirSync(SCRATCH, { recursive: true });
  mkdirSync(SNAP_DIR, { recursive: true });

  const browser = await chromium.launch();
  const byEvent = new Map<string, Array<{ entry: ManifestEntry; path: string }>>();
  for (const entry of renderable) {
    const framePath = join(
      SCRATCH,
      `${entry.eventId}--${entry.templateId}--${entry.format}.png`,
    );
    await captureFrame(browser, entry, framePath);
    if (!byEvent.has(entry.eventId)) byEvent.set(entry.eventId, []);
    byEvent.get(entry.eventId)!.push({ entry, path: framePath });
    if (entry.format === 'vertical') {
      writeFileSync(
        join(SNAP_DIR, `${entry.eventId}--${entry.templateId}--vertical.png`),
        readFileSync(framePath),
      );
    }
    console.log(`frame: ${entry.eventId} ${entry.templateId} ${entry.format}`);
  }

  for (const [eventId, frames] of byEvent) {
    const out = join(SNAP_DIR, `contact-sheet--${eventId}.png`);
    await contactSheet(browser, eventId, frames, out);
    console.log(`contact sheet: ${out}`);
  }
  await browser.close();
  console.log(`scratch frames: ${SCRATCH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
