/**
 * /workspace landing — `/workspace` (no wsId) used to 404 because the only
 * route defined was the dynamic `/workspace/[wsId]`. Now we redirect to a
 * default demo workspace so links shared without an id still land somewhere
 * useful.
 *
 * Override via NEXT_PUBLIC_DEFAULT_WORKSPACE_ID (set per-deployment).
 * Default for the hackathon is `demo-ws` to match `app/page.tsx`'s CTA.
 */

import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function WorkspaceIndex() {
  const defaultWs =
    process.env.NEXT_PUBLIC_DEFAULT_WORKSPACE_ID ?? 'demo-ws';
  redirect(`/workspace/${defaultWs}`);
}
