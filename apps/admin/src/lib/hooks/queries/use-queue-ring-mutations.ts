'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queueRingRepository } from '../../repositories/queue-ring.repository';
import { queryKeys } from '../../query/query-keys';

function invalidate(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ['tenant', 'ring-groups'] });
  void qc.invalidateQueries({ queryKey: ['tenant', 'queues'] });
  void qc.invalidateQueries({ queryKey: ['tenant', 'queue-dashboard'] });
}

export function useQueueDashboard() {
  return useQuery({
    queryKey: queryKeys.tenant.queueDashboard(),
    queryFn: () => queueRingRepository.getQueueDashboard().then((r) => r.data),
    refetchInterval: 10_000,
  });
}

export function useCreateRingGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: queueRingRepository.createRingGroup,
    onSuccess: () => invalidate(qc),
  });
}

export function useUpdateRingGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) =>
      queueRingRepository.updateRingGroup(id, payload),
    onSuccess: () => invalidate(qc),
  });
}

export function useDeleteRingGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: queueRingRepository.deleteRingGroup,
    onSuccess: () => invalidate(qc),
  });
}

export function useCloneRingGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => queueRingRepository.cloneRingGroup(id, { name }),
    onSuccess: () => invalidate(qc),
  });
}

export function useBulkImportRingGroups() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: queueRingRepository.bulkImportRingGroups,
    onSuccess: () => invalidate(qc),
  });
}

export function useReplaceRingGroupMembers() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, members }: { id: string; members: Record<string, unknown>[] }) =>
      queueRingRepository.replaceRingGroupMembers(id, members),
    onSuccess: () => invalidate(qc),
  });
}

export function useCreateQueueFull() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: queueRingRepository.createQueue,
    onSuccess: () => invalidate(qc),
  });
}

export function useUpdateQueue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) =>
      queueRingRepository.updateQueue(id, payload),
    onSuccess: () => invalidate(qc),
  });
}

export function useDeleteQueue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: queueRingRepository.deleteQueue,
    onSuccess: () => invalidate(qc),
  });
}

export function useCloneQueue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name, code }: { id: string; name: string; code: string }) =>
      queueRingRepository.cloneQueue(id, { name, code }),
    onSuccess: () => invalidate(qc),
  });
}

export function usePauseQueue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: queueRingRepository.pauseQueue,
    onSuccess: () => invalidate(qc),
  });
}

export function useResumeQueue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: queueRingRepository.resumeQueue,
    onSuccess: () => invalidate(qc),
  });
}

export function useEmergencyCloseQueue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: queueRingRepository.emergencyCloseQueue,
    onSuccess: () => invalidate(qc),
  });
}

export function useBulkImportQueues() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: queueRingRepository.bulkImportQueues,
    onSuccess: () => invalidate(qc),
  });
}

export function useReplaceQueueMembers() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, members }: { id: string; members: Record<string, unknown>[] }) =>
      queueRingRepository.replaceQueueMembers(id, members),
    onSuccess: () => invalidate(qc),
  });
}

export function useQueueAgentAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      action,
      queueId,
      memberId,
      reason,
    }: {
      action: 'login' | 'logout' | 'pause' | 'resume';
      queueId: string;
      memberId: string;
      reason?: string;
    }) => {
      if (action === 'login') return queueRingRepository.agentLogin(queueId, memberId);
      if (action === 'logout') return queueRingRepository.agentLogout(queueId, memberId);
      if (action === 'pause') return queueRingRepository.agentPause(queueId, memberId, reason);
      return queueRingRepository.agentResume(queueId, memberId);
    },
    onSuccess: () => invalidate(qc),
  });
}

export function useCreateQueueCallback() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      queueId,
      payload,
    }: {
      queueId: string;
      payload: { phoneNumber: string; callerName?: string; priority?: number; scheduledAt?: string };
    }) => queueRingRepository.createCallback(queueId, payload),
    onSuccess: () => invalidate(qc),
  });
}
