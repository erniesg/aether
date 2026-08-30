import { getPublicLogtoConfig } from '@/lib/auth/logto-config';
import { VibesAuthProvider } from '@/components/vibes/vibes-auth';
import EventRecapClient from './EventRecapClient';

export default async function EventRecapPage({
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{ debug?: string }>;
}) {
  const [{ eventId }, query] = await Promise.all([params, searchParams]);
  return (
    <VibesAuthProvider logtoConfig={getPublicLogtoConfig()}>
      <EventRecapClient eventId={eventId} debug={query.debug === '1'} />
    </VibesAuthProvider>
  );
}
