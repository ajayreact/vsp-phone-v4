'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { tenantRepository } from '../../repositories/tenant.repository';

function invalidateTenantLists(qc: ReturnType<typeof useQueryClient>, keys: string[]) {
  for (const key of keys) {
    void qc.invalidateQueries({ queryKey: ['tenant', key] });
  }
}

export function useCreateTenantQueue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: tenantRepository.createQueue,
    onSuccess: () => invalidateTenantLists(qc, ['queues']),
  });
}

export function useCreateTenantIvr() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: tenantRepository.createIvr,
    onSuccess: () => invalidateTenantLists(qc, ['ivrs']),
  });
}

export function useCreateTenantRingGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: tenantRepository.createRingGroup,
    onSuccess: () => invalidateTenantLists(qc, ['ring-groups']),
  });
}

export function useCreateTenantVoicemail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: tenantRepository.createVoicemail,
    onSuccess: () => invalidateTenantLists(qc, ['voicemail']),
  });
}

export function useCreateTenantRoutingPolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: tenantRepository.createRoutingPolicy,
    onSuccess: () => invalidateTenantLists(qc, ['routing']),
  });
}

export function useCreateTenantExtension() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: tenantRepository.createExtension,
    onSuccess: () => invalidateTenantLists(qc, ['extensions']),
  });
}
