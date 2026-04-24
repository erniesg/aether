#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import {
  buildHyperframesDoubleExposureComposition,
} from '@/lib/video/hyperframesDoubleExposure';
import type {
  DoubleExposureFit,
  DoubleExposureSceneInput,
  DoubleExposureLook,
  DoubleExposureMediaKind,
  DoubleExposureTitleEffectId,
} from '@/lib/video/doubleExposure';
import {
  buildDoubleExposureSkillScene,
  getDoubleExposureSkill,
  listDoubleExposureSkills,
} from '@/lib/video/doubleExposureSkills';
import type { VideoAspectRatio } from '@/lib/providers/video/types';

function parseKind(value: string | undefined, fallback: DoubleExposureMediaKind): DoubleExposureMediaKind {
  return value === 'video' || value === 'image' ? value : fallback;
}

function parseFit(value: string | undefined, fallback: DoubleExposureFit): DoubleExposureFit {
  return value === 'contain' || value === 'cover' ? value : fallback;
}

function parseTitleEffect(
  value: string | undefined,
  fallback: DoubleExposureTitleEffectId
): DoubleExposureTitleEffectId {
  return value === 'none' || value === 'soft-blur-in' ? value : fallback;
}

function parseLook(value: string | undefined, fallback: DoubleExposureLook): DoubleExposureLook {
  return value === 'classic' || value === 'cinematic' ? value : fallback;
}

function parseNumber(value: string | undefined) {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function maybeObject<T extends object>(value: T) {
  return Object.keys(value).length > 0 ? value : undefined;
}

const { values } = parseArgs({
  args: process.argv
    .slice(2)
    .map((arg) =>
      arg.startsWith('--')
        ? `--${arg
            .slice(2)
            .replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase())}`
        : arg
    ),
  options: {
    skill: { type: 'string' },
    listSkills: { type: 'boolean' },
    subject: { type: 'string' },
    subjectKind: { type: 'string' },
    subjectPoster: { type: 'string' },
    subjectFit: { type: 'string' },
    exposure: { type: 'string' },
    exposureKind: { type: 'string' },
    exposurePoster: { type: 'string' },
    exposureFit: { type: 'string' },
    background: { type: 'string' },
    backgroundKind: { type: 'string' },
    backgroundPoster: { type: 'string' },
    backgroundFit: { type: 'string' },
    atmosphere: { type: 'string', multiple: true },
    atmosphereKind: { type: 'string', multiple: true },
    atmospherePoster: { type: 'string', multiple: true },
    output: { type: 'string' },
    look: { type: 'string' },
    aspect: { type: 'string' },
    duration: { type: 'string' },
    fps: { type: 'string' },
    title: { type: 'string' },
    kicker: { type: 'string' },
    overlayTitle: { type: 'string' },
    body: { type: 'string' },
    titleEffect: { type: 'string' },
    static: { type: 'boolean' },
    toggle: { type: 'boolean' },
    effectOff: { type: 'boolean' },
    threshold: { type: 'string' },
    softness: { type: 'string' },
    feather: { type: 'string' },
    subjectScale: { type: 'string' },
    subjectAnchorX: { type: 'string' },
    subjectAnchorY: { type: 'string' },
    subjectOffsetX: { type: 'string' },
    subjectOffsetY: { type: 'string' },
    exposureScale: { type: 'string' },
    exposureAnchorX: { type: 'string' },
    exposureAnchorY: { type: 'string' },
    exposureOffsetX: { type: 'string' },
    exposureOffsetY: { type: 'string' },
    backgroundScale: { type: 'string' },
    backgroundAnchorX: { type: 'string' },
    backgroundAnchorY: { type: 'string' },
    backgroundOffsetX: { type: 'string' },
    backgroundOffsetY: { type: 'string' },
  },
});

if (values.listSkills) {
  const skills = listDoubleExposureSkills();
  console.log('Double-exposure skills');
  for (const skill of skills) {
    console.log(`- ${skill.id}: ${skill.name}`);
    console.log(`  ${skill.summary}`);
    console.log(`  best for: ${skill.bestFor}`);
    console.log(
      `  tool: npm run video:double-exposure -- --skill ${skill.id} --output ${skill.defaultOutput}`
    );
  }
  process.exit(0);
}

const selectedSkill = values.skill ? getDoubleExposureSkill(values.skill) : undefined;
if (values.skill && !selectedSkill) {
  console.error(`unknown double-exposure skill: ${values.skill}`);
  process.exit(1);
}

const baseScene = selectedSkill
  ? buildDoubleExposureSkillScene(selectedSkill.id)
  : undefined;

if (!baseScene && (!values.subject || !values.exposure)) {
  console.error(
    'usage: npm run video:double-exposure -- --skill echo-still --output ./experiments/video/double-exposure-image/index.html\n   or: npm run video:double-exposure -- --subject ./assets/subject.png --exposure ./assets/city.png --output ./experiments/video/double-exposure-image/index.html'
  );
  process.exit(1);
}

const aspectRatio = (values.aspect ?? baseScene?.aspectRatio ?? '16:9') as VideoAspectRatio;
const durationSec = parseNumber(values.duration);
const fps = parseNumber(values.fps);
const threshold = parseNumber(values.threshold);
const softness = parseNumber(values.softness);
const featherPx = parseNumber(values.feather);
const atmosphereUrls = values.atmosphere ?? [];
const atmosphereKinds = values.atmosphereKind ?? [];
const atmospherePosters = values.atmospherePoster ?? [];
const outputPath = path.resolve(
  values.output ?? selectedSkill?.defaultOutput ?? './experiments/video/double-exposure-image/index.html'
);

async function main() {
  const subjectLayout = maybeObject({
    ...(parseNumber(values.subjectScale) !== undefined
      ? { scale: parseNumber(values.subjectScale) }
      : {}),
    ...(parseNumber(values.subjectAnchorX) !== undefined
      ? { anchorX: parseNumber(values.subjectAnchorX) }
      : {}),
    ...(parseNumber(values.subjectAnchorY) !== undefined
      ? { anchorY: parseNumber(values.subjectAnchorY) }
      : {}),
    ...(parseNumber(values.subjectOffsetX) !== undefined
      ? { offsetXPx: parseNumber(values.subjectOffsetX) }
      : {}),
    ...(parseNumber(values.subjectOffsetY) !== undefined
      ? { offsetYPx: parseNumber(values.subjectOffsetY) }
      : {}),
  });
  const exposureLayout = maybeObject({
    ...(parseNumber(values.exposureScale) !== undefined
      ? { scale: parseNumber(values.exposureScale) }
      : {}),
    ...(parseNumber(values.exposureAnchorX) !== undefined
      ? { anchorX: parseNumber(values.exposureAnchorX) }
      : {}),
    ...(parseNumber(values.exposureAnchorY) !== undefined
      ? { anchorY: parseNumber(values.exposureAnchorY) }
      : {}),
    ...(parseNumber(values.exposureOffsetX) !== undefined
      ? { offsetXPx: parseNumber(values.exposureOffsetX) }
      : {}),
    ...(parseNumber(values.exposureOffsetY) !== undefined
      ? { offsetYPx: parseNumber(values.exposureOffsetY) }
      : {}),
  });
  const backgroundLayout = maybeObject({
    ...(parseNumber(values.backgroundScale) !== undefined
      ? { scale: parseNumber(values.backgroundScale) }
      : {}),
    ...(parseNumber(values.backgroundAnchorX) !== undefined
      ? { anchorX: parseNumber(values.backgroundAnchorX) }
      : {}),
    ...(parseNumber(values.backgroundAnchorY) !== undefined
      ? { anchorY: parseNumber(values.backgroundAnchorY) }
      : {}),
    ...(parseNumber(values.backgroundOffsetX) !== undefined
      ? { offsetXPx: parseNumber(values.backgroundOffsetX) }
      : {}),
    ...(parseNumber(values.backgroundOffsetY) !== undefined
      ? { offsetYPx: parseNumber(values.backgroundOffsetY) }
      : {}),
  });

  const explicitScene: Partial<DoubleExposureSceneInput> = {
    ...(values.title ? { title: values.title } : {}),
    ...(values.look ? { look: parseLook(values.look, baseScene?.look ?? 'cinematic') } : {}),
    ...(values.subject || baseScene?.subject
      ? {
          subject: {
            ...(baseScene?.subject ?? {}),
            kind: parseKind(values.subjectKind, baseScene?.subject?.kind ?? 'image'),
            url: values.subject ?? baseScene?.subject?.url ?? '',
            ...(values.subjectPoster || baseScene?.subject?.posterUrl
              ? { posterUrl: values.subjectPoster ?? baseScene?.subject?.posterUrl }
              : {}),
            fit: parseFit(values.subjectFit, baseScene?.subject?.fit ?? 'contain'),
          },
        }
      : {}),
    ...(values.exposure || baseScene?.exposure
      ? {
          exposure: {
            ...(baseScene?.exposure ?? {}),
            kind: parseKind(values.exposureKind, baseScene?.exposure?.kind ?? 'image'),
            url: values.exposure ?? baseScene?.exposure?.url ?? '',
            ...(values.exposurePoster || baseScene?.exposure?.posterUrl
              ? { posterUrl: values.exposurePoster ?? baseScene?.exposure?.posterUrl }
              : {}),
            fit: parseFit(values.exposureFit, baseScene?.exposure?.fit ?? 'cover'),
          },
        }
      : {}),
    ...(values.background || baseScene?.background
      ? {
          background: {
            ...(baseScene?.background ?? {}),
            kind: parseKind(values.backgroundKind, baseScene?.background?.kind ?? 'image'),
            url: values.background ?? baseScene?.background?.url ?? '',
            ...(values.backgroundPoster || baseScene?.background?.posterUrl
              ? { posterUrl: values.backgroundPoster ?? baseScene?.background?.posterUrl }
              : {}),
            fit: parseFit(values.backgroundFit, baseScene?.background?.fit ?? 'cover'),
          },
        }
      : {}),
    atmosphere:
      atmosphereUrls.length > 0
        ? atmosphereUrls.map((url, index) => ({
            kind: parseKind(atmosphereKinds[index] ?? atmosphereKinds[0], 'video'),
            url,
            posterUrl: atmospherePosters[index],
            fit: 'cover' as const,
          }))
        : baseScene?.atmosphere,
    ...(threshold !== undefined || softness !== undefined || featherPx !== undefined
      ? {
          keying: {
            ...(baseScene?.keying ?? {}),
            ...(threshold !== undefined ? { threshold } : {}),
            ...(softness !== undefined ? { softness } : {}),
            ...(featherPx !== undefined ? { featherPx } : {}),
          },
        }
      : {}),
    ...(subjectLayout || exposureLayout || backgroundLayout
      ? {
          layout: {
            ...(baseScene?.layout ?? {}),
            ...(subjectLayout ? { subject: { ...(baseScene?.layout?.subject ?? {}), ...subjectLayout } } : {}),
            ...(exposureLayout ? { exposure: { ...(baseScene?.layout?.exposure ?? {}), ...exposureLayout } } : {}),
            ...(backgroundLayout ? { background: { ...(baseScene?.layout?.background ?? {}), ...backgroundLayout } } : {}),
          },
        }
      : {}),
    overlay: {
      ...(baseScene?.overlay ?? {}),
      ...(values.kicker ? { kicker: values.kicker } : {}),
      ...(values.overlayTitle ? { title: values.overlayTitle } : {}),
      ...(values.body ? { body: values.body } : {}),
      titleEffectId: parseTitleEffect(
        values.titleEffect,
        baseScene?.overlay?.titleEffectId ?? 'soft-blur-in'
      ),
    },
    preview: {
      ...(baseScene?.preview ?? {}),
      motionEnabled: values.static ? false : baseScene?.preview?.motionEnabled ?? true,
      allowEffectToggle: values.toggle || baseScene?.preview?.allowEffectToggle || false,
      effectInitiallyEnabled: values.effectOff
        ? false
        : baseScene?.preview?.effectInitiallyEnabled ?? true,
    },
    aspectRatio,
    ...(durationSec !== undefined ? { durationSec } : {}),
    ...(fps !== undefined ? { fps } : {}),
  };

  if (!selectedSkill && (!explicitScene.subject?.url || !explicitScene.exposure?.url)) {
    console.error('double-exposure generation requires both a subject and an exposure source');
    process.exit(1);
  }

  const scene = selectedSkill
    ? buildDoubleExposureSkillScene(selectedSkill.id, explicitScene)
    : ({
        ...explicitScene,
        subject: explicitScene.subject!,
        exposure: explicitScene.exposure!,
      } satisfies DoubleExposureSceneInput);

  const html = buildHyperframesDoubleExposureComposition(scene);

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, html, 'utf8');

  console.log(`wrote ${outputPath}`);
}

void main();
