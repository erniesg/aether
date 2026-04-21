import { WorkspaceShell } from '@/components/workspace/WorkspaceShell';

type Params = { wsId: string };

export default async function WorkspacePage({ params }: { params: Promise<Params> }) {
  const { wsId } = await params;
  return <WorkspaceShell wsId={wsId} />;
}
