'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { tenantRepository } from '../../repositories/tenant.repository';

function invalidateTenantLists(qc: ReturnType<typeof useQueryClient>, keys: string[]) {
  for (const key of keys) {
    void qc.invalidateQueries({ queryKey: ['tenant', key] });
  }
  void qc.invalidateQueries({ queryKey: ['tenant', 'extensionHub'] });
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

export function useUpdateTenantExtension() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) =>
      tenantRepository.updateExtension(id, payload),
    onSuccess: () => invalidateTenantLists(qc, ['extensions']),
  });
}

export function useDeleteTenantExtension() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: tenantRepository.deleteExtension,
    onSuccess: () => invalidateTenantLists(qc, ['extensions']),
  });
}

export function useBulkImportExtensions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: tenantRepository.bulkImportExtensions,
    onSuccess: () => invalidateTenantLists(qc, ['extensions']),
  });
}

export function useCreateTenantUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: tenantRepository.createUser,
    onSuccess: () => invalidateTenantLists(qc, ['users', 'extensions', 'extensionHub']),
  });
}

export function useUpdateTenantUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: { email?: string; firstName?: string; lastName?: string; roleName?: string };
    }) => tenantRepository.updateUser(id, payload),
    onSuccess: () => invalidateTenantLists(qc, ['users', 'extensions', 'extensionHub']),
  });
}

export function useDeleteTenantUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: tenantRepository.deleteUser,
    onSuccess: () => invalidateTenantLists(qc, ['users', 'extensions', 'extensionHub']),
  });
}

export function useSetTenantUserStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'ACTIVE' | 'INACTIVE' | 'PENDING' | 'LOCKED' }) =>
      tenantRepository.setUserStatus(id, status),
    onSuccess: () => invalidateTenantLists(qc, ['users']),
  });
}

export function useResetTenantUserPassword() {
  return useMutation({
    mutationFn: ({ id, password }: { id: string; password?: string }) =>
      tenantRepository.resetUserPassword(id, password),
  });
}

export function useAssignTenantUserExtension() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, extensionId }: { id: string; extensionId: string }) =>
      tenantRepository.assignUserExtension(id, extensionId),
    onSuccess: () => invalidateTenantLists(qc, ['users', 'extensions', 'extensionHub']),
  });
}

export function useUnassignTenantUserExtension() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, extensionId }: { id: string; extensionId?: string }) =>
      tenantRepository.unassignUserExtension(id, extensionId),
    onSuccess: () => invalidateTenantLists(qc, ['users', 'extensions', 'extensionHub']),
  });
}
