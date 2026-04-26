import { WorkspaceShell } from '@/components/workspace/WorkspaceShell';
import { DemoWrapper } from './DemoWrapper';
import { DemoBadge } from './DemoBadge';

type Params = { wsId: string };

export default async function WorkspacePage({ params }: { params: Promise<Params> }) {
  const { wsId } = await params;
  return (
    <DemoWrapper>
      <WorkspaceShell wsId={wsId} />
      <DemoBadge />
    </DemoWrapper>
  );
}
