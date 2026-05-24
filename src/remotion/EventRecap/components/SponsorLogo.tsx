import React from 'react';
import { theme } from '../theme';
import type { RecapSponsor } from '../data';

interface Props {
  sponsor: RecapSponsor;
  size?: 'sm' | 'md' | 'lg';
}

/**
 * Sponsor mark + wordmark. Brands with real SVG marks (OpenAI, Cursor,
 * Vercel, Cloudflare, Stripe, Google, Cerebras) get inline geometry;
 * the long tail falls back to a colored monogram square.
 */
export const SponsorLogo: React.FC<Props> = ({ sponsor, size = 'md' }) => {
  const wordSize = size === 'lg' ? 30 : size === 'sm' ? 16 : 22;
  const markSize = size === 'lg' ? 48 : size === 'sm' ? 24 : 36;
  const mark = renderMark(sponsor, markSize);
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 12,
        fontFamily: theme.sans,
        color: '#fff',
      }}
    >
      {mark}
      <span style={{ fontWeight: 600, fontSize: wordSize, letterSpacing: '-0.015em', whiteSpace: 'nowrap' }}>
        {sponsor.brand}
      </span>
    </span>
  );
};

function renderMark(sponsor: RecapSponsor, sizePx: number): React.ReactNode {
  const common = { width: sizePx, height: sizePx };
  switch (sponsor.brand.toLowerCase()) {
    case 'openai':
      return (
        <svg viewBox="0 0 24 24" style={{ ...common, fill: '#fff' }}>
          <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872z" />
        </svg>
      );
    case 'cursor':
      return (
        <svg viewBox="0 0 24 24" style={{ ...common, fill: '#fff' }}>
          <path d="M11.925 24l10.425-6-10.425-6L1.5 18l10.425 6z" />
          <path opacity={0.5} d="M22.35 18V6L11.925 0v12l10.425 6z" />
          <path opacity={0.8} d="M11.925 0L1.5 6v12l10.425-6V0z" />
        </svg>
      );
    case 'vercel':
      return (
        <svg viewBox="0 0 24 24" style={{ ...common, fill: '#fff' }}>
          <path d="M24 22.525H0l12-21.05 12 21.05z" />
        </svg>
      );
    case 'cloudflare':
      return (
        <svg viewBox="0 0 24 24" style={{ ...common, fill: '#f48120' }}>
          <path d="M16.5 16.5h-9c-1.4 0-2.5-1.1-2.5-2.5s1.1-2.5 2.5-2.5h.1C7.4 9.1 9.5 7 12 7c2.3 0 4.3 1.7 4.7 4h.3c1.4 0 2.5 1.1 2.5 2.5s-1.1 2.5-2.5 2.5z" />
        </svg>
      );
    case 'stripe':
      return (
        <svg viewBox="0 0 24 24" style={{ ...common, fill: '#635bff' }}>
          <path d="M13.479 9.883c-1.626-.604-2.512-1.067-2.512-1.803 0-.622.514-.977 1.426-.977 1.67 0 3.385.643 4.561 1.216l.679-4.197C16.696 3.733 14.829 3.18 12.503 3.18c-1.595 0-2.925.418-3.873 1.198-.99.82-1.499 2.001-1.499 3.43 0 2.59 1.582 3.703 4.157 4.65 1.66.602 2.219 1.03 2.219 1.685 0 .635-.542.999-1.526.999-1.221 0-3.236-.602-4.557-1.376l-.687 4.248c1.133.642 3.231 1.302 5.405 1.302 1.688 0 3.097-.4 4.047-1.16 1.061-.844 1.611-2.088 1.611-3.572 0-2.652-1.612-3.751-4.221-4.701h.001z" />
        </svg>
      );
    case 'google deepmind':
      return (
        <svg viewBox="0 0 24 24" style={{ ...common, fill: '#1a73e8' }}>
          <path d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z" />
        </svg>
      );
    case 'cerebras':
      return (
        <svg viewBox="0 0 24 24" style={{ ...common, fill: '#ff6b00', stroke: '#ff6b00' }}>
          <circle cx="12" cy="12" r="3.5" fill="none" strokeWidth={2} />
          <circle cx="5" cy="5" r="1.5" />
          <circle cx="19" cy="5" r="1.5" />
          <circle cx="5" cy="19" r="1.5" />
          <circle cx="19" cy="19" r="1.5" />
        </svg>
      );
    default: {
      const color = sponsor.color || '#444';
      return (
        <div
          style={{
            width: sizePx,
            height: sizePx,
            borderRadius: 6,
            background: color,
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: theme.serif,
            fontSize: sizePx * 0.55,
          }}
        >
          {sponsor.monogram || sponsor.brand.charAt(0)}
        </div>
      );
    }
  }
}
