'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../query/query-keys';
import {
  platformRepository,
  type CreateTenantPayload,
  type UpdateTenantPayload,
} from '../../repositories/platform.repository';

export function usePlatformDashboard() {
  return useQuery({
    queryKey: queryKeys.platform.dashboard(),
    queryFn: () => platformRepository.getDashboard(),
    refetchInterval: 30_000,
  });
}

export function usePlatformTenants(filters?: { search?: string; status?: string }) {
  return useQuery({
    queryKey: queryKeys.platform.tenants(filters),
    queryFn: () => platformRepository.listTenants(filters),
  });
}

export function usePlatformTenant(id: string) {
  return useQuery({
    queryKey: queryKeys.platform.tenant(id),
    queryFn: () => platformRepository.getTenant(id),
    enabled: Boolean(id),
  });
}

export function useCreateTenant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateTenantPayload) => platformRepository.createTenant(payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['platform', 'tenants'] });
    },
  });
}

export function useUpdateTenant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateTenantPayload }) =>
      platformRepository.updateTenant(id, payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['platform', 'tenants'] });
    },
  });
}

export function useSuspendTenant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => platformRepository.suspendTenant(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['platform', 'tenants'] });
    },
  });
}

export function useActivateTenant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => platformRepository.activateTenant(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['platform', 'tenants'] });
    },
  });
}

export function usePlatformBilling() {
  return useQuery({
    queryKey: queryKeys.platform.billing(),
    queryFn: () => platformRepository.getBillingSummary(),
  });
}

export function usePlatformCarriers() {
  return useQuery({
    queryKey: queryKeys.platform.carriers(),
    queryFn: () => platformRepository.listCarriers(),
    refetchInterval: 30_000,
  });
}

export function usePlatformRoles(tenantId?: string) {
  return useQuery({
    queryKey: queryKeys.platform.roles(tenantId),
    queryFn: () => platformRepository.listRoles(tenantId),
  });
}

export function usePlatformPermissions(tenantId?: string) {
  return useQuery({
    queryKey: queryKeys.platform.permissions(tenantId),
    queryFn: () => platformRepository.listPermissions(tenantId),
  });
}

export function usePlatformAudit(params?: { tenantId?: string; limit?: number; actionPrefix?: string }) {
  return useQuery({
    queryKey: queryKeys.platform.audit(params as Record<string, string> | undefined),
    queryFn: () => platformRepository.listAudit(params),
  });
}

export function usePlatformUsers(search?: string) {
  return useQuery({
    queryKey: queryKeys.platform.users(search),
    queryFn: () => platformRepository.listUsers(search),
  });
}
