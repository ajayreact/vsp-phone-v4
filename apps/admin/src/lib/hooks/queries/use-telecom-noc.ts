'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../query/query-keys';
import { telecomNocRepository } from '../../repositories/telecom-noc.repository';

const REFRESH = 5_000;

export function useNocDashboard(tenantId?: string) {
  return useQuery({
    queryKey: queryKeys.noc.dashboard(tenantId),
    queryFn: () => telecomNocRepository.getDashboard(tenantId),
    refetchInterval: REFRESH,
  });
}

export function useNocSipRegistrations(params?: { tenantId?: string; search?: string }) {
  return useQuery({
    queryKey: queryKeys.noc.registrations(params),
    queryFn: () => telecomNocRepository.listSipRegistrations({ ...params, limit: 200 }),
    refetchInterval: REFRESH,
  });
}

export function useNocSipDialogs(tenantId?: string) {
  return useQuery({
    queryKey: queryKeys.noc.dialogs(tenantId),
    queryFn: () => telecomNocRepository.listDialogs(tenantId),
    refetchInterval: REFRESH,
  });
}

export function useNocSipTrace(params: Record<string, string | undefined>, enabled = true) {
  return useQuery({
    queryKey: queryKeys.noc.sipTrace(params),
    queryFn: () => telecomNocRepository.searchSipTrace(params),
    enabled,
  });
}

export function useNocMediaSessions(tenantId?: string) {
  return useQuery({
    queryKey: queryKeys.noc.media(tenantId),
    queryFn: () => telecomNocRepository.listMediaSessions(tenantId),
    refetchInterval: REFRESH,
  });
}

export function useNocKamailio() {
  return useQuery({
    queryKey: queryKeys.noc.kamailio(),
    queryFn: () => telecomNocRepository.getKamailioDashboard(),
    refetchInterval: 15_000,
  });
}

export function useNocRtpengine(tenantId?: string) {
  return useQuery({
    queryKey: queryKeys.noc.rtpengine(tenantId),
    queryFn: () => telecomNocRepository.getRtpengineDashboard(tenantId),
    refetchInterval: REFRESH,
  });
}

export function useNocCarriers(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.noc.carriers(),
    queryFn: () => telecomNocRepository.getCarrierMonitoring(),
    refetchInterval: 30_000,
    enabled: options?.enabled ?? true,
  });
}

export function useNocAlerts(status?: string) {
  return useQuery({
    queryKey: queryKeys.noc.alerts(status),
    queryFn: () => telecomNocRepository.listAlerts({ status }),
    refetchInterval: 10_000,
  });
}

export function useNocFraudScan(tenantId?: string) {
  return useQuery({
    queryKey: queryKeys.noc.fraud(tenantId),
    queryFn: () => telecomNocRepository.fraudScan(tenantId),
    refetchInterval: 60_000,
  });
}

export function useNocRegistrationActions() {
  const qc = useQueryClient();
  const invalidate = () => void qc.invalidateQueries({ queryKey: ['noc'] });
  return useMutation({
    mutationFn: (p: { action: 'refresh' | 'unregister' | 'reregister'; id: string; reason?: string }) => {
      switch (p.action) {
        case 'refresh':
          return telecomNocRepository.refreshRegistration(p.id);
        case 'unregister':
          return telecomNocRepository.unregister(p.id, p.reason);
        case 'reregister':
          return telecomNocRepository.forceReregister(p.id);
      }
    },
    onSuccess: invalidate,
  });
}

export function useNocAlertActions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { action: 'ack' | 'resolve'; id: string; note?: string }) =>
      p.action === 'ack'
        ? telecomNocRepository.acknowledgeAlert(p.id, p.note)
        : telecomNocRepository.resolveAlert(p.id, p.note),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['noc', 'alerts'] }),
  });
}

export function useRunSynthetic() {
  return useMutation({ mutationFn: () => telecomNocRepository.runSynthetic() });
}

export function useCallDiagnostics(platformUuid: string | null, tenantId?: string) {
  return useQuery({
    queryKey: queryKeys.noc.diagnostics(platformUuid ?? '', tenantId),
    queryFn: () => telecomNocRepository.getCallDiagnostics(platformUuid!, tenantId),
    enabled: Boolean(platformUuid),
  });
}
