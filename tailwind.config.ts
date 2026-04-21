import type { Config } from 'tailwindcss';

export default {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui'],
        serif: ['Fraunces', 'ui-serif', 'Georgia'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular'],
      },
      colors: {
        bg: {
          DEFAULT: '#fbfaf7',
          muted: '#f3f1ea',
          panel: '#ffffff',
          'panel-muted': '#f7f5ef',
        },
        border: {
          DEFAULT: '#e4e0d3',
          soft: '#edeae0',
        },
        ink: {
          DEFAULT: '#1a1816',
          2: '#4a4540',
          dim: '#807a6e',
          faint: '#b0a99a',
        },
        accent: {
          terra: '#d87040',
          'deep-blue': '#3c4a5c',
          sage: '#7c9885',
          highlight: '#f4e4c8',
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
