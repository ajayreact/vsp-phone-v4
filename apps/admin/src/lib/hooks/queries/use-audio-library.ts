'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../query/query-keys';
import { ivrRoutingRepository } from '../../repositories/ivr-routing.repository';

function invalidateAudio(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ['tenant', 'announcements'] });
  void qc.invalidateQueries({ queryKey: ['tenant', 'moh-playlists'] });
  void qc.invalidateQueries({ queryKey: ['tenant', 'audio-reports'] });
  void qc.invalidateQueries({ queryKey: ['tenant', 'moh-assignments'] });
}

export function useAudioReports() {
  return useQuery({
    queryKey: queryKeys.tenant.audioReports(),
    queryFn: () => ivrRoutingRepository.getAudioReports(),
  });
}

export function useMohAssignments() {
  return useQuery({
    queryKey: queryKeys.tenant.mohAssignments(),
    queryFn: () => ivrRoutingRepository.getMohAssignments(),
  });
}

export function useMohPlaylists(scope?: string, language?: string) {
  return useQuery({
    queryKey: queryKeys.tenant.mohPlaylists(scope, language),
    queryFn: () => ivrRoutingRepository.getMohPlaylists(scope, language).then((r) => r.data),
  });
}

export function useMohPlaylist(id?: string) {
  return useQuery({
    queryKey: queryKeys.tenant.mohPlaylist(id ?? ''),
    queryFn: () => ivrRoutingRepository.getMohPlaylist(id!),
    enabled: Boolean(id),
  });
}

export function useMohPlaylistVersions(id?: string) {
  return useQuery({
    queryKey: queryKeys.tenant.mohPlaylistVersions(id ?? ''),
    queryFn: () => ivrRoutingRepository.getMohPlaylistVersions(id!).then((r) => r.data),
    enabled: Boolean(id),
  });
}

export function useAnnouncementVersions(id?: string) {
  return useQuery({
    queryKey: queryKeys.tenant.announcementVersions(id ?? ''),
    queryFn: () => ivrRoutingRepository.getAnnouncementVersions(id!).then((r) => r.data),
    enabled: Boolean(id),
  });
}

export function useCreateMohPlaylist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) => ivrRoutingRepository.createMohPlaylist(payload),
    onSuccess: () => invalidateAudio(qc),
  });
}

export function useUpdateMohPlaylist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) =>
      ivrRoutingRepository.updateMohPlaylist(id, payload),
    onSuccess: (_d, v) => {
      invalidateAudio(qc);
      void qc.invalidateQueries({ queryKey: queryKeys.tenant.mohPlaylist(v.id) });
    },
  });
}

export function useDeleteMohPlaylist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => ivrRoutingRepository.deleteMohPlaylist(id),
    onSuccess: () => invalidateAudio(qc),
  });
}

export function useCreateMohTrack() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) => ivrRoutingRepository.createMohTrack(payload),
    onSuccess: () => invalidateAudio(qc),
  });
}

export function useDeleteMohTrack() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => ivrRoutingRepository.deleteMohTrack(id),
    onSuccess: () => invalidateAudio(qc),
  });
}

export function usePresignAudioUpload() {
  return useMutation({
    mutationFn: (payload: { filename: string; contentType?: string }) =>
      ivrRoutingRepository.presignAudioUpload(payload),
  });
}

export function useAnnouncementPreview() {
  return useMutation({
    mutationFn: (id: string) => ivrRoutingRepository.getAnnouncementPreview(id),
  });
}

export function useMohTrackPreview() {
  return useMutation({
    mutationFn: (trackId: string) => ivrRoutingRepository.getMohTrackPreview(trackId),
  });
}

export function useReplaceAnnouncement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) =>
      ivrRoutingRepository.replaceAnnouncement(id, payload),
    onSuccess: () => invalidateAudio(qc),
  });
}

export function useUpdateAnnouncement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) =>
      ivrRoutingRepository.updateAnnouncement(id, payload),
    onSuccess: () => invalidateAudio(qc),
  });
}
