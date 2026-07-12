'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { tenantRepository } from '../../repositories/tenant.repository';
import { queryKeys } from '../../query/query-keys';
import type { DidDestinationType } from '../../../components/modules/phone-numbers/did-types';

export function useDidDestinations(type: DidDestinationType, enabled = true) {
  return useQuery({
    queryKey: queryKeys.tenant.didDestinations(type),
    queryFn: () => tenantRepository.listDidDestinations(type),
    enabled,
  });
}

export function useAssignDid() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: {
        destinationType: string;
        destinationId: string;
        callerIdName?: string;
        siteId?: string;
      };
    }) => tenantRepository.assignDid(id, payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tenant', 'dids'] });
    },
  });
}

export function useTenantSearch(query: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.tenant.search(query),
    queryFn: () => tenantRepository.search(query),
    enabled: enabled && query.length >= 2,
  });
}

export function useProvisionSession() {
  return useMutation({
    mutationFn: () => tenantRepository.createProvisionSession(),
  });
}

export function useProvisionCommit() {
  return useMutation({
    mutationFn: (sessionId: string) => tenantRepository.commitProvisionSession(sessionId),
  });
}

export function usePatchProvisionStep(sessionId: string | null) {
  return useMutation({
    mutationFn: ({
      step,
      payload,
    }: {
      step: 'user' | 'extension' | 'device' | 'did' | 'voicemail';
      payload: Record<string, unknown>;
    }) => {
      if (!sessionId) throw new Error('No provision session');
      return tenantRepository.patchProvisionStep(sessionId, step, payload);
    },
  });
}
