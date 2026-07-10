'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../query/query-keys';
import { telnyxNumbersService, tenantsService, trunksService, liveCallsService, extensionsService } from '../../services/telecom.service';
import { usePlatformBilling } from './use-platform';
import type { AssignTelnyxNumberPayload, PurchaseTelnyxNumberPayload, SearchAvailableParams, UpdateTelnyxNumberPayload } from '../../../types/telecom';

export { useOpsDashboard, useOpsHealth, useInfraHealth } from './use-ops';
export {
  usePlatformDashboard,
  usePlatformTenants,
  usePlatformBilling,
  usePlatformCarriers,
  usePlatformRoles,
  usePlatformPermissions,
  usePlatformAudit,
  usePlatformUsers,
} from './use-platform';
export {
  useTenantDashboard,
  useTenantUsers,
  useTenantDevices,
  useTenantExtensions,
  useTenantDids,
  useTenantQueues,
  useTenantIvrs,
  useTenantRingGroups,
  useTenantVoicemail,
  useTenantRouting,
  useTenantCdr,
  useTenantRecordings,
} from './use-tenant';

export function useTelnyxDashboard() {
  return useQuery({
    queryKey: queryKeys.telnyx.dashboard(),
    queryFn: () => telnyxNumbersService.getDashboard(),
    refetchInterval: 30_000,
  });
}

export function useTelnyxSyncStatus() {
  return useQuery({
    queryKey: queryKeys.telnyx.syncStatus(),
    queryFn: () => telnyxNumbersService.getSyncStatus(),
  });
}

export function useTriggerTelnyxSync() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => telnyxNumbersService.triggerSync(),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['telnyx'] });
    },
  });
}

export function useTelnyxNumbers(filters?: { search?: string; status?: string; region?: string; tag?: string }) {
  return useQuery({
    queryKey: queryKeys.telnyx.numbers(filters),
    queryFn: () => telnyxNumbersService.list(filters),
  });
}

export function useTelnyxNumber(id: string) {
  return useQuery({
    queryKey: queryKeys.telnyx.number(id),
    queryFn: () => telnyxNumbersService.get(id),
    enabled: Boolean(id),
  });
}

export function useTelnyxNumberHistory(id: string) {
  return useQuery({
    queryKey: queryKeys.telnyx.history(id),
    queryFn: () => telnyxNumbersService.getHistory(id),
    enabled: Boolean(id),
  });
}

export function useSearchAvailableNumbers(filters: SearchAvailableParams, enabled = true) {
  return useQuery({
    queryKey: queryKeys.telnyx.searchAvailable(filters as Record<string, string>),
    queryFn: () => telnyxNumbersService.searchAvailable(filters),
    enabled: enabled && Boolean(filters.countryCode || filters.areaCode || filters.contains || filters.search),
  });
}

export function useTelnyxMarketplace(search?: string) {
  return useQuery({
    queryKey: queryKeys.telnyx.marketplace(search),
    queryFn: () => telnyxNumbersService.listMarketplace(search),
  });
}

export function useReserveTelnyxNumber() {
  return useMutation({
    mutationFn: (payload: { phoneNumber: string; countryCode?: string }) => telnyxNumbersService.reserve(payload),
  });
}

export function useAssignTelnyxNumber() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: AssignTelnyxNumberPayload }) =>
      telnyxNumbersService.assign(id, payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['telnyx'] });
    },
  });
}

export function useUpdateTelnyxNumber() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateTelnyxNumberPayload }) =>
      telnyxNumbersService.update(id, payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['telnyx'] });
    },
  });
}

export function usePurchaseTelnyxNumber() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: PurchaseTelnyxNumberPayload) => telnyxNumbersService.purchase(payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['telnyx'] });
    },
  });
}

export function useReleaseTelnyxNumber() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => telnyxNumbersService.release(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['telnyx'] });
    },
  });
}

export function useSuspendTelnyxNumber() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => telnyxNumbersService.suspend(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['telnyx'] }),
  });
}

export function useActivateTelnyxNumber() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => telnyxNumbersService.activate(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['telnyx'] }),
  });
}

export function useBulkAssignTelnyxNumbers() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: telnyxNumbersService.bulkAssign,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['telnyx'] }),
  });
}

export function useBulkReleaseTelnyxNumbers() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => telnyxNumbersService.bulkRelease(ids),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['telnyx'] }),
  });
}

export function useTelnyxNumberRequests(status?: string) {
  return useQuery({
    queryKey: queryKeys.telnyx.requests(status),
    queryFn: () => telnyxNumbersService.listRequests(status),
  });
}

export function useApproveTelnyxRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, notes }: { id: string; notes?: string }) => telnyxNumbersService.approveRequest(id, notes),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['telnyx'] }),
  });
}

export function useRejectTelnyxRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, notes }: { id: string; notes?: string }) => telnyxNumbersService.rejectRequest(id, notes),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['telnyx'] }),
  });
}

export function useSipTrunks() {
  return useQuery({
    queryKey: queryKeys.trunks.all(),
    queryFn: () => trunksService.list(),
    refetchInterval: 10_000,
  });
}

export function useLiveCalls(tenantId?: string) {
  return useQuery({
    queryKey: queryKeys.liveCalls.list(tenantId),
    queryFn: () => liveCallsService.list(tenantId),
    refetchInterval: 5_000,
  });
}

export function useExtensions(search?: string) {
  return useQuery({
    queryKey: queryKeys.extensions.list(search ? { search } : undefined),
    queryFn: () => extensionsService.list({ search }),
  });
}

export function useTenants() {
  return useQuery({
    queryKey: queryKeys.tenants.all(),
    queryFn: () => tenantsService.list(),
  });
}

export function useBillingSummary() {
  return usePlatformBilling();
}
