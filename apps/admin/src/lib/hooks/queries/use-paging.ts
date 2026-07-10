'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../query/query-keys';
import { pagingRepository } from '../../repositories/paging.repository';

function invalidatePaging(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ['tenant', 'paging-groups'] });
  void qc.invalidateQueries({ queryKey: ['tenant', 'paging-reports'] });
}

export function usePagingReports() {
  return useQuery({
    queryKey: queryKeys.tenant.pagingReports(),
    queryFn: () => pagingRepository.getReports(),
  });
}

export function usePagingGroups(kind?: string) {
  return useQuery({
    queryKey: queryKeys.tenant.pagingGroups(kind),
    queryFn: () => pagingRepository.listGroups(kind),
  });
}

export function useCreatePagingGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) => pagingRepository.createGroup(payload),
    onSuccess: () => invalidatePaging(qc),
  });
}

export function useUpdatePagingGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) =>
      pagingRepository.updateGroup(id, payload),
    onSuccess: () => invalidatePaging(qc),
  });
}

export function useDeletePagingGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => pagingRepository.deleteGroup(id),
    onSuccess: () => invalidatePaging(qc),
  });
}
