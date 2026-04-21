import Link from 'next/link';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6">
      <div className="max-w-xl text-center">
        <h1 className="font-serif text-5xl tracking-tight">aether</h1>
        <p className="mt-4 text-ink-2">
          A canvas-native creative system. Generate and edit assets directly on the canvas; pin
          AI-driven actions as reusable capabilities; fan one hero scene out to linked multiformat
          variants.
        </p>
        <p className="mt-2 font-mono text-xs text-ink-dim">
          built with claude opus 4.7 · hackathon 2026-04-21
        </p>
      </div>
      <Link
        href="/workspace/demo-ws"
        className="rounded border border-border bg-panel px-4 py-2 text-sm font-medium text-ink hover:border-accent-terra hover:text-accent-terra"
      >
        Open demo workspace →
      </Link>
    </main>
  );
}
