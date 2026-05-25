/**
 * Tag every entry in `aie2026MediaPool` with a VLM-derived focal point and
 * subject bounding box, then patch them back into
 * `src/remotion/EventRecap/data.ts` in-place.
 *
 * The 9:16 vertical and 16:9 horizontal Remotion compositions all use
 * `objectFit: 'cover'` on raw photos. Without an explicit `objectPosition`
 * the browser defaults to 50%/50% centered crops, which routinely chops
 * faces, text overlays, and key subjects out of frame. This script asks
 * a vision model where the subject actually lives so the cropper can
 * keep it visible.
 *
 * Usage:
 *   source /Users/erniesg/code/erniesg/aether/.env.local
 *   npx tsx scripts/tag-media-focal.ts
 *
 * Cost: ~$0.05 for all 18 photos at gpt-5.4-mini rates.
 *
 * Output:
 *   - src/remotion/EventRecap/media-focal.json (sidecar with rationales)
 *   - src/remotion/EventRecap/data.ts is patched in-place to add
 *     `focal: { x, y }` and `subjectBox: { x, y, w, h }` to each
 *     image asset in aie2026MediaPool.
 */

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { aie2026MediaPool, type MediaAsset } from '../src/remotion/EventRecap/data';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA_FILE = path.join(ROOT, 'src/remotion/EventRecap/data.ts');
const SIDECAR_FILE = path.join(ROOT, 'src/remotion/EventRecap/media-focal.json');

const MODEL = 'gpt-5.4-mini';
const ENDPOINT = 'https://api.openai.com/v1/chat/completions';

interface FocalResult {
  focal: { x: number; y: number };
  subjectBox: { x: number; y: number; w: number; h: number };
  rationale: string;
}

interface SidecarEntry extends FocalResult {
  url: string;
  authorName: string;
}

const SYSTEM_PROMPT = `You are helping crop a photo for both 9:16 vertical and 16:9 horizontal video frames using CSS \`objectFit: cover\`. Your job is to find:

1. The single most important point to keep visible (focal): a face/eyes if a person is present, otherwise the central subject, or important text. Return as normalized (x, y) where (0, 0) is the top-left of the image and (1, 1) is the bottom-right.

2. A subject bounding box (subjectBox) covering the full key content (e.g. the speaker's head and shoulders, the group of people, the slide text). Normalized (x, y, w, h).

Rules:
- For a portrait, focal goes on the eyes/face.
- If there are multiple people, focal goes on the most prominent or centered one.
- If the image is a slide/text capture, focal goes on the most important word or the slide center.
- focal must lie inside subjectBox.
- All coordinates in [0, 1].

Return ONLY a single JSON object with shape:
{
  "focal": { "x": number, "y": number },
  "subjectBox": { "x": number, "y": number, "w": number, "h": number },
  "rationale": "one sentence describing what you saw"
}
No prose outside the JSON.`;

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function validate(raw: unknown): FocalResult | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const f = obj.focal as { x?: unknown; y?: unknown } | undefined;
  const b = obj.subjectBox as { x?: unknown; y?: unknown; w?: unknown; h?: unknown } | undefined;
  if (!f || typeof f.x !== 'number' || typeof f.y !== 'number') return null;
  if (
    !b ||
    typeof b.x !== 'number' ||
    typeof b.y !== 'number' ||
    typeof b.w !== 'number' ||
    typeof b.h !== 'number'
  )
    return null;
  return {
    focal: { x: clamp01(f.x), y: clamp01(f.y) },
    subjectBox: {
      x: clamp01(b.x),
      y: clamp01(b.y),
      w: clamp01(b.w),
      h: clamp01(b.h),
    },
    rationale: typeof obj.rationale === 'string' ? obj.rationale : '',
  };
}

async function tagOne(url: string, apiKey: string): Promise<FocalResult> {
  const body = {
    model: MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Tag this photo.' },
          { type: 'image_url', image_url: { url, detail: 'low' } },
        ],
      },
    ],
    response_format: { type: 'json_object' },
  };

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI ${res.status}: ${text.slice(0, 200)}`);
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error('Empty model response');

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error(`Non-JSON response: ${content.slice(0, 200)}`);
  }

  const validated = validate(parsed);
  if (!validated) throw new Error(`Invalid shape: ${JSON.stringify(parsed).slice(0, 200)}`);
  return validated;
}

async function tagWithRetry(url: string, apiKey: string, attempts = 3): Promise<FocalResult> {
  let lastErr: Error | null = null;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await tagOne(url, apiKey);
    } catch (err) {
      lastErr = err as Error;
      // Backoff before next attempt (CDN timeouts often clear on retry)
      if (i < attempts - 1) {
        await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
      }
    }
  }
  throw lastErr ?? new Error('Unknown tagging failure');
}

async function main(): Promise<void> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('OPENAI_API_KEY not set. Source aether/.env.local first.');
    process.exit(1);
  }

  const images = aie2026MediaPool.filter((m) => m.type === 'image');
  console.log(`▸ tagging ${images.length} images with ${MODEL}`);

  const results = new Map<string, FocalResult>();
  const sidecar: SidecarEntry[] = [];
  let failed = 0;

  // If the asset already has focal+subjectBox in data.ts, skip it (idempotent
  // re-run only fills in misses). Override by passing --force.
  const force = process.argv.includes('--force');

  for (const [i, asset] of images.entries()) {
    const label = `${i + 1}/${images.length}  ${asset.authorName.slice(0, 24).padEnd(24)}`;
    if (!force && asset.focal && asset.subjectBox) {
      console.log(`  ${label}  cached  (use --force to re-tag)`);
      results.set(asset.url, {
        focal: asset.focal,
        subjectBox: asset.subjectBox,
        rationale: '(cached)',
      });
      sidecar.push({
        url: asset.url,
        authorName: asset.authorName,
        focal: asset.focal,
        subjectBox: asset.subjectBox,
        rationale: '(cached)',
      });
      continue;
    }
    try {
      const result = await tagWithRetry(asset.url, apiKey);
      results.set(asset.url, result);
      sidecar.push({ url: asset.url, authorName: asset.authorName, ...result });
      const f = result.focal;
      const b = result.subjectBox;
      console.log(
        `  ${label}  focal=(${f.x.toFixed(2)}, ${f.y.toFixed(2)})  box=(${b.x.toFixed(2)}, ${b.y.toFixed(2)}, ${b.w.toFixed(2)}, ${b.h.toFixed(2)})  ${result.rationale.slice(0, 80)}`
      );
    } catch (err) {
      failed += 1;
      console.error(`  ${label}  FAILED: ${(err as Error).message}`);
    }
  }

  console.log(`\n▸ tagged ${results.size}/${images.length} (failed: ${failed})`);

  // Write sidecar
  await writeFile(SIDECAR_FILE, JSON.stringify(sidecar, null, 2) + '\n', 'utf8');
  console.log(`✓ sidecar → ${path.relative(ROOT, SIDECAR_FILE)}`);

  // Patch data.ts in-place. Each MediaAsset literal currently looks like:
  //   { url: PROXY + '...', type: 'image', authorName: '...', platform: 'x',
  //     storyId: '...', reachScore: 1.234 },
  // We append `, focal: { x, y }, subjectBox: { x, y, w, h }` before the
  // trailing `}` on each line whose URL substring matches a tagged asset.
  let src = await readFile(DATA_FILE, 'utf8');
  let patched = 0;

  // Patch each asset literal line-by-line. The data.ts file keeps each
  // MediaAsset on its own line within `aie2026MediaPool`, so we can split
  // on newlines and rewrite by suffix.
  const lines = src.split('\n');
  for (const [url, result] of results.entries()) {
    const suffix = url.split('/').pop() ?? url;
    let count = 0;
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      // Only match lines inside the media-pool array. Each line ends the
      // URL string with `<suffix>'` so we match on that to stay anchored
      // to the right asset literal.
      if (!line.includes(`${suffix}'`) || !line.includes('PROXY')) continue;
      // Strip any pre-existing focal/subjectBox so we are idempotent.
      const stripped = line
        .replace(/, focal: \{[^}]*\}/, '')
        .replace(/, subjectBox: \{[^}]*\}/, '');
      const f = result.focal;
      const b = result.subjectBox;
      const focalStr = `, focal: { x: ${f.x.toFixed(3)}, y: ${f.y.toFixed(3)} }`;
      const boxStr = `, subjectBox: { x: ${b.x.toFixed(3)}, y: ${b.y.toFixed(3)}, w: ${b.w.toFixed(3)}, h: ${b.h.toFixed(3)} }`;
      // Insert before the trailing ` },` or ` }`.
      lines[i] = stripped.replace(/(\s*\},?)$/, (_m, tail) => focalStr + boxStr + tail);
      count += 1;
    }
    if (count === 0) {
      console.warn(`  ! could not patch ${suffix} into data.ts`);
    } else {
      patched += 1;
    }
  }
  src = lines.join('\n');

  await writeFile(DATA_FILE, src, 'utf8');
  console.log(`✓ patched ${patched} entries in ${path.relative(ROOT, DATA_FILE)}`);

  // Note unused parameter to avoid unused-import lint
  void ({} as MediaAsset);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
