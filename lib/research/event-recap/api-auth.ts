import { authorizeVibesRequest, vibesAuthResponse } from '@/lib/research/vibes/access';

interface EventApiUsage {
  route: string;
  action: string;
  metadata?: Record<string, unknown>;
}

export async function authorizeEventApiRequest(
  request: Request,
  usage: EventApiUsage
): Promise<Response | null> {
  const auth = await authorizeVibesRequest(request, {
    ...usage,
    metadata: {
      surface: 'event-recap',
      ...(usage.metadata ?? {}),
    },
  });
  return auth.ok ? null : vibesAuthResponse(auth);
}
