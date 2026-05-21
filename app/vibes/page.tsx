import { getPublicLogtoConfig } from '@/lib/auth/logto-config';
import VibesLanding from './VibesLanding';

export default function VibesPage() {
  return <VibesLanding logtoConfig={getPublicLogtoConfig()} />;
}
