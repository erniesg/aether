type Params = { wsId: string };

export default async function WorkspacePage({ params }: { params: Promise<Params> }) {
  const { wsId } = await params;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex h-12 items-center justify-between border-b border-border-soft bg-panel px-4">
        <div className="flex items-center gap-3 font-mono text-xs text-ink-dim">
          <span className="font-serif text-base tracking-tight text-ink">aether</span>
          <span className="text-ink-faint">/</span>
          <span>workspace · {wsId}</span>
        </div>
        <div className="flex items-center gap-2 font-mono text-[11px] text-ink-dim">
          <span className="rounded-full border border-border-soft px-2 py-0.5">scaffold</span>
        </div>
      </header>

      <div className="flex flex-1">
        <aside
          aria-label="left rail — inputs"
          className="w-12 shrink-0 border-r border-border-soft bg-panel-muted"
          data-taxonomy="input"
        >
          {/* Phase 3: lifecycle-ordered icon column lands here */}
        </aside>

        <section
          aria-label="canvas substrate"
          className="relative flex-1 bg-white"
          data-taxonomy="tool"
        >
          <div className="absolute inset-0 flex items-center justify-center text-ink-faint">
            <p className="font-mono text-xs">canvas · scaffold · waiting for Phase 3</p>
          </div>
          {/* Phase 3: tldraw canvas + floating toolbar land here */}
        </section>

        <aside
          aria-label="right rail — outputs + metadata"
          className="w-12 shrink-0 border-l border-border-soft bg-panel-muted"
          data-taxonomy="output"
        >
          {/* Phase 3: focus artifact, versions, observations, sync land here */}
        </aside>
      </div>

      <footer
        aria-label="prompt composer"
        className="flex h-14 items-center gap-2 border-t border-border-soft bg-panel px-4"
        data-taxonomy="tool"
      >
        <span className="rounded-full border border-border-soft px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-ink-dim">
          composer · scaffold
        </span>
      </footer>
    </div>
  );
}
