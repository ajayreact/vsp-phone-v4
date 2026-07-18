'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../query/query-keys';
import {
  platformRepository,
  type CreateApiKeyPayload,
  type CreatePlatformRolePayload,
  type CreatePlatformUserPayload,
  type CreateTenantPayload,
  type OnboardTenantPayload,
  type UpdatePlatformSettingsPayload,
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

export function usePlatformTenantDids(id: string | null | undefined) {
  return useQuery({
    queryKey: ['platform', 'tenants', id, 'dids'],
    queryFn: () => platformRepository.listTenantDids(id!),
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

export function useOnboardTenant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: OnboardTenantPayload) => platformRepository.onboardTenant(payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['platform', 'tenants'] });
      void qc.invalidateQueries({ queryKey: ['platform', 'users'] });
      void qc.invalidateQueries({ queryKey: ['platform', 'billing'] });
    },
  });
}

export function useUploadTenantLogo() {
  return useMutation({
    mutationFn: (file: File) => platformRepository.uploadTenantLogo(file),
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

export function useResetTenantPbx() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, confirmPhrase }: { id: string; confirmPhrase: string }) =>
      platformRepository.resetPbx(id, { confirmPhrase }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['platform', 'tenants'] });
    },
  });
}

export function useResetTenant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      confirmPhrase,
      acknowledged,
    }: {
      id: string;
      confirmPhrase: string;
      acknowledged: boolean;
    }) => platformRepository.resetTenant(id, { confirmPhrase, acknowledged }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['platform', 'tenants'] });
    },
  });
}

/** @deprecated Use useResetTenant */
export function useFactoryResetTenant() {
  return useResetTenant();
}

export function useDeleteTenantConfirmed() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, confirmPhrase }: { id: string; confirmPhrase: string }) =>
      platformRepository.deleteTenantConfirmed(id, { confirmPhrase }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['platform', 'tenants'] });
    },
  });
}

export function useResumeOnboardTenant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) =>
      platformRepository.resumeOnboard(id, payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['platform', 'tenants'] });
      void qc.invalidateQueries({ queryKey: ['platform', 'users'] });
    },
  });
}

export function usePlatformBilling() {
  return useQuery({
    queryKey: queryKeys.platform.billing(),
    queryFn: () => platformRepository.getBillingSummary(),
  });
}

export function usePlatformPlans() {
  return useQuery({
    queryKey: [...queryKeys.platform.billing(), 'plans'],
    queryFn: () => platformRepository.listPlans(),
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

export function useCreatePlatformRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreatePlatformRolePayload) => platformRepository.createRole(payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['platform', 'roles'] });
    },
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

export function usePlatformUsers(params?: {
  tenantId?: string;
  search?: string;
  role?: string;
  status?: string;
}) {
  return useQuery({
    queryKey: ['platform', 'users', params?.tenantId ?? 'all', params?.search, params?.role, params?.status],
    queryFn: () => platformRepository.listUsers(params),
  });
}

export function useCreatePlatformUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreatePlatformUserPayload) => platformRepository.createUser(payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['platform', 'users'] });
    },
  });
}

export function usePlatformSettings(enabled = true) {
  return useQuery({
    queryKey: queryKeys.platform.settings(),
    queryFn: () => platformRepository.getSettings(),
    enabled,
  });
}

export function usePlatformProvisioningSettings() {
  return useQuery({
    queryKey: queryKeys.platform.provisioningSettings(),
    queryFn: () => platformRepository.getProvisioningSettings(),
  });
}

export function useUpdatePlatformSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpdatePlatformSettingsPayload) => platformRepository.updateSettings(payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.platform.settings() });
    },
  });
}

export function usePlatformApiKeys(tenantId?: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.platform.apiKeys(tenantId),
    queryFn: () => platformRepository.listApiKeys(tenantId),
    enabled,
  });
}

export function useCreatePlatformApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateApiKeyPayload) => platformRepository.createApiKey(payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['platform', 'api-keys'] });
    },
  });
}

export function useRevokePlatformApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => platformRepository.revokeApiKey(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['platform', 'api-keys'] });
    },
  });
}

export function usePlatformSearch(q: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.platform.search(q),
    queryFn: () => platformRepository.search(q),
    enabled: enabled && q.trim().length >= 2,
    staleTime: 10_000,
  });
}

export function usePlatformOrganization(tenantId: string) {
  return useQuery({
    queryKey: queryKeys.platform.organization(tenantId),
    queryFn: () => platformRepository.getOrganization(tenantId),
    enabled: Boolean(tenantId),
  });
}

export function useUpdatePlatformOrganization() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      tenantId,
      payload,
    }: {
      tenantId: string;
      payload: { displayName?: string; timezone?: string; defaultLanguage?: string };
    }) => platformRepository.updateOrganization(tenantId, payload),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: queryKeys.platform.organization(vars.tenantId) });
    },
  });
}
