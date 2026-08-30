import { getPublicLogtoConfig } from '@/lib/auth/logto-config';
import LogtoCallback from './LogtoCallback';

export default function LogtoCallbackPage() {
  return <LogtoCallback logtoConfig={getPublicLogtoConfig()} />;
}
