import EventRecapClient from './EventRecapClient';

export default async function EventRecapPage({
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{ debug?: string }>;
}) {
  const [{ eventId }, query] = await Promise.all([params, searchParams]);
  return <EventRecapClient eventId={eventId} debug={query.debug === '1'} />;
}
