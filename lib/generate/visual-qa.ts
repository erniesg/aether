import sharp from 'sharp';

export type VisualQaStatus = 'pass' | 'fail' | 'needs-human-review';

export interface VisualQaResult {
  status: VisualQaStatus;
  reasons: string[];
  metrics: {
    width: number;
    height: number;
    verticalLineCount: number;
    horizontalLineCount: number;
    edgeDensity: number;
    gridScore: number;
  };
}

export async function imageSourceToBuffer(source: string): Promise<Buffer> {
  if (source.startsWith('data:')) {
    const comma = source.indexOf(',');
    if (comma === -1) throw new Error('invalid data URL image source');
    return Buffer.from(source.slice(comma + 1), 'base64');
  }
  const res = await fetch(source, {
    headers: {
      Accept: 'image/*',
      'User-Agent': 'aether-visual-qa/1.0',
    },
  });
  if (!res.ok) {
    throw new Error(`visual QA image download failed: HTTP ${res.status}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

export async function analyzeImageForGridCollage(
  bytes: Buffer | Uint8Array
): Promise<VisualQaResult> {
  const resized = await sharp(bytes)
    .removeAlpha()
    .grayscale()
    .resize(192, 192, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height } = resized.info;
  const data = resized.data;
  const verticalEdges = new Array(width - 1).fill(0) as number[];
  const horizontalEdges = new Array(height - 1).fill(0) as number[];
  let highEdgePixels = 0;
  let edgePixels = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 1; x < width; x += 1) {
      const diff = Math.abs(data[y * width + x] - data[y * width + x - 1]);
      verticalEdges[x - 1] += diff;
      edgePixels += 1;
      if (diff > 44) highEdgePixels += 1;
    }
  }
  for (let y = 1; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const diff = Math.abs(data[y * width + x] - data[(y - 1) * width + x]);
      horizontalEdges[y - 1] += diff;
      edgePixels += 1;
      if (diff > 44) highEdgePixels += 1;
    }
  }

  const normalizedVertical = verticalEdges.map((value) => value / height);
  const normalizedHorizontal = horizontalEdges.map((value) => value / width);
  const verticalLines = strongLinePositions(normalizedVertical);
  const horizontalLines = strongLinePositions(normalizedHorizontal);
  const edgeDensity = edgePixels > 0 ? highEdgePixels / edgePixels : 0;
  const gridScore =
    verticalLines.length * 1.2 + horizontalLines.length * 1.2 + edgeDensity * 6;
  const reasons: string[] = [];

  if (verticalLines.length >= 2) {
    reasons.push(`${verticalLines.length} strong vertical internal seams`);
  }
  if (horizontalLines.length >= 2) {
    reasons.push(`${horizontalLines.length} strong horizontal internal seams`);
  }
  if (edgeDensity > 0.28) {
    reasons.push(`excessive grid-like edge density ${edgeDensity.toFixed(3)}`);
  }

  let status: VisualQaStatus = 'pass';
  if (
    (verticalLines.length >= 2 && horizontalLines.length >= 1) ||
    (horizontalLines.length >= 2 && verticalLines.length >= 1) ||
    verticalLines.length + horizontalLines.length >= 4 ||
    edgeDensity > 0.34
  ) {
    status = 'fail';
  } else if (verticalLines.length + horizontalLines.length >= 2 || edgeDensity > 0.24) {
    status = 'needs-human-review';
    if (reasons.length === 0) reasons.push('visual grid heuristic was uncertain');
  }

  return {
    status,
    reasons,
    metrics: {
      width,
      height,
      verticalLineCount: verticalLines.length,
      horizontalLineCount: horizontalLines.length,
      edgeDensity,
      gridScore,
    },
  };
}

export async function runVisualGridQa(source: string): Promise<VisualQaResult> {
  const bytes = await imageSourceToBuffer(source);
  return analyzeImageForGridCollage(bytes);
}

function strongLinePositions(values: number[]): number[] {
  const stats = distribution(values);
  const threshold = Math.max(34, stats.mean + stats.std * 3.2);
  const positions: number[] = [];
  let runStart = -1;
  for (let i = 0; i < values.length; i += 1) {
    const isStrong = values[i]! >= threshold;
    if (isStrong && runStart === -1) runStart = i;
    if ((!isStrong || i === values.length - 1) && runStart !== -1) {
      const runEnd = isStrong && i === values.length - 1 ? i : i - 1;
      const center = Math.round((runStart + runEnd) / 2);
      if (center > values.length * 0.12 && center < values.length * 0.88) {
        positions.push(center);
      }
      runStart = -1;
    }
  }
  return collapseNearby(positions, 8);
}

function distribution(values: number[]): { mean: number; std: number } {
  if (values.length === 0) return { mean: 0, std: 0 };
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return { mean, std: Math.sqrt(variance) };
}

function collapseNearby(values: number[], distance: number): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const out: number[] = [];
  for (const value of sorted) {
    if (out.length === 0 || value - out[out.length - 1]! > distance) out.push(value);
  }
  return out;
}

