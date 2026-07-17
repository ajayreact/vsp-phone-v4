'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../query/query-keys';
import { tenantRepository } from '../../repositories/tenant.repository';

export type SipCredentialsView = {
  sipEndpointId: string;
  username: string;
  domain: string;
  outboundProxy: string;
  transport: string;
  hasPassword: boolean;
};

/** Lazy-loaded: only fetches once the Device tab has been visited. Never returns plaintext password. */
export function useSipCredentials(lineId: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.tenant.sipCredentials(lineId),
    queryFn: () => tenantRepository.getSipCredentials(lineId),
    enabled: enabled && Boolean(lineId),
    staleTime: 30_000,
  });
}

/** Reveal the current plaintext SIP password once — called on demand, never fetched eagerly. */
export function useRevealSipPassword() {
  return useMutation({
    mutationFn: (lineId: string) => tenantRepository.revealSipPassword(lineId),
  });
}

/** Rotate the SIP password — invalidates the current device registration until it re-registers. */
export function useResetSipPassword() {
  return useMutation({
    mutationFn: (lineId: string) => tenantRepository.resetSipPassword(lineId),
  });
}
