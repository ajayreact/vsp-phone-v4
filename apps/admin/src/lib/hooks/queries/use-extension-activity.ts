'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../query/query-keys';
import { tenantRepository } from '../../repositories/tenant.repository';

export type ActivityEvent = {
  id: string;
  action: string;
  label: string;
  detail?: string;
  at: string;
  actorUserId?: string;
};

/** Lazy-loaded: only fetches once the Activity tab has been visited (see `enabled`). */
export function useExtensionActivity(extensionId: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.tenant.extensionActivity(extensionId),
    queryFn: () => tenantRepository.getExtensionActivity(extensionId),
    enabled: enabled && Boolean(extensionId),
    staleTime: 30_000,
  });
}
