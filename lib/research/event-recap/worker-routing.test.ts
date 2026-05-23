import { describe, expect, it } from 'vitest';
import { parseRecapPath, r2DataKey, r2MediaKeyPrefix, isValidEventId } from './worker-routing';

describe('worker routing (slice 9)', () => {
  describe('parseRecapPath', () => {
    it('parses the root recap path', () => {
      expect(parseRecapPath('/vibes/aie-2026')).toEqual({ eventId: 'aie-2026', route: 'root' });
      expect(parseRecapPath('/vibes/aie-2026/')).toEqual({ eventId: 'aie-2026', route: 'root' });
    });

    it('parses the data path', () => {
      expect(parseRecapPath('/vibes/aie-2026/data')).toEqual({ eventId: 'aie-2026', route: 'data' });
    });

    it('parses the media path', () => {
      expect(parseRecapPath('/vibes/aie-2026/media')).toEqual({ eventId: 'aie-2026', route: 'media' });
    });

    it('parses the embed-snippet path', () => {
      expect(parseRecapPath('/vibes/aie-2026/embed-snippet')).toEqual({
        eventId: 'aie-2026',
        route: 'embed-snippet',
      });
    });

    it('returns null for paths outside the vibes namespace', () => {
      expect(parseRecapPath('/api/healthz')).toBeNull();
      expect(parseRecapPath('/vibes')).toBeNull();
      expect(parseRecapPath('/')).toBeNull();
    });

    it('returns null for unknown routes under /vibes/<eventId>/', () => {
      expect(parseRecapPath('/vibes/aie-2026/themes')).toBeNull();
      expect(parseRecapPath('/vibes/aie-2026/random-path')).toBeNull();
    });

    it('rejects invalid eventIds (path traversal / unsafe characters)', () => {
      expect(parseRecapPath('/vibes/../etc/passwd')).toBeNull();
      expect(parseRecapPath('/vibes/foo/bar')).toBeNull();
      expect(parseRecapPath('/vibes/aie 2026')).toBeNull();
    });

    it('accepts kebab-case and alphanumeric eventIds', () => {
      expect(parseRecapPath('/vibes/aie-2027')?.eventId).toBe('aie-2027');
      expect(parseRecapPath('/vibes/techcrunch-disrupt-2026')?.eventId).toBe('techcrunch-disrupt-2026');
      expect(parseRecapPath('/vibes/aie2026')?.eventId).toBe('aie2026');
    });
  });

  describe('isValidEventId', () => {
    it('accepts safe kebab-case and alphanumeric ids', () => {
      expect(isValidEventId('aie-2026')).toBe(true);
      expect(isValidEventId('event_123')).toBe(true);
      expect(isValidEventId('a')).toBe(true);
    });

    it('rejects paths, spaces, dots, slashes, and overly long ids', () => {
      expect(isValidEventId('')).toBe(false);
      expect(isValidEventId('foo/bar')).toBe(false);
      expect(isValidEventId('foo bar')).toBe(false);
      expect(isValidEventId('..')).toBe(false);
      expect(isValidEventId('foo.bar')).toBe(false);
      expect(isValidEventId('x'.repeat(200))).toBe(false);
    });
  });

  describe('R2 key helpers', () => {
    it('builds the R2 data key for an event', () => {
      expect(r2DataKey('aie-2026')).toBe('event-recap-aie-2026/public.json');
      expect(r2DataKey('techcrunch-disrupt-2026')).toBe('event-recap-techcrunch-disrupt-2026/public.json');
    });

    it('builds the R2 media prefix for an event', () => {
      expect(r2MediaKeyPrefix('aie-2026')).toBe('event-recap-aie-2026/media/');
    });
  });
});
