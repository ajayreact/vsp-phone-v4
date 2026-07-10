'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../query/query-keys';
import { receptionRepository } from '../../repositories/reception.repository';

function invalidateReception(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ['tenant', 'reception'] });
  void qc.invalidateQueries({ queryKey: ['tenant', 'presence'] });
  void qc.invalidateQueries({ queryKey: ['tenant', 'contacts'] });
  void qc.invalidateQueries({ queryKey: ['tenant', 'blf'] });
}

export function useReceptionDashboard() {
  return useQuery({
    queryKey: queryKeys.tenant.receptionDashboard(),
    queryFn: () => receptionRepository.getDashboard(),
    refetchInterval: 10_000,
  });
}

export function useReceptionCalls() {
  return useQuery({
    queryKey: queryKeys.tenant.receptionCalls(),
    queryFn: () => receptionRepository.listCalls(),
    refetchInterval: 5_000,
  });
}

export function useReceptionParking(lotId?: string) {
  return useQuery({
    queryKey: queryKeys.tenant.receptionParking(lotId),
    queryFn: () => receptionRepository.listParking(lotId),
    refetchInterval: 5_000,
  });
}

export function useReceptionReports(days = 30) {
  return useQuery({
    queryKey: queryKeys.tenant.receptionReports(days),
    queryFn: () => receptionRepository.getReports(days),
  });
}

export function useTenantPresence(search?: string) {
  return useQuery({
    queryKey: queryKeys.tenant.presence(search),
    queryFn: () => receptionRepository.listPresence(search),
    refetchInterval: 10_000,
  });
}

export function useContactDirectory(search?: string) {
  return useQuery({
    queryKey: queryKeys.tenant.contactDirectory(search),
    queryFn: () => receptionRepository.getDirectory(search),
  });
}

export function useContacts(params?: { search?: string; favoritesOnly?: boolean }) {
  return useQuery({
    queryKey: queryKeys.tenant.contacts(params),
    queryFn: () => receptionRepository.listContacts(params),
  });
}

export function useContactFavorites() {
  return useQuery({
    queryKey: queryKeys.tenant.contactFavorites(),
    queryFn: () => receptionRepository.listFavorites(),
  });
}

export function useSpeedDial() {
  return useQuery({
    queryKey: queryKeys.tenant.speedDial(),
    queryFn: () => receptionRepository.listSpeedDial(),
  });
}

export function useBlfPanels(mine = true) {
  return useQuery({
    queryKey: queryKeys.tenant.blfPanels(mine),
    queryFn: () => receptionRepository.listBlfPanels(mine),
  });
}

export function useBlfLamps(panelId?: string) {
  return useQuery({
    queryKey: queryKeys.tenant.blfLamps(panelId ?? ''),
    queryFn: () => receptionRepository.getBlfLamps(panelId!),
    enabled: Boolean(panelId),
    refetchInterval: 5_000,
  });
}

export function useReceptionActions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (action: {
      type: 'park' | 'retrieve' | 'directedPickup' | 'groupPickup' | 'hold' | 'mute' | 'transfer' | 'hangup' | 'presence';
      payload: Record<string, unknown>;
    }) => {
      switch (action.type) {
        case 'park':
          return receptionRepository.park(action.payload);
        case 'retrieve':
          return receptionRepository.retrieve(action.payload);
        case 'directedPickup':
          return receptionRepository.directedPickup(action.payload);
        case 'groupPickup':
          return receptionRepository.groupPickup(action.payload);
        case 'hold':
          return receptionRepository.hold(action.payload);
        case 'mute':
          return receptionRepository.mute(action.payload);
        case 'transfer':
          return receptionRepository.transfer(action.payload);
        case 'hangup':
          return receptionRepository.hangup(action.payload);
        case 'presence':
          return receptionRepository.setPresence(action.payload);
      }
    },
    onSuccess: () => invalidateReception(qc),
  });
}

export function useContactMutations() {
  const qc = useQueryClient();
  const invalidate = () => invalidateReception(qc);

  const create = useMutation({
    mutationFn: receptionRepository.createContact,
    onSuccess: invalidate,
  });
  const update = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) =>
      receptionRepository.updateContact(id, payload),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: receptionRepository.deleteContact,
    onSuccess: invalidate,
  });
  return { create, update, remove };
}
