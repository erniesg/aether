import { Chip } from '@/components/ui/Chip';
import { Surface } from '@/components/ui/Surface';
import { ThemeToggle } from '@/components/ui/ThemeToggle';

type Params = { wsId: string };

export default async function WorkspacePage({ params }: { params: Promise<Params> }) {
  const { wsId } = await params;

  return (
    <div className="flex min-h-screen flex-col bg-surface-bg">
      {/* header — navigation only */}
      <Surface
        as="header"
        tone="panel"
        taxonomy="navigation"
        border="soft"
        className="flex h-header items-center justify-between px-4"
      >
        <div className="flex items-center gap-3">
          <span className="font-display text-base tracking-tight">aether</span>
          <span className="text-ink-faint">/</span>
          <span className="font-caption text-ink-dim">workspace · {wsId}</span>
        </div>
        <div className="flex items-center gap-2">
          <Chip tone="neutral" size="sm">
            scaffold
          </Chip>
          <ThemeToggle />
        </div>
      </Surface>

      <div className="flex flex-1">
        {/* left rail — inputs only */}
        <Surface
          as="aside"
          tone="panel-muted"
          taxonomy="input"
          border="soft"
          className="w-rail-compact shrink-0 border-t-0 border-b-0 border-l-0"
          aria-label="inputs"
        >
          {/* Phase 3 (proper): lifecycle-ordered icon column goes here */}
        </Surface>

        {/* canvas — tool/substrate */}
        <Surface
          as="section"
          tone="canvas"
          taxonomy="tool"
          className="relative flex-1"
          aria-label="canvas"
        >
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="font-caption text-ink-faint">
              canvas · scaffold · waiting for Phase 3
            </span>
          </div>
        </Surface>

        {/* right rail — outputs + metadata */}
        <Surface
          as="aside"
          tone="panel-muted"
          taxonomy="output"
          border="soft"
          className="w-rail-compact shrink-0 border-t-0 border-b-0 border-r-0"
          aria-label="outputs"
        >
          {/* Phase 3 (proper): focus artifact, versions, observations, sync */}
        </Surface>
      </div>

      {/* composer — tool (agent entrypoint) */}
      <Surface
        as="footer"
        tone="panel"
        taxonomy="tool"
        border="soft"
        className="flex h-composer items-center gap-2 px-4"
        aria-label="prompt composer"
      >
        <Chip tone="neutral" size="sm">
          composer · scaffold
        </Chip>
      </Surface>
    </div>
  );
}
