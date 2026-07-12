import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ThemeToggle } from '@/components/ui/ThemeToggle';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col">
      <header className="flex h-header items-center justify-between border-b border-border-soft bg-surface-panel px-6">
        <div className="font-display text-lg tracking-tight">aether</div>
        <ThemeToggle />
      </header>

      <section className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-16 text-center">
        <div className="max-w-2xl">
          <h1 className="font-display text-3xl tracking-tight text-ink sm:text-display">
            Make on the canvas.
          </h1>
          <p className="mt-6 text-base text-ink-muted">
            Gather references, compose an input set, generate and edit on the canvas, then fan one
            key visual out to linked format variants.
          </p>
          <p className="mt-3 font-caption text-ink-dim">
            references · generation · variants · export
          </p>
        </div>

        <Link href="/workspace/demo-ws" className="inline-flex">
          <Button variant="primary" size="lg" trailing={<ArrowRight size={16} strokeWidth={1.75} />}>
            Open canvas
          </Button>
        </Link>
      </section>

      <footer className="flex h-header items-center justify-between border-t border-border-soft bg-surface-panel px-6 font-caption text-ink-dim">
        <span>canvas · capability · multiformat</span>
        <span>creator-first</span>
      </footer>
    </main>
  );
}
