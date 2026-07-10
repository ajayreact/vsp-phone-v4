'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../query/query-keys';
import {
  extensionsService,
  liveCallsService,
  telnyxNumbersService,
  tenantsService,
  trunksService,
} from '../../services/telecom.service';
import { usePlatformBilling } from './use-platform';
import type { AssignTelnyxNumberPayload } from '../../../types/telecom';

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

export function useTelnyxNumbers(filters?: { search?: string; status?: string; region?: string }) {
  return useQuery({
    queryKey: queryKeys.telnyx.numbers(filters),
    queryFn: () => telnyxNumbersService.list(filters),
  });
}

export function useSearchAvailableNumbers(filters?: {
  countryCode?: string;
  areaCode?: string;
  contains?: string;
  limit?: number;
}) {
  return useQuery({
    queryKey: queryKeys.telnyx.searchAvailable(filters as Record<string, string> | undefined),
    queryFn: () => telnyxNumbersService.searchAvailable(filters),
    enabled: Boolean(filters?.contains || filters?.areaCode),
  });
}

export function useAssignTelnyxNumber() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: AssignTelnyxNumberPayload }) =>
      telnyxNumbersService.assign(id, payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['telnyx', 'numbers'] });
    },
  });
}

export function usePurchaseTelnyxNumber() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: import('../../../types/telecom').PurchaseTelnyxNumberPayload) =>
      telnyxNumbersService.purchase(payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['telnyx', 'numbers'] });
    },
  });
}

export function useReleaseTelnyxNumber() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => telnyxNumbersService.release(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['telnyx', 'numbers'] });
    },
  });
}

export function useBulkAssignTelnyxNumbers() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: import('../../../types/telecom').BulkAssignPayload) =>
      telnyxNumbersService.bulkAssign(payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['telnyx', 'numbers'] });
    },
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
