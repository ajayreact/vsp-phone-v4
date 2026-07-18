'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../query/query-keys';
import { opsRepository } from '../../repositories/ops.repository';

export function useOpsDashboard(tenantId?: string) {
  return useQuery({
    queryKey: queryKeys.ops.dashboard(tenantId),
    queryFn: () => opsRepository.getDashboard(tenantId),
    refetchInterval: 30_000,
  });
}

export function useOpsHealth(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.ops.health(),
    queryFn: () => opsRepository.getHealth(),
    refetchInterval: 30_000,
    enabled: options?.enabled ?? true,
  });
}

export function useKamailioPersistence() {
  return useQuery({
    queryKey: queryKeys.ops.kamailio(),
    queryFn: () => opsRepository.getKamailioPersistence(),
    refetchInterval: 30_000,
  });
}

export function useRtpengineNodes() {
  return useQuery({
    queryKey: queryKeys.ops.rtpengine(),
    queryFn: () => opsRepository.getRtpengineNodes(),
    refetchInterval: 30_000,
  });
}

export function useRedisStats() {
  return useQuery({
    queryKey: queryKeys.ops.redis(),
    queryFn: () => opsRepository.getRedisStats(),
    refetchInterval: 30_000,
  });
}

export function usePostgresStats() {
  return useQuery({
    queryKey: queryKeys.ops.postgres(),
    queryFn: () => opsRepository.getPostgresStats(),
    refetchInterval: 30_000,
  });
}

export function useOpsCarriersHealth() {
  return useQuery({
    queryKey: queryKeys.ops.carriersHealth(),
    queryFn: () => opsRepository.getCarriersHealth(),
    refetchInterval: 30_000,
  });
}

export function useOpsAudit(params?: { tenantId?: string; limit?: number; actionPrefix?: string }) {
  return useQuery({
    queryKey: queryKeys.ops.audit(params as Record<string, string> | undefined),
    queryFn: () => opsRepository.listAudit(params),
  });
}

export function useOpsSipRegistrations(params?: { tenantId?: string; limit?: number }) {
  return useQuery({
    queryKey: queryKeys.ops.sipRegistrations(params as Record<string, string> | undefined),
    queryFn: () => opsRepository.listSipRegistrations(params),
    refetchInterval: 15_000,
  });
}

/** @deprecated Use useOpsHealth — kept for backward compatibility */
export function useInfraHealth() {
  return useOpsHealth();
}
