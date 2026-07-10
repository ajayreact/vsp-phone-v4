'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../query/query-keys';
import { supervisorService } from '../../services/supervisor.service';

const REFRESH_MS = 5_000;

function invalidateSupervisor(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ['supervisor'] });
}

export function useSupervisorDashboard(tenantId?: string) {
  return useQuery({
    queryKey: queryKeys.supervisor.dashboard(tenantId),
    queryFn: () => supervisorService.getDashboard(tenantId),
    refetchInterval: REFRESH_MS,
  });
}

export function useSupervisorWallboard(tenantId?: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.supervisor.wallboard(tenantId),
    queryFn: () => supervisorService.getWallboard(tenantId),
    refetchInterval: REFRESH_MS,
    enabled,
  });
}

export function useSupervisorAgents(tenantId?: string) {
  return useQuery({
    queryKey: queryKeys.supervisor.agents(tenantId),
    queryFn: () => supervisorService.listAgents(tenantId),
    refetchInterval: REFRESH_MS,
  });
}

export function useSupervisorQueues(tenantId?: string) {
  return useQuery({
    queryKey: queryKeys.supervisor.queues(tenantId),
    queryFn: () => supervisorService.listQueues(tenantId),
    refetchInterval: REFRESH_MS,
  });
}

export function useSupervisorLiveCalls(tenantId?: string) {
  return useQuery({
    queryKey: queryKeys.supervisor.liveCalls(tenantId),
    queryFn: () => supervisorService.listLiveCalls(tenantId),
    refetchInterval: REFRESH_MS,
  });
}

export function useSupervisorCallTimeline(platformUuid: string | null, tenantId?: string) {
  return useQuery({
    queryKey: queryKeys.supervisor.timeline(platformUuid ?? '', tenantId),
    queryFn: () => supervisorService.getCallTimeline(platformUuid!, tenantId),
    enabled: Boolean(platformUuid),
  });
}

export function useSupervisorRecordings(params?: { search?: string; from?: string; to?: string; limit?: number }) {
  return useQuery({
    queryKey: queryKeys.supervisor.recordings(params),
    queryFn: () => supervisorService.searchRecordings(params),
  });
}

export function useSupervisorReports(tenantId?: string) {
  return useQuery({
    queryKey: queryKeys.supervisor.reports(tenantId),
    queryFn: () => supervisorService.getReports(tenantId),
    refetchInterval: 60_000,
  });
}

export function useSupervisorCoaching(callSessionId?: string) {
  return useQuery({
    queryKey: queryKeys.supervisor.coaching(callSessionId),
    queryFn: () => supervisorService.listCoaching(callSessionId),
  });
}

export function useSupervisorCallActions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { action: 'listen' | 'whisper' | 'barge' | 'takeover' | 'hangup' | 'end'; platformUuid: string }) => {
      switch (payload.action) {
        case 'listen':
          return supervisorService.listen(payload.platformUuid);
        case 'whisper':
          return supervisorService.whisper(payload.platformUuid);
        case 'barge':
          return supervisorService.barge(payload.platformUuid);
        case 'takeover':
          return supervisorService.takeOver(payload.platformUuid);
        case 'hangup':
          return supervisorService.hangUp(payload.platformUuid);
        case 'end':
          return supervisorService.endSupervision(payload.platformUuid);
      }
    },
    onSuccess: () => invalidateSupervisor(qc),
  });
}

export function useSupervisorAgentActions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { action: 'pause' | 'resume' | 'logout' | 'move'; lineId: string; reason?: string; queueId?: string }) => {
      switch (payload.action) {
        case 'pause':
          return supervisorService.pauseAgent(payload.lineId, payload.reason);
        case 'resume':
          return supervisorService.resumeAgent(payload.lineId);
        case 'logout':
          return supervisorService.forceLogout(payload.lineId);
        case 'move':
          return supervisorService.moveAgent(payload.lineId, payload.queueId!);
      }
    },
    onSuccess: () => invalidateSupervisor(qc),
  });
}

export function useSupervisorQueueActions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { action: 'pause' | 'resume' | 'overflow' | 'emergency'; queueId: string; overflowQueueId?: string }) => {
      switch (payload.action) {
        case 'pause':
          return supervisorService.pauseQueue(payload.queueId);
        case 'resume':
          return supervisorService.resumeQueue(payload.queueId);
        case 'overflow':
          return supervisorService.overflowQueue(payload.queueId, payload.overflowQueueId);
        case 'emergency':
          return supervisorService.emergencyCloseQueue(payload.queueId);
      }
    },
    onSuccess: () => invalidateSupervisor(qc),
  });
}

export function useSupervisorEmergencyStop() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => supervisorService.emergencyStop(),
    onSuccess: () => invalidateSupervisor(qc),
  });
}

export function useSupervisorRecordingActions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { id: string; type: 'FLAG' | 'COMMENT' | 'BOOKMARK'; body?: string }) =>
      supervisorService.annotateRecording(payload.id, payload.type, payload.body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['supervisor', 'recordings'] }),
  });
}

export function useAddCoachingNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: supervisorService.addCoaching,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['supervisor', 'coaching'] }),
  });
}

export function useRecordingPlaybackUrl() {
  return useMutation({
    mutationFn: (id: string) => supervisorService.getRecordingUrl(id),
  });
}
