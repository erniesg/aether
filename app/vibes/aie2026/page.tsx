import EventRecapClient from '@/app/events/[eventId]/EventRecapClient';

export default async function Aie2026VibesPage({
  searchParams,
}: {
  searchParams: Promise<{ debug?: string }>;
}) {
  const query = await searchParams;
  return <EventRecapClient eventId="ai-engineer-singapore" debug={query.debug === '1'} />;
}
