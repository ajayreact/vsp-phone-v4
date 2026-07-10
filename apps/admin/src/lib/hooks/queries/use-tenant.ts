'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../query/query-keys';
import { tenantRepository } from '../../repositories/tenant.repository';

export function useTenantDashboard() {
  return useQuery({
    queryKey: queryKeys.tenant.dashboard(),
    queryFn: () => tenantRepository.getDashboard(),
    refetchInterval: 30_000,
  });
}

export function useTenantUsers(search?: string) {
  return useQuery({
    queryKey: queryKeys.tenant.users(search),
    queryFn: () => tenantRepository.listUsers(search),
  });
}

export function useTenantDevices(search?: string) {
  return useQuery({
    queryKey: queryKeys.tenant.devices(search),
    queryFn: () => tenantRepository.listDevices(search),
  });
}

export function useTenantExtensions(search?: string) {
  return useQuery({
    queryKey: queryKeys.tenant.extensions(search),
    queryFn: () => tenantRepository.listExtensions(search),
  });
}

export function useTenantDids(search?: string) {
  return useQuery({
    queryKey: queryKeys.tenant.dids(search),
    queryFn: () => tenantRepository.listDids(search),
  });
}

export function useTenantQueues() {
  return useQuery({
    queryKey: queryKeys.tenant.queues(),
    queryFn: () => tenantRepository.listQueues(),
  });
}

export function useTenantIvrs() {
  return useQuery({
    queryKey: queryKeys.tenant.ivrs(),
    queryFn: () => tenantRepository.listIvrs(),
  });
}

export function useTenantRingGroups() {
  return useQuery({
    queryKey: queryKeys.tenant.ringGroups(),
    queryFn: () => tenantRepository.listRingGroups(),
  });
}

export function useTenantVoicemail() {
  return useQuery({
    queryKey: queryKeys.tenant.voicemail(),
    queryFn: () => tenantRepository.listVoicemail(),
  });
}

export function useTenantRouting() {
  return useQuery({
    queryKey: queryKeys.tenant.routing(),
    queryFn: () => tenantRepository.listRoutingPolicies(),
  });
}

export function useTenantCdr(params?: { from?: string; to?: string; limit?: number }) {
  return useQuery({
    queryKey: queryKeys.tenant.cdr(params as Record<string, string> | undefined),
    queryFn: () => tenantRepository.listCdr(params),
  });
}

export function useTenantRecordings() {
  return useQuery({
    queryKey: queryKeys.tenant.recordings(),
    queryFn: () => tenantRepository.listRecordings(),
  });
}

export function useTenantNumberRequests() {
  return useQuery({
    queryKey: queryKeys.tenant.numberRequests(),
    queryFn: () => tenantRepository.listNumberRequests(),
  });
}
