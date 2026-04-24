import type {
  DoubleExposureLayoutInput,
  DoubleExposureMediaSource,
  DoubleExposureSceneInput,
} from '@/lib/video/doubleExposure';

export type DoubleExposureSkillId = 'echo-still' | 'lumen-video' | 'raw-effect-compare';

export interface DoubleExposureSkillDefinition {
  id: DoubleExposureSkillId;
  name: string;
  summary: string;
  bestFor: string;
  trigger: string;
  defaultOutput: string;
  scene: DoubleExposureSceneInput;
}

function mergeLayout(
  base?: DoubleExposureLayoutInput,
  patch?: DoubleExposureLayoutInput
): DoubleExposureLayoutInput | undefined {
  if (!base && !patch) return undefined;
  return {
    ...(base ?? {}),
    ...(patch ?? {}),
    ...(base?.subject || patch?.subject
      ? { subject: { ...(base?.subject ?? {}), ...(patch?.subject ?? {}) } }
      : {}),
    ...(base?.exposure || patch?.exposure
      ? { exposure: { ...(base?.exposure ?? {}), ...(patch?.exposure ?? {}) } }
      : {}),
    ...(base?.background || patch?.background
      ? { background: { ...(base?.background ?? {}), ...(patch?.background ?? {}) } }
      : {}),
  };
}

function mergeMediaSource(
  base: DoubleExposureMediaSource,
  patch?: Partial<DoubleExposureMediaSource>
): DoubleExposureMediaSource {
  return {
    ...base,
    ...(patch ?? {}),
    kind: patch?.kind ?? base.kind,
    url: patch?.url ?? base.url,
  };
}

const DOUBLE_EXPOSURE_SKILLS: DoubleExposureSkillDefinition[] = [
  {
    id: 'echo-still',
    name: 'Echo Still',
    summary: 'Classic image-backed double exposure with a light paper field and a large portrait crop.',
    bestFor: 'Poster-like intros, key visuals, and still-openers that need a recognisable silhouette.',
    trigger:
      'Blend a portrait with a still city or landscape plate inside the silhouette while keeping the face readable.',
    defaultOutput: './experiments/video/double-exposure-image/index.html',
    scene: {
      id: 'double-exposure-echo-still',
      title: 'Classic Double Exposure',
      look: 'classic',
      subject: {
        kind: 'image',
        url: '/experiments/video/double-exposure-assets/subject-portrait.png',
        fit: 'contain',
      },
      exposure: {
        kind: 'image',
        url: '/experiments/video/double-exposure-assets/city-static.png',
        fit: 'cover',
      },
      background: {
        kind: 'image',
        url: '/experiments/video/double-exposure-assets/city-static.png',
        fit: 'cover',
      },
      layout: {
        subject: {
          scale: 2.28,
          anchorX: 0.72,
          anchorY: 0.1,
        },
        exposure: {
          scale: 1.08,
          anchorX: 0.5,
          anchorY: 0.12,
        },
        background: {
          scale: 1.02,
          anchorY: 0.08,
        },
      },
      overlay: {
        kicker: 'DOUBLE EXPOSURE STUDY',
        title: 'Echo',
        body: 'The city sits inside the portrait instead of floating over it.',
      },
    },
  },
  {
    id: 'lumen-video',
    name: 'Lumen Video',
    summary: 'Video-backed double exposure that uses a restrained moving light field inside the silhouette.',
    bestFor: 'Cinematic intros where the portrait should stay calm while the interior carries motion.',
    trigger:
      'Fill the portrait silhouette with a moving light field and keep the shell soft, quiet, and legible.',
    defaultOutput: './experiments/video/double-exposure-video/index.html',
    scene: {
      id: 'double-exposure-lumen-video',
      title: 'Video Double Exposure',
      look: 'classic',
      subject: {
        kind: 'image',
        url: '/experiments/video/double-exposure-assets/subject-portrait.png',
        fit: 'contain',
      },
      exposure: {
        kind: 'video',
        url: '/experiments/video/source-lab/cinematic-intro.mp4',
        fit: 'cover',
      },
      background: {
        kind: 'image',
        url: '/experiments/video/double-exposure-assets/city-static.png',
        fit: 'cover',
      },
      layout: {
        subject: {
          scale: 2.28,
          anchorX: 0.72,
          anchorY: 0.1,
        },
        exposure: {
          scale: 1.02,
          anchorX: 0.48,
          anchorY: 0.5,
        },
        background: {
          scale: 1.02,
          anchorY: 0.08,
        },
      },
      overlay: {
        kicker: 'DOUBLE EXPOSURE STUDY',
        title: 'Lumen',
        body: 'A moving light field keeps the face legible while the silhouette carries motion.',
      },
    },
  },
  {
    id: 'raw-effect-compare',
    name: 'Raw / Effect Compare',
    summary: 'A compare view that lets the creator toggle between the untreated portrait and the blend.',
    bestFor: 'Review sessions, tuning thresholds, and proving that the effect is adding value.',
    trigger:
      'Show the untreated portrait first, then let the creator toggle the double exposure on and off.',
    defaultOutput: './experiments/video/double-exposure-compare/index.html',
    scene: {
      id: 'double-exposure-raw-effect-compare',
      title: 'Compare Double Exposure',
      look: 'classic',
      subject: {
        kind: 'image',
        url: '/experiments/video/double-exposure-assets/subject-portrait.png',
        fit: 'contain',
      },
      exposure: {
        kind: 'image',
        url: '/experiments/video/double-exposure-assets/city-static.png',
        fit: 'cover',
      },
      background: {
        kind: 'image',
        url: '/experiments/video/double-exposure-assets/city-static.png',
        fit: 'cover',
      },
      layout: {
        subject: {
          scale: 2.28,
          anchorX: 0.72,
          anchorY: 0.1,
        },
        exposure: {
          scale: 1.08,
          anchorX: 0.5,
          anchorY: 0.12,
        },
        background: {
          scale: 1.02,
          anchorY: 0.08,
        },
      },
      overlay: {
        kicker: 'DOUBLE EXPOSURE STUDY',
        title: 'Raw / Effect',
        body: 'Use the chip or press D to compare the untreated portrait against the blend.',
      },
      preview: {
        allowEffectToggle: true,
        effectInitiallyEnabled: false,
      },
    },
  },
];

export function listDoubleExposureSkills(): DoubleExposureSkillDefinition[] {
  return DOUBLE_EXPOSURE_SKILLS.map((skill) => ({
    ...skill,
    scene: buildDoubleExposureSkillScene(skill.id),
  }));
}

export function getDoubleExposureSkill(
  id: string
): DoubleExposureSkillDefinition | undefined {
  return DOUBLE_EXPOSURE_SKILLS.find((skill) => skill.id === id);
}

export function buildDoubleExposureSkillScene(
  id: DoubleExposureSkillId,
  overrides: Partial<DoubleExposureSceneInput> = {}
): DoubleExposureSceneInput {
  const base = getDoubleExposureSkill(id);
  if (!base) {
    throw new Error(`unknown double-exposure skill: ${id}`);
  }

  return {
    ...base.scene,
    ...overrides,
    subject: mergeMediaSource(base.scene.subject, overrides.subject),
    exposure: mergeMediaSource(base.scene.exposure, overrides.exposure),
    ...(base.scene.background || overrides.background
      ? {
          background: mergeMediaSource(
            base.scene.background ?? base.scene.exposure,
            overrides.background
          ),
        }
      : {}),
    atmosphere: overrides.atmosphere ?? base.scene.atmosphere,
    keying: {
      ...(base.scene.keying ?? {}),
      ...(overrides.keying ?? {}),
    },
    layout: mergeLayout(base.scene.layout, overrides.layout),
    grade: {
      ...(base.scene.grade ?? {}),
      ...(overrides.grade ?? {}),
    },
    animation: {
      ...(base.scene.animation ?? {}),
      ...(overrides.animation ?? {}),
    },
    overlay: {
      ...(base.scene.overlay ?? {}),
      ...(overrides.overlay ?? {}),
    },
    preview: {
      ...(base.scene.preview ?? {}),
      ...(overrides.preview ?? {}),
    },
  };
}
