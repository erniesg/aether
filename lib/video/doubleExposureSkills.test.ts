import { describe, expect, it } from 'vitest';
import {
  buildDoubleExposureSkillScene,
  getDoubleExposureSkill,
  listDoubleExposureSkills,
} from '@/lib/video/doubleExposureSkills';

describe('double-exposure skills', () => {
  it('lists the built-in creator-facing skills', () => {
    const skills = listDoubleExposureSkills();

    expect(skills.map((skill) => skill.id)).toEqual([
      'echo-still',
      'lumen-video',
      'raw-effect-compare',
    ]);
    expect(skills[0]?.defaultOutput).toContain('double-exposure-image/index.html');
  });

  it('builds the compare skill with its review toggle enabled', () => {
    const scene = buildDoubleExposureSkillScene('raw-effect-compare');

    expect(scene.look).toBe('classic');
    expect(scene.preview?.allowEffectToggle).toBe(true);
    expect(scene.preview?.effectInitiallyEnabled).toBe(false);
    expect(scene.overlay?.title).toBe('Raw / Effect');
  });

  it('allows explicit overrides on top of a base skill', () => {
    const scene = buildDoubleExposureSkillScene('lumen-video', {
      overlay: { title: 'Override' },
      subject: { kind: 'image', url: './custom-subject.png' },
    });

    expect(scene.overlay?.title).toBe('Override');
    expect(scene.subject.url).toBe('./custom-subject.png');
    expect(scene.exposure.kind).toBe('video');
    expect(getDoubleExposureSkill('lumen-video')?.name).toBe('Lumen Video');
  });
});
