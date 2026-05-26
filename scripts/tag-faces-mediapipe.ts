/**
 * MediaPipe face tagger for `aie2026MediaPool`.
 *
 * @mediapipe/tasks-vision is a browser-only package — it imports wasm via
 * import.meta and pokes at the DOM at module init. Rather than fight its
 * loader from Node, we host the wasm + the model file from a tiny localhost
 * server and run MediaPipe inside a Playwright Chromium page. The page
 * receives one image at a time (as a data URL), runs the detector, and
 * sends the bbox results back over `page.evaluate(...)`.
 *
 * Output sidecar: src/remotion/EventRecap/media-faces.mediapipe.json
 * (same shape as the SAM3 sidecar, minus `maskPath`).
 *
 * Usage:
 *   npx tsx scripts/tag-faces-mediapipe.ts
 *   npx tsx scripts/tag-faces-mediapipe.ts --force
 */

import http from 'node:http';
import { mkdir, readFile, writeFile, access, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { chromium, type Browser, type Page } from 'playwright';
import { aie2026MediaPool } from '../src/remotion/EventRecap/data';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT_FILE = path.join(ROOT, 'src/remotion/EventRecap/media-faces.mediapipe.json');
const CACHE_DIR = path.join(ROOT, 'node_modules/.cache/mediapipe');
const MODEL_PATH = path.join(CACHE_DIR, 'blaze_face_short_range.tflite');
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite';
const WASM_DIR = path.join(ROOT, 'node_modules/@mediapipe/tasks-vision/wasm');

interface FaceEntry {
  x: number;
  y: number;
  w: number;
  h: number;
  confidence?: number;
}
interface SidecarEntry {
  sourceDims: { width: number; height: number };
  faces: FaceEntry[];
  tagger: 'mediapipe';
  elapsedMs: number;
}
type Sidecar = Record<string, SidecarEntry>;

async function ensureModel(): Promise<void> {
  await mkdir(CACHE_DIR, { recursive: true });
  try {
    await access(MODEL_PATH);
    return;
  } catch {
    /* download */
  }
  console.log(`▸ downloading ${MODEL_URL}`);
  const res = await fetch(MODEL_URL);
  if (!res.ok) throw new Error(`model download ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(MODEL_PATH, buf);
  console.log(`  cached → ${path.relative(ROOT, MODEL_PATH)} (${buf.length} bytes)`);
}

// Tiny static server: serves /wasm/* and /model.tflite to the Playwright page.
function startStaticServer(): Promise<{ url: string; close: () => void }> {
  return new Promise((resolve) => {
    const server = http.createServer(async (req, res) => {
      try {
        if (!req.url) {
          res.statusCode = 404;
          return res.end();
        }
        let filePath: string | null = null;
        let contentType = 'application/octet-stream';
        if (req.url.startsWith('/wasm/')) {
          filePath = path.join(WASM_DIR, req.url.slice('/wasm/'.length));
          if (req.url.endsWith('.js')) contentType = 'application/javascript';
          else if (req.url.endsWith('.wasm')) contentType = 'application/wasm';
        } else if (req.url === '/model.tflite') {
          filePath = MODEL_PATH;
        } else if (req.url === '/') {
          res.setHeader('content-type', 'text/html');
          return res.end('<!doctype html><html><body><script type="module"></script></body></html>');
        }
        if (!filePath) {
          res.statusCode = 404;
          return res.end();
        }
        const s = await stat(filePath);
        res.setHeader('content-type', contentType);
        res.setHeader('content-length', String(s.size));
        // CORS — not strictly needed for same-origin, but cheap insurance.
        res.setHeader('access-control-allow-origin', '*');
        createReadStream(filePath).pipe(res);
      } catch (e) {
        res.statusCode = 500;
        res.end(String((e as Error).message));
      }
    });
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      resolve({ url: `http://127.0.0.1:${port}`, close: () => server.close() });
    });
  });
}

async function bootPage(baseUrl: string): Promise<{ browser: Browser; page: Page }> {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on('pageerror', (err) => console.warn('  [page error]', err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'warning' || msg.type() === 'error') {
      console.warn(`  [console.${msg.type()}]`, msg.text());
    }
  });
  await page.goto(`${baseUrl}/`, { waitUntil: 'load' });
  return { browser, page };
}

async function tagInPage(
  page: Page,
  baseUrl: string,
  imageBytes: Uint8Array
): Promise<{ faces: FaceEntry[]; width: number; height: number; elapsedMs: number }> {
  // We pass the image as a base64 data URL because passing Uint8Array
  // through page.evaluate works but rebuilds slowly for big files.
  const dataUrl =
    'data:image/jpeg;base64,' + Buffer.from(imageBytes.buffer, imageBytes.byteOffset, imageBytes.byteLength).toString('base64');
  const result = await page.evaluate(
    async ({ baseUrl, dataUrl }) => {
      const t0 = performance.now();
      const w = window as unknown as { __mp?: { detector: unknown } };
      if (!w.__mp) {
        // Import the package's web build directly from node_modules via the
        // static server. The bundle path is /wasm/vision_bundle.mjs only if
        // we copy it; otherwise we use the cdn-shaped FilesetResolver, which
        // takes the URL to a directory containing vision_wasm_internal.js +
        // .wasm. Our /wasm/ folder is exactly that directory.
        const visionModule = await import(/* @vite-ignore */ 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/vision_bundle.mjs');
        const { FaceDetector, FilesetResolver } = visionModule;
        const fileset = await FilesetResolver.forVisionTasks(`${baseUrl}/wasm`);
        const detector = await FaceDetector.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: `${baseUrl}/model.tflite` },
          runningMode: 'IMAGE',
          minDetectionConfidence: 0.4,
        });
        w.__mp = { detector };
      }
      const detector = (w.__mp.detector as { detect: (img: HTMLImageElement) => { detections?: Array<{ boundingBox: { originX: number; originY: number; width: number; height: number }; categories?: Array<{ score: number }> }> } });
      const img = new Image();
      img.src = dataUrl;
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('image load failed'));
      });
      const result = detector.detect(img);
      const width = img.naturalWidth;
      const height = img.naturalHeight;
      const faces = (result.detections ?? []).map((d) => ({
        x: Math.max(0, Math.min(1, d.boundingBox.originX / width)),
        y: Math.max(0, Math.min(1, d.boundingBox.originY / height)),
        w: Math.max(0, Math.min(1, d.boundingBox.width / width)),
        h: Math.max(0, Math.min(1, d.boundingBox.height / height)),
        confidence: d.categories?.[0]?.score,
      }));
      const elapsedMs = Math.round(performance.now() - t0);
      return { faces, width, height, elapsedMs };
    },
    { baseUrl, dataUrl }
  );
  return result;
}

async function downloadImage(url: string): Promise<Uint8Array> {
  const res = await fetch(url, { headers: { 'user-agent': 'aether-recap-tagger/1.0' } });
  if (!res.ok) throw new Error(`fetch ${url} ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  // Normalize via sharp so the in-browser Image() always gets clean JPEG bytes.
  return await sharp(buf).jpeg({ quality: 92 }).toBuffer();
}

async function main(): Promise<void> {
  const force = process.argv.includes('--force');
  const images = aie2026MediaPool.filter((m) => m.type === 'image');

  let existing: Sidecar = {};
  try {
    existing = JSON.parse(await readFile(OUT_FILE, 'utf8')) as Sidecar;
  } catch {
    /* first run */
  }

  await ensureModel();
  const server = await startStaticServer();
  console.log(`▸ static server: ${server.url}`);
  console.log('▸ launching Chromium…');
  const { browser, page } = await bootPage(server.url);

  const sidecar: Sidecar = { ...existing };
  let totalFaces = 0;
  let totalElapsed = 0;

  for (const [i, asset] of images.entries()) {
    if (!force && existing[asset.url]) {
      console.log(`  ${(i + 1).toString().padStart(2)}/${images.length}  cached`);
      sidecar[asset.url] = existing[asset.url];
      totalFaces += existing[asset.url].faces.length;
      continue;
    }
    try {
      const bytes = await downloadImage(asset.url);
      const result = await tagInPage(page, server.url, bytes);
      sidecar[asset.url] = {
        sourceDims: { width: result.width, height: result.height },
        faces: result.faces,
        tagger: 'mediapipe',
        elapsedMs: result.elapsedMs,
      };
      totalFaces += result.faces.length;
      totalElapsed += result.elapsedMs;
      console.log(
        `  ${(i + 1).toString().padStart(2)}/${images.length}  ` +
          `faces=${result.faces.length.toString().padStart(2)}  ${result.elapsedMs}ms  ` +
          `${asset.url.slice(-40)}`
      );
    } catch (err) {
      console.warn(`  ${(i + 1).toString().padStart(2)}/${images.length}  FAIL  ${(err as Error).message}`);
    }
  }

  await browser.close();
  server.close();

  await writeFile(OUT_FILE, JSON.stringify(sidecar, null, 2) + '\n', 'utf8');
  console.log(
    `✓ sidecar: ${Object.keys(sidecar).length} assets, ${totalFaces} faces, ` +
      `avg ${(totalElapsed / Math.max(1, images.length)).toFixed(0)}ms/img → ${path.relative(ROOT, OUT_FILE)}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
