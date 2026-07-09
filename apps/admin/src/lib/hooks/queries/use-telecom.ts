'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../query/query-keys';
import {
  billingService,
  extensionsService,
  liveCallsService,
  opsService,
  resourceService,
  telnyxNumbersService,
  tenantsService,
  trunksService,
} from '../../services/telecom.service';
import type { AssignTelnyxNumberPayload } from '../../../types/telecom';

export function useOpsDashboard(tenantId?: string) {
  return useQuery({
    queryKey: queryKeys.ops.dashboard(tenantId),
    queryFn: () => opsService.getDashboard(tenantId),
    refetchInterval: 30_000,
  });
}

export function useInfraHealth() {
  return useQuery({
    queryKey: queryKeys.ops.health(),
    queryFn: () => opsService.getHealth(),
    refetchInterval: 30_000,
  });
}

export function useTelnyxNumbers(filters?: { search?: string; status?: string; region?: string }) {
  return useQuery({
    queryKey: queryKeys.telnyx.numbers(filters),
    queryFn: () => telnyxNumbersService.list(filters),
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

export function useModuleResource(moduleId: string) {
  return useQuery({
    queryKey: queryKeys.resource(moduleId),
    queryFn: () => resourceService.list(moduleId),
  });
}

export function useTenants() {
  return useQuery({
    queryKey: queryKeys.tenants.all(),
    queryFn: () => tenantsService.list(),
  });
}

export function useBillingSummary() {
  return useQuery({
    queryKey: queryKeys.billing.summary(),
    queryFn: () => billingService.getSummary(),
  });
}
