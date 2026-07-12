'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../query/query-keys';
import { tenantRepository } from '../../repositories/tenant.repository';

export function useTenantCompany() {
  return useQuery({
    queryKey: queryKeys.tenant.company(),
    queryFn: () => tenantRepository.getCompany(),
  });
}

export function useUpdateTenantCompany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: tenantRepository.updateCompany,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.tenant.company() });
    },
  });
}

export function useTenantSites(search?: string) {
  return useQuery({
    queryKey: queryKeys.tenant.sites(search),
    queryFn: () => tenantRepository.listSites(search),
  });
}

export function useCreateTenantSite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: tenantRepository.createSite,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['tenant', 'sites'] }),
  });
}

export function useUpdateTenantSite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) =>
      tenantRepository.updateSite(id, payload),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['tenant', 'sites'] }),
  });
}

export function useDeleteTenantSite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: tenantRepository.deleteSite,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['tenant', 'sites'] }),
  });
}

export function useTenantDepartments(search?: string) {
  return useQuery({
    queryKey: queryKeys.tenant.departments(search),
    queryFn: () => tenantRepository.listDepartments(search),
  });
}

export function useCreateTenantDepartment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: tenantRepository.createDepartment,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['tenant', 'departments'] }),
  });
}

export function useUpdateTenantDepartment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: { name: string } }) =>
      tenantRepository.updateDepartment(id, payload),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['tenant', 'departments'] }),
  });
}

export function useDeleteTenantDepartment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: tenantRepository.deleteDepartment,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['tenant', 'departments'] }),
  });
}

export function useTenantApiKeys(enabled = true) {
  return useQuery({
    queryKey: queryKeys.tenant.apiKeys(),
    queryFn: () => tenantRepository.listApiKeys(),
    enabled,
  });
}

export function useCreateTenantApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: tenantRepository.createApiKey,
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.tenant.apiKeys() }),
  });
}

export function useRevokeTenantApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: tenantRepository.revokeApiKey,
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.tenant.apiKeys() }),
  });
}
