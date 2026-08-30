import { getPublicLogtoConfig } from '@/lib/auth/logto-config';
import VibesLanding from './VibesLanding';

export default async function VibesPage({
  searchParams,
}: {
  searchParams: Promise<{ debug?: string }>;
}) {
  const { debug } = await searchParams;
  return <VibesLanding logtoConfig={getPublicLogtoConfig()} debug={debug === '1'} />;
}
