import type { PublicLogtoConfig } from '@/lib/auth/logto-config';
import { VibesAuthProvider } from '@/components/vibes/vibes-auth';
import VibesWorkbench from './VibesWorkbench';

/**
 * /vibes shell entry. Wraps the workbench in the shared Vibes auth context
 * (Logto + stored API key) — no marketing hero, the research shell is the
 * first viewport (AGENTS.md: creator-facing, not a landing page + ops panel).
 */
export default function VibesLanding({
  logtoConfig,
  debug = false,
}: {
  logtoConfig: PublicLogtoConfig | null;
  debug?: boolean;
}) {
  return (
    <VibesAuthProvider logtoConfig={logtoConfig}>
      <VibesWorkbench debug={debug} />
    </VibesAuthProvider>
  );
}
