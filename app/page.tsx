import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { ThemeToggle } from '@/components/ui/ThemeToggle';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col">
      <header className="flex h-header items-center justify-between border-b border-border-soft bg-surface-panel px-6">
        <div className="font-display text-lg tracking-tight">aether</div>
        <div className="flex items-center gap-2">
          <Chip tone="neutral" size="sm">
            hackathon · 2026-04-21
          </Chip>
          <ThemeToggle />
        </div>
      </header>

      <section className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-16 text-center">
        <div className="max-w-2xl">
          <h1 className="font-display text-3xl tracking-tight text-ink sm:text-display">aether</h1>
          <p className="mt-6 text-base text-ink-muted">
            A canvas-native creative system. Generate and edit assets directly on the canvas; pin
            AI-driven actions as reusable capabilities; fan one hero scene out to linked
            multiformat variants.
          </p>
          <p className="mt-3 font-caption text-ink-dim">built with claude opus 4.7</p>
        </div>

        <Link href="/workspace/demo-ws" className="inline-flex">
          <Button variant="primary" size="lg" trailing={<ArrowRight size={16} strokeWidth={1.75} />}>
            Open demo workspace
          </Button>
        </Link>
      </section>

      <footer className="flex h-header items-center justify-between border-t border-border-soft bg-surface-panel px-6 font-caption text-ink-dim">
        <span>canvas · capability · multiformat</span>
        <span>v0.1.0-hackathon</span>
      </footer>
    </main>
  );
}
