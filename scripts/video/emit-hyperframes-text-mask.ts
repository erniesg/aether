#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { buildHyperframesTextMaskComposition } from '@/lib/video/hyperframes';
import type { TextMaskMediaKind } from '@/lib/video/textMask';
import type { VideoAspectRatio } from '@/lib/providers/video/types';

const { values } = parseArgs({
  options: {
    text: { type: 'string' },
    media: { type: 'string' },
    kind: { type: 'string' },
    poster: { type: 'string' },
    output: { type: 'string' },
    aspect: { type: 'string' },
    title: { type: 'string' },
    kicker: { type: 'string' },
    footerTitle: { type: 'string' },
    footerBody: { type: 'string' },
    static: { type: 'boolean' },
    toggleMask: { type: 'boolean' },
    maskOff: { type: 'boolean' },
    duration: { type: 'string' },
    fps: { type: 'string' },
    fontSize: { type: 'string' },
    lineHeight: { type: 'string' },
    fontFamily: { type: 'string' },
    textTransform: { type: 'string' },
    strokeWidth: { type: 'string' },
    strokeColor: { type: 'string' },
    backgroundFill: { type: 'string' },
    dim: { type: 'string' },
    blur: { type: 'string' },
    scale: { type: 'string' },
  },
});

if (!values.text || !values.media) {
  console.error(
    'usage: npm run video:text-mask -- --text "AETHER" --media ./assets/intro.mp4 --kind video --output ./experiments/video/hackathon-intro.html'
  );
  process.exit(1);
}

const kind = (values.kind ?? 'video') as TextMaskMediaKind;
if (kind !== 'video' && kind !== 'image') {
  console.error(`invalid --kind "${values.kind}". expected "video" or "image".`);
  process.exit(1);
}

const aspectRatio = (values.aspect ?? '16:9') as VideoAspectRatio;
const durationSec = values.duration ? Number(values.duration) : 4;
const fps = values.fps ? Number(values.fps) : 30;
const fontSize = values.fontSize ? Number(values.fontSize) : undefined;
const lineHeight = values.lineHeight ? Number(values.lineHeight) : undefined;
const strokeWidth = values.strokeWidth ? Number(values.strokeWidth) : undefined;
const dimOpacity = values.dim ? Number(values.dim) : undefined;
const blurPx = values.blur ? Number(values.blur) : undefined;
const backgroundScale = values.scale ? Number(values.scale) : undefined;
const outputPath = path.resolve(
  values.output ?? './experiments/video/hackathon-intro.html'
);

async function main() {
  const html = buildHyperframesTextMaskComposition({
    title: values.title ?? 'Hackathon Intro',
    text: values.text!,
    media: {
      kind,
      url: values.media!,
      posterUrl: values.poster,
    },
    textStyle: {
      ...(fontSize !== undefined ? { fontSizePx: fontSize } : {}),
      ...(lineHeight !== undefined ? { lineHeight } : {}),
      ...(values.fontFamily ? { fontFamily: values.fontFamily } : {}),
      ...(values.textTransform === 'none' || values.textTransform === 'uppercase'
        ? { textTransform: values.textTransform }
        : {}),
      ...(strokeWidth !== undefined ? { strokeWidthPx: strokeWidth } : {}),
      ...(values.strokeColor ? { strokeColor: values.strokeColor } : {}),
    },
    background: {
      ...(values.backgroundFill ? { fill: values.backgroundFill } : {}),
      ...(dimOpacity !== undefined ? { dimOpacity } : {}),
      ...(blurPx !== undefined ? { blurPx } : {}),
      ...(backgroundScale !== undefined ? { scale: backgroundScale } : {}),
    },
    overlay: {
      ...(values.kicker ? { kicker: values.kicker } : {}),
      ...(values.footerTitle ? { footerTitle: values.footerTitle } : {}),
      ...(values.footerBody ? { footerBody: values.footerBody } : {}),
    },
    preview: {
      motionEnabled: !values.static,
      allowMaskToggle: Boolean(values.toggleMask),
      maskInitiallyEnabled: !values.maskOff,
    },
    aspectRatio,
    durationSec: Number.isFinite(durationSec) && durationSec > 0 ? durationSec : 4,
    fps: Number.isFinite(fps) && fps > 0 ? fps : 30,
  });

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, html, 'utf8');

  console.log(`wrote ${outputPath}`);
}

void main();
