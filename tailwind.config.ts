import type { Config } from 'tailwindcss';

/**
 * Every color, font, radius, and shadow in the app maps back to a CSS variable
 * defined in app/design-system/{tokens,themes}.css. That means swapping a
 * theme changes the cascade — not a single utility class anywhere in the app
 * needs to change to support a new skin. Keep that contract.
 */
export default {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: ['selector', '[data-theme="dark"], [data-theme="synth"]'],
  theme: {
    extend: {
      colors: {
        surface: {
          bg: 'rgb(var(--surface-bg) / <alpha-value>)',
          'bg-muted': 'rgb(var(--surface-bg-muted) / <alpha-value>)',
          panel: 'rgb(var(--surface-panel) / <alpha-value>)',
          'panel-muted': 'rgb(var(--surface-panel-muted) / <alpha-value>)',
          canvas: 'rgb(var(--surface-canvas) / <alpha-value>)',
          overlay: 'rgb(var(--surface-overlay) / <alpha-value>)',
        },
        ink: {
          DEFAULT: 'rgb(var(--ink) / <alpha-value>)',
          muted: 'rgb(var(--ink-muted) / <alpha-value>)',
          dim: 'rgb(var(--ink-dim) / <alpha-value>)',
          faint: 'rgb(var(--ink-faint) / <alpha-value>)',
          'on-accent': 'rgb(var(--ink-on-accent) / <alpha-value>)',
        },
        border: {
          DEFAULT: 'rgb(var(--border) / <alpha-value>)',
          soft: 'rgb(var(--border-soft) / <alpha-value>)',
          strong: 'rgb(var(--border-strong) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'rgb(var(--accent) / <alpha-value>)',
          strong: 'rgb(var(--accent-strong) / <alpha-value>)',
          secondary: 'rgb(var(--accent-secondary) / <alpha-value>)',
          tertiary: 'rgb(var(--accent-tertiary) / <alpha-value>)',
          highlight: 'rgb(var(--accent-highlight) / <alpha-value>)',
        },
        signal: {
          ok: 'rgb(var(--signal-ok) / <alpha-value>)',
          warn: 'rgb(var(--signal-warn) / <alpha-value>)',
          error: 'rgb(var(--signal-error) / <alpha-value>)',
          info: 'rgb(var(--signal-info) / <alpha-value>)',
        },
      },
      fontFamily: {
        sans: 'var(--font-sans)',
        serif: 'var(--font-serif)',
        mono: 'var(--font-mono)',
      },
      fontSize: {
        '2xs': ['var(--text-2xs)', 'var(--leading-snug)'],
        xs: ['var(--text-xs)', 'var(--leading-snug)'],
        sm: ['var(--text-sm)', 'var(--leading-normal)'],
        base: ['var(--text-base)', 'var(--leading-normal)'],
        lg: ['var(--text-lg)', 'var(--leading-snug)'],
        xl: ['var(--text-xl)', 'var(--leading-snug)'],
        '2xl': ['var(--text-2xl)', 'var(--leading-tight)'],
        '3xl': ['var(--text-3xl)', 'var(--leading-tight)'],
        display: ['var(--text-display)', 'var(--leading-tight)'],
      },
      letterSpacing: {
        tight: 'var(--tracking-tight)',
        default: 'var(--tracking-default)',
        wide: 'var(--tracking-wide)',
      },
      borderRadius: {
        xs: 'var(--radius-xs)',
        sm: 'var(--radius-sm)',
        DEFAULT: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
        pill: 'var(--radius-pill)',
      },
      boxShadow: {
        xs: 'var(--shadow-xs)',
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
        focus: 'var(--shadow-focus)',
      },
      spacing: {
        'rail-compact': 'var(--space-rail-compact)',
        'rail-expanded': 'var(--space-rail-expanded)',
        header: 'var(--space-header)',
        composer: 'var(--space-composer)',
      },
      transitionTimingFunction: {
        quick: 'var(--ease-quick)',
        out: 'var(--ease-out)',
      },
      transitionDuration: {
        fast: 'var(--dur-fast)',
        base: 'var(--dur-base)',
        slow: 'var(--dur-slow)',
      },
    },
  },
  plugins: [],
} satisfies Config;
