import { describe, expect, it } from 'vitest';
import {
  buildEmbedHeaders,
  parseTheme,
  buildEmbedSnippet,
  type EmbedTheme,
} from './embed-headers';

describe('embed headers (slice 7)', () => {
  describe('buildEmbedHeaders', () => {
    it('emits frame-ancestors CSP allowing the configured embed hosts', () => {
      const headers = buildEmbedHeaders({
        contentType: 'text/html; charset=utf-8',
        frameAncestors: ['https://ai.engineer', 'https://www.ai.engineer', 'https://*.berlayar.ai'],
      });
      const csp = headers.get('Content-Security-Policy') ?? '';
      expect(csp).toMatch(/frame-ancestors/);
      expect(csp).toContain("'self'");
      expect(csp).toContain('https://ai.engineer');
      expect(csp).toContain('https://www.ai.engineer');
      expect(csp).toContain('https://*.berlayar.ai');
    });

    it('emits CORS headers for cross-origin data fetches when requested', () => {
      const headers = buildEmbedHeaders({
        contentType: 'application/json; charset=utf-8',
        cors: true,
      });
      expect(headers.get('Access-Control-Allow-Origin')).toBe('*');
      expect(headers.get('Access-Control-Allow-Methods')).toContain('GET');
      expect(headers.get('Vary')).toBe('Origin');
    });

    it('does not emit CORS by default', () => {
      const headers = buildEmbedHeaders({ contentType: 'text/html' });
      expect(headers.get('Access-Control-Allow-Origin')).toBeNull();
    });

    it('sets cache-control to the supplied max-age', () => {
      const headers = buildEmbedHeaders({ contentType: 'text/html', maxAge: 120 });
      expect(headers.get('Cache-Control')).toBe('public, max-age=120');
    });

    it('omits frame-ancestors when no embed hosts are configured', () => {
      const headers = buildEmbedHeaders({ contentType: 'text/html' });
      expect(headers.get('Content-Security-Policy')).toBeNull();
    });
  });

  describe('parseTheme', () => {
    it('honors the ?theme=dark query param', () => {
      const url = new URL('https://example.com/vibes/aie2026?theme=dark');
      expect(parseTheme(url, 'light')).toBe('dark');
    });

    it('honors the ?theme=light query param', () => {
      const url = new URL('https://example.com/vibes/aie2026?theme=light');
      expect(parseTheme(url, 'dark')).toBe('light');
    });

    it('falls back to the default when no theme is set', () => {
      const url = new URL('https://example.com/vibes/aie2026');
      expect(parseTheme(url, 'dark')).toBe('dark');
      expect(parseTheme(url, 'light')).toBe('light');
    });

    it('ignores unknown theme values and uses the default', () => {
      const url = new URL('https://example.com/vibes/aie2026?theme=neon');
      expect(parseTheme(url, 'light')).toBe('light');
    });
  });

  describe('buildEmbedSnippet', () => {
    it('produces a copy-pasteable iframe snippet for the recap URL', () => {
      const snippet = buildEmbedSnippet({
        url: 'https://aether.berlayar.ai/vibes/aie2026?theme=dark',
        height: 900,
        title: 'AI Engineer Singapore 2026 — Recap',
      });
      expect(snippet).toContain('<iframe');
      expect(snippet).toContain('src="https://aether.berlayar.ai/vibes/aie2026?theme=dark"');
      expect(snippet).toContain('height="900"');
      expect(snippet).toContain('title="AI Engineer Singapore 2026 — Recap"');
      expect(snippet).toContain('loading="lazy"');
      expect(snippet).toContain('allow="fullscreen"');
      expect(snippet).toContain('sandbox="allow-scripts allow-same-origin allow-popups allow-top-navigation allow-forms"');
    });

    it('defaults to height 900 and a generic title when not supplied', () => {
      const snippet = buildEmbedSnippet({ url: 'https://example.com/embed' });
      expect(snippet).toContain('height="900"');
      expect(snippet).toContain('title="Event recap"');
    });

    it('escapes HTML-unsafe characters in the title', () => {
      const snippet = buildEmbedSnippet({
        url: 'https://example.com',
        title: 'Recap <script>alert(1)</script>',
      });
      expect(snippet).not.toContain('<script>');
      expect(snippet).toContain('&lt;script&gt;');
    });

    it('can include a background color to avoid iframe paint flash', () => {
      const snippet = buildEmbedSnippet({
        url: 'https://aether.berlayar.ai/vibes/aie2026?theme=dark',
        background: '#070808',
      });
      expect(snippet).toContain('background:#070808');
    });

    it('can omit sandboxing for embedders that explicitly disallow it', () => {
      const snippet = buildEmbedSnippet({
        url: 'https://example.com/embed',
        sandbox: false,
      });
      expect(snippet).not.toContain('sandbox=');
    });
  });
});

// Type-level assertion: EmbedTheme is the canonical literal type
const _theme: EmbedTheme = 'dark';
const _theme2: EmbedTheme = 'light';
void _theme;
void _theme2;
