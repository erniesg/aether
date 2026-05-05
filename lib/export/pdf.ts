interface PdfImageInput {
  bytes: Uint8Array;
  width: number;
  height: number;
}

export interface BuildEditablePdfInput {
  width: number;
  height: number;
  svg?: string;
  jpeg?: PdfImageInput;
  title?: string;
}

interface SvgTextRun {
  x: number;
  y: number;
  text: string;
  fill: string;
  fontSize: number;
}

interface SvgRectRun {
  x: number;
  y: number;
  w: number;
  h: number;
  fill: string;
}

export function buildEditablePdf(input: BuildEditablePdfInput): Uint8Array {
  const width = Math.max(1, Math.round(input.width));
  const height = Math.max(1, Math.round(input.height));
  const textRuns = input.svg ? parseSvgTextRuns(input.svg) : [];
  const rectRuns = input.svg ? parseSvgRectRuns(input.svg) : [];

  const objects: string[] = [];
  const add = (body: string): number => {
    objects.push(body);
    return objects.length;
  };

  const imageObjectId = input.jpeg
    ? add(
        [
          '<<',
          '/Type /XObject',
          '/Subtype /Image',
          `/Width ${Math.max(1, Math.round(input.jpeg.width))}`,
          `/Height ${Math.max(1, Math.round(input.jpeg.height))}`,
          '/ColorSpace /DeviceRGB',
          '/BitsPerComponent 8',
          '/Filter /DCTDecode',
          `/Length ${input.jpeg.bytes.length}`,
          '>>',
          'stream',
          bytesToBinaryString(input.jpeg.bytes),
          'endstream',
        ].join('\n')
      )
    : null;

  const fontObjectId = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const content = buildPageContent({
    width,
    height,
    imageObjectId,
    textRuns,
    rectRuns,
  });
  const contentObjectId = add(
    [
      `<< /Length ${Buffer.byteLength(content, 'binary')} >>`,
      'stream',
      content,
      'endstream',
    ].join('\n')
  );
  const resourcesObjectId = add(
    [
      '<<',
      `/Font << /F1 ${fontObjectId} 0 R >>`,
      imageObjectId ? `/XObject << /Im0 ${imageObjectId} 0 R >>` : '/XObject << >>',
      '>>',
    ].join('\n')
  );
  const pageObjectId = add(
    [
      '<<',
      '/Type /Page',
      '/Parent 0 0 R',
      `/MediaBox [0 0 ${width} ${height}]`,
      `/Resources ${resourcesObjectId} 0 R`,
      `/Contents ${contentObjectId} 0 R`,
      '>>',
    ].join('\n')
  );
  const pagesObjectId = add(
    [
      '<<',
      '/Type /Pages',
      `/Kids [${pageObjectId} 0 R]`,
      '/Count 1',
      '>>',
    ].join('\n')
  );
  const catalogObjectId = add(`<< /Type /Catalog /Pages ${pagesObjectId} 0 R >>`);
  const infoObjectId = add(
    `<< /Producer (aether) /Title (${escapePdfLiteral(input.title ?? 'aether export')}) >>`
  );

  objects[pageObjectId - 1] = objects[pageObjectId - 1].replace('/Parent 0 0 R', `/Parent ${pagesObjectId} 0 R`);

  let pdf = '%PDF-1.7\n%\xE2\xE3\xCF\xD3\n';
  const offsets = [0];
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(pdf, 'binary'));
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf, 'binary');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i < offsets.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += [
    'trailer',
    `<< /Size ${objects.length + 1} /Root ${catalogObjectId} 0 R /Info ${infoObjectId} 0 R >>`,
    'startxref',
    String(xrefOffset),
    '%%EOF',
    '',
  ].join('\n');

  return new Uint8Array(Buffer.from(pdf, 'binary'));
}

function buildPageContent(input: {
  width: number;
  height: number;
  imageObjectId: number | null;
  textRuns: SvgTextRun[];
  rectRuns: SvgRectRun[];
}): string {
  const lines: string[] = [];
  if (input.imageObjectId) {
    lines.push('q');
    lines.push(`${input.width} 0 0 ${input.height} 0 0 cm`);
    lines.push('/Im0 Do');
    lines.push('Q');
  }
  for (const rect of input.rectRuns) {
    const fill = colorToRgb(rect.fill);
    if (!fill) continue;
    lines.push('q');
    lines.push(`${fill.join(' ')} rg`);
    lines.push(`${num(rect.x)} ${num(input.height - rect.y - rect.h)} ${num(rect.w)} ${num(rect.h)} re`);
    lines.push('f');
    lines.push('Q');
  }
  for (const run of input.textRuns) {
    const fill = colorToRgb(run.fill) ?? [0, 0, 0];
    lines.push('BT');
    lines.push(`/F1 ${num(run.fontSize)} Tf`);
    lines.push(`${fill.join(' ')} rg`);
    lines.push(`${num(run.x)} ${num(input.height - run.y)} Td`);
    lines.push(`${pdfText(run.text)} Tj`);
    lines.push('ET');
  }
  return `${lines.join('\n')}\n`;
}

function parseSvgTextRuns(svg: string): SvgTextRun[] {
  const runs: SvgTextRun[] = [];
  const textRe = /<text\b([^>]*)>([\s\S]*?)<\/text>/gi;
  let textMatch: RegExpExecArray | null;
  while ((textMatch = textRe.exec(svg))) {
    const attrs = parseAttrs(textMatch[1] ?? '');
    const baseX = numberAttr(attrs.x, 0);
    const baseY = numberAttr(attrs.y, 0);
    const fontSize = numberAttr(attrs['font-size'] ?? attrs.fontSize, 16);
    const fill = attrs.fill ?? '#000000';
    const body = textMatch[2] ?? '';
    const tspanRe = /<tspan\b([^>]*)>([\s\S]*?)<\/tspan>/gi;
    let y = baseY;
    let foundTspan = false;
    let tspanMatch: RegExpExecArray | null;
    while ((tspanMatch = tspanRe.exec(body))) {
      foundTspan = true;
      const tspanAttrs = parseAttrs(tspanMatch[1] ?? '');
      const dy = numberAttr(tspanAttrs.dy, 0);
      y += dy;
      runs.push({
        x: numberAttr(tspanAttrs.x, baseX),
        y,
        text: decodeXml(stripTags(tspanMatch[2] ?? '')).trim(),
        fill,
        fontSize,
      });
    }
    if (!foundTspan) {
      runs.push({
        x: baseX,
        y: baseY,
        text: decodeXml(stripTags(body)).trim(),
        fill,
        fontSize,
      });
    }
  }
  return runs.filter((run) => run.text.length > 0);
}

function parseSvgRectRuns(svg: string): SvgRectRun[] {
  const runs: SvgRectRun[] = [];
  const rectRe = /<rect\b([^>]*?)(?:\/>|>[\s\S]*?<\/rect>)/gi;
  let match: RegExpExecArray | null;
  while ((match = rectRe.exec(svg))) {
    const attrs = parseAttrs(match[1] ?? '');
    const fill = attrs.fill;
    if (!fill || fill === 'none' || fill === 'transparent') continue;
    runs.push({
      x: numberAttr(attrs.x, 0),
      y: numberAttr(attrs.y, 0),
      w: numberAttr(attrs.width, 0),
      h: numberAttr(attrs.height, 0),
      fill,
    });
  }
  return runs.filter((run) => run.w > 0 && run.h > 0);
}

function parseAttrs(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  const attrRe = /([\w:-]+)=["']([^"']*)["']/g;
  let match: RegExpExecArray | null;
  while ((match = attrRe.exec(raw))) {
    out[match[1]!] = match[2]!;
  }
  return out;
}

function numberAttr(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
}

function stripTags(value: string): string {
  return value.replace(/<[^>]+>/g, '');
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function colorToRgb(value: string): [string, string, string] | null {
  if (!value.startsWith('#')) return null;
  const hex = value.slice(1);
  const expanded =
    hex.length === 3
      ? [...hex].map((ch) => `${ch}${ch}`).join('')
      : hex.length === 6
        ? hex
        : '';
  if (!expanded) return null;
  const r = Number.parseInt(expanded.slice(0, 2), 16) / 255;
  const g = Number.parseInt(expanded.slice(2, 4), 16) / 255;
  const b = Number.parseInt(expanded.slice(4, 6), 16) / 255;
  if (![r, g, b].every(Number.isFinite)) return null;
  return [num(r), num(g), num(b)];
}

function pdfText(value: string): string {
  if (/^[\x09\x0a\x0d\x20-\x7e]*$/.test(value)) {
    return `(${escapePdfLiteral(value)})`;
  }
  const bytes = Buffer.from(value, 'utf16le');
  const swapped = Buffer.alloc(bytes.length + 2);
  swapped[0] = 0xfe;
  swapped[1] = 0xff;
  for (let i = 0; i < bytes.length; i += 2) {
    swapped[i + 2] = bytes[i + 1] ?? 0;
    swapped[i + 3] = bytes[i] ?? 0;
  }
  return `<${swapped.toString('hex').toUpperCase()}>`;
}

function escapePdfLiteral(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function bytesToBinaryString(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('binary');
}

function num(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
}
