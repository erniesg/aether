export type VisualStyle = 'scrapbook' | 'newsprint' | 'kirigami';

export type StyleTheme = {
  background: string;
  backgroundAlt: string;
  ink: string;
  paper: string;
  accent: string;
  accent2: string;
  quiet: string;
  headline: string;
  body: string;
  mono: string;
  shadow: string;
};

export const THEMES: Record<VisualStyle, StyleTheme> = {
  scrapbook: {
    background: '#bda889',
    backgroundAlt: '#89725a',
    ink: '#18211f',
    paper: '#f2e7d2',
    accent: '#ee4d37',
    accent2: '#1aa89c',
    quiet: '#63594d',
    headline: 'Arial Black, Impact, sans-serif',
    body: 'Arial, Helvetica, sans-serif',
    mono: '"Courier New", Courier, monospace',
    shadow: 'rgba(39, 26, 17, 0.34)',
  },
  newsprint: {
    background: '#e9dfcb',
    backgroundAlt: '#cfc3ad',
    ink: '#11110f',
    paper: '#f5eddd',
    accent: '#c92e2a',
    accent2: '#147b7f',
    quiet: '#58544c',
    headline: 'Georgia, "Times New Roman", serif',
    body: 'Georgia, "Times New Roman", serif',
    mono: '"Courier New", Courier, monospace',
    shadow: 'rgba(10, 10, 8, 0.26)',
  },
  kirigami: {
    background: '#123a3c',
    backgroundAlt: '#0b292b',
    ink: '#172728',
    paper: '#f0e5cf',
    accent: '#f15a3d',
    accent2: '#f0b845',
    quiet: '#8c8171',
    headline: 'Arial Black, Impact, sans-serif',
    body: 'Arial, Helvetica, sans-serif',
    mono: '"Courier New", Courier, monospace',
    shadow: 'rgba(0, 13, 14, 0.48)',
  },
};
