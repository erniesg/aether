import { randomInt } from 'node:crypto';

const CONSONANTS = 'bcdfghjkmnprstvwyz';
const VOWELS = 'aeiou';
const FRIENDLY_ALPHANUMERIC = 'abcdefghjkmnpqrstuvwxyz23456789';
const BLOCKED_PARTS = [
  'ass',
  'cum',
  'dik',
  'fuc',
  'fuk',
  'kok',
  'sex',
  'suk',
];

export type ShareCodeMode = 'pronounceable-4' | 'pronounceable-6' | 'friendly-alphanumeric';

export function normalizeShareCode(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidShareCode(value: string): boolean {
  const code = normalizeShareCode(value);
  return /^[a-z0-9]{4,16}$/.test(code);
}

export function generateShareCode(mode: ShareCodeMode = 'pronounceable-4'): string {
  if (mode === 'pronounceable-4') return generateReadableCode(2);
  if (mode === 'pronounceable-6') return generateReadableCode(3);
  return generateFriendlyAlphanumeric(8);
}

function generateReadableCode(syllables: number): string {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    let code = '';
    for (let index = 0; index < syllables; index += 1) {
      code += pick(CONSONANTS);
      code += pick(VOWELS);
    }
    if (!hasBlockedPart(code)) return code;
  }
  return generateFriendlyAlphanumeric(Math.max(6, syllables * 2));
}

function generateFriendlyAlphanumeric(length: number): string {
  let code = '';
  for (let index = 0; index < length; index += 1) code += pick(FRIENDLY_ALPHANUMERIC);
  return code;
}

function pick(alphabet: string): string {
  return alphabet[randomInt(0, alphabet.length)]!;
}

function hasBlockedPart(code: string): boolean {
  return BLOCKED_PARTS.some((part) => code.includes(part));
}
