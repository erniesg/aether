import type { Metadata, Viewport } from 'next';
import { ThemeProvider } from './design-system/ThemeProvider';
import { ConvexClientProvider } from '@/components/providers/ConvexClientProvider';
import './globals.css';

export const metadata: Metadata = {
  title: 'aether',
  description: 'A canvas-native creative system. Built with Claude Opus 4.7.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

const NO_FLASH = `(() => {
  try {
    const m = localStorage.getItem('aether.theme') || 'system';
    const resolved = m === 'system'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : m;
    document.documentElement.setAttribute('data-theme', resolved);
  } catch (_) {
    document.documentElement.setAttribute('data-theme', 'light');
  }
})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,400;0,600;1,400&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH }} />
      </head>
      <body className="min-h-screen bg-surface-bg text-ink antialiased">
        <ConvexClientProvider>
          <ThemeProvider>{children}</ThemeProvider>
        </ConvexClientProvider>
      </body>
    </html>
  );
}
