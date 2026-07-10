'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../query/query-keys';
import { marketplaceRepository, platformMarketplaceRepository } from '../../repositories/marketplace.repository';
import type { MarketplaceSearchParams } from '../../../types/marketplace';

export function useMarketplaceDashboard() {
  return useQuery({
    queryKey: queryKeys.marketplace.dashboard(),
    queryFn: () => marketplaceRepository.getDashboard(),
  });
}

export function useMarketplaceInventory(params?: MarketplaceSearchParams, enabled = true) {
  return useQuery({
    queryKey: queryKeys.marketplace.inventory(params as Record<string, string> | undefined),
    queryFn: () => marketplaceRepository.searchInventory(params),
    enabled,
  });
}

export function useMarketplaceFavorites() {
  return useQuery({
    queryKey: queryKeys.marketplace.favorites(),
    queryFn: () => marketplaceRepository.listFavorites(),
  });
}

export function useMarketplaceSavedSearches() {
  return useQuery({
    queryKey: queryKeys.marketplace.savedSearches(),
    queryFn: () => marketplaceRepository.listSavedSearches(),
  });
}

export function useMarketplaceNotifications(unreadOnly?: boolean) {
  return useQuery({
    queryKey: queryKeys.marketplace.notifications(unreadOnly),
    queryFn: () => marketplaceRepository.listNotifications(unreadOnly),
    refetchInterval: 30_000,
  });
}

export function useTenantNumberRequestsList(status?: string) {
  return useQuery({
    queryKey: queryKeys.marketplace.requests(status),
    queryFn: () => marketplaceRepository.listRequests(status),
  });
}

export function usePlatformNumberRequests(status?: string) {
  return useQuery({
    queryKey: queryKeys.marketplace.platformRequests(status),
    queryFn: () => platformMarketplaceRepository.listRequests(status),
  });
}

export function usePlatformMarketplaceReports() {
  return useQuery({
    queryKey: queryKeys.marketplace.reports(),
    queryFn: () => platformMarketplaceRepository.getReports(),
  });
}

export function useReserveMarketplaceNumber() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { phoneNumber: string; countryCode?: string }) =>
      marketplaceRepository.reserve(payload.phoneNumber, payload.countryCode),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['marketplace'] });
      void qc.invalidateQueries({ queryKey: queryKeys.tenant.numberRequests() });
    },
  });
}

export function useCancelMarketplaceReservation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => marketplaceRepository.cancelReservation(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['marketplace'] }),
  });
}

export function useCreateNumberRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: marketplaceRepository.createRequest,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['marketplace'] });
      void qc.invalidateQueries({ queryKey: queryKeys.tenant.numberRequests() });
    },
  });
}

export function useCancelNumberRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => marketplaceRepository.cancelRequest(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['marketplace'] }),
  });
}

export function useDuplicateNumberRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => marketplaceRepository.duplicateRequest(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['marketplace'] }),
  });
}

export function useToggleFavorite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ phoneNumber, favorited }: { phoneNumber: string; favorited: boolean }) => {
      if (favorited) return marketplaceRepository.removeFavorite(phoneNumber);
      return marketplaceRepository.addFavorite(phoneNumber);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.marketplace.favorites() }),
  });
}

export function useApprovePlatformRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...payload }: { id: string; notes?: string; internalNotes?: string; action?: 'assign' | 'purchase_then_assign' }) =>
      platformMarketplaceRepository.approveRequest(id, payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.marketplace.platformRequests() });
      void qc.invalidateQueries({ queryKey: queryKeys.telnyx.requests() });
      void qc.invalidateQueries({ queryKey: queryKeys.telnyx.numbers() });
    },
  });
}

export function useRejectPlatformRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, notes, internalNotes }: { id: string; notes?: string; internalNotes?: string }) =>
      platformMarketplaceRepository.rejectRequest(id, { notes, internalNotes }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.marketplace.platformRequests() });
      void qc.invalidateQueries({ queryKey: queryKeys.telnyx.requests() });
    },
  });
}

export function useBulkApprovePlatformRequests() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { ids: string[]; notes?: string; action?: 'assign' | 'purchase_then_assign' }) =>
      platformMarketplaceRepository.bulkApprove(payload.ids, payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.marketplace.platformRequests() });
      void qc.invalidateQueries({ queryKey: queryKeys.telnyx.requests() });
    },
  });
}

export function useBulkRejectPlatformRequests() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ ids, notes }: { ids: string[]; notes?: string }) =>
      platformMarketplaceRepository.bulkReject(ids, notes),
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.marketplace.platformRequests() }),
  });
}
