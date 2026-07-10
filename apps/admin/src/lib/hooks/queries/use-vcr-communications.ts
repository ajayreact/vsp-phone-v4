'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../query/query-keys';
import {
  type RecordingSearchParams,
  type VoicemailMessageSearchParams,
  vcrCommunicationsRepository,
} from '../../repositories/vcr-communications.repository';

function invalidateVcr(qc: ReturnType<typeof useQueryClient>, keys: string[]) {
  for (const key of keys) {
    void qc.invalidateQueries({ queryKey: ['tenant', key] });
  }
}

// Voicemail
export function useVoicemailMailboxes(search?: string) {
  return useQuery({
    queryKey: queryKeys.tenant.voicemail(search),
    queryFn: () => vcrCommunicationsRepository.listVoicemail(search),
  });
}

export function useVoicemailMailbox(id?: string) {
  return useQuery({
    queryKey: queryKeys.tenant.voicemailDetail(id ?? ''),
    queryFn: () => vcrCommunicationsRepository.getVoicemail(id!),
    enabled: Boolean(id),
  });
}

export function useVoicemailReports(days = 30) {
  return useQuery({
    queryKey: queryKeys.tenant.voicemailReports(days),
    queryFn: () => vcrCommunicationsRepository.getVoicemailReports(days),
  });
}

export function useVoicemailMessages(voicemailId?: string, params?: VoicemailMessageSearchParams) {
  return useQuery({
    queryKey: queryKeys.tenant.voicemailMessages(voicemailId ?? '', params),
    queryFn: () => vcrCommunicationsRepository.listVoicemailMessages(voicemailId!, params).then((r) => r.data),
    enabled: Boolean(voicemailId),
  });
}

export function useCreateVoicemailMailbox() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: vcrCommunicationsRepository.createVoicemail,
    onSuccess: () => invalidateVcr(qc, ['voicemail']),
  });
}

export function useUpdateVoicemailMailbox() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) =>
      vcrCommunicationsRepository.updateVoicemail(id, payload),
    onSuccess: () => invalidateVcr(qc, ['voicemail']),
  });
}

export function useDeleteVoicemailMailbox() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: vcrCommunicationsRepository.deleteVoicemail,
    onSuccess: () => invalidateVcr(qc, ['voicemail']),
  });
}

export function useVoicemailMessagePlayback() {
  return useMutation({
    mutationFn: ({ voicemailId, messageId }: { voicemailId: string; messageId: string }) =>
      vcrCommunicationsRepository.getVoicemailMessagePlayback(voicemailId, messageId),
  });
}

export function useVoicemailMessageActions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (action: {
      type: 'update' | 'delete' | 'restore' | 'bulkDelete' | 'bulkRead' | 'bulkUnread';
      messageId?: string;
      messageIds?: string[];
      payload?: Record<string, unknown>;
    }) => {
      switch (action.type) {
        case 'update':
          return vcrCommunicationsRepository.updateVoicemailMessage(action.messageId!, action.payload ?? {});
        case 'delete':
          return vcrCommunicationsRepository.deleteVoicemailMessage(action.messageId!);
        case 'restore':
          return vcrCommunicationsRepository.restoreVoicemailMessage(action.messageId!);
        case 'bulkDelete':
          return vcrCommunicationsRepository.bulkDeleteVoicemailMessages(action.messageIds ?? []);
        case 'bulkRead':
          return vcrCommunicationsRepository.bulkMarkVoicemailRead(action.messageIds ?? [], true);
        case 'bulkUnread':
          return vcrCommunicationsRepository.bulkMarkVoicemailRead(action.messageIds ?? [], false);
      }
    },
    onSuccess: () => invalidateVcr(qc, ['voicemail', 'voicemail-messages']),
  });
}

// Conferences
export function useConferences(search?: string) {
  return useQuery({
    queryKey: queryKeys.tenant.conferences(search),
    queryFn: () => vcrCommunicationsRepository.listConferences(search),
    refetchInterval: 15_000,
  });
}

export function useConference(id?: string) {
  return useQuery({
    queryKey: queryKeys.tenant.conference(id ?? ''),
    queryFn: () => vcrCommunicationsRepository.getConference(id!),
    enabled: Boolean(id),
  });
}

export function useConferenceLive(id?: string) {
  return useQuery({
    queryKey: queryKeys.tenant.conferenceLive(id ?? ''),
    queryFn: () => vcrCommunicationsRepository.getConferenceLive(id!),
    enabled: Boolean(id),
    refetchInterval: 5_000,
  });
}

export function useConferenceReports(days = 30) {
  return useQuery({
    queryKey: queryKeys.tenant.conferenceReports(days),
    queryFn: () => vcrCommunicationsRepository.getConferenceReports(days),
  });
}

export function useCreateConference() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: vcrCommunicationsRepository.createConference,
    onSuccess: () => invalidateVcr(qc, ['conferences']),
  });
}

export function useUpdateConference() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) =>
      vcrCommunicationsRepository.updateConference(id, payload),
    onSuccess: () => invalidateVcr(qc, ['conferences']),
  });
}

export function useCloneConference() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: { name: string; code: string } }) =>
      vcrCommunicationsRepository.cloneConference(id, payload),
    onSuccess: () => invalidateVcr(qc, ['conferences']),
  });
}

export function useDeleteConference() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: vcrCommunicationsRepository.deleteConference,
    onSuccess: () => invalidateVcr(qc, ['conferences']),
  });
}

export function useConferenceParticipantActions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (action: {
      type: 'update' | 'remove';
      conferenceId: string;
      participantId: string;
      payload?: Record<string, unknown>;
    }) => {
      if (action.type === 'remove') {
        return vcrCommunicationsRepository.removeConferenceParticipant(action.conferenceId, action.participantId);
      }
      return vcrCommunicationsRepository.updateConferenceParticipant(
        action.conferenceId,
        action.participantId,
        action.payload ?? {},
      );
    },
    onSuccess: () => invalidateVcr(qc, ['conferences']),
  });
}

// Recordings
export function useTenantRecordingsSearch(params?: RecordingSearchParams) {
  return useQuery({
    queryKey: queryKeys.tenant.recordings(params as Record<string, string | number | boolean | undefined>),
    queryFn: () => vcrCommunicationsRepository.searchRecordings(params),
  });
}

export function useRecordingDetail(id?: string) {
  return useQuery({
    queryKey: queryKeys.tenant.recording(id ?? ''),
    queryFn: () => vcrCommunicationsRepository.getRecording(id!),
    enabled: Boolean(id),
  });
}

export function useRecordingReports(days = 30) {
  return useQuery({
    queryKey: queryKeys.tenant.recordingReports(days),
    queryFn: () => vcrCommunicationsRepository.getRecordingReports(days),
  });
}

export function useRecordingPolicies() {
  return useQuery({
    queryKey: queryKeys.tenant.recordingPolicies(),
    queryFn: () => vcrCommunicationsRepository.listRecordingPolicies(),
  });
}

export function useTenantRecordingPlayback() {
  return useMutation({
    mutationFn: (id: string) => vcrCommunicationsRepository.getRecordingPlayback(id),
  });
}

export function useRecordingActions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (action: {
      type: 'update' | 'annotate' | 'delete' | 'bulkDelete';
      id?: string;
      ids?: string[];
      payload?: Record<string, unknown>;
    }) => {
      switch (action.type) {
        case 'update':
          return vcrCommunicationsRepository.updateRecording(action.id!, action.payload ?? {});
        case 'annotate':
          return vcrCommunicationsRepository.annotateRecording(action.id!, action.payload ?? {});
        case 'delete':
          return vcrCommunicationsRepository.deleteRecording(action.id!);
        case 'bulkDelete':
          return vcrCommunicationsRepository.bulkDeleteRecordings(action.ids ?? []);
      }
    },
    onSuccess: () => invalidateVcr(qc, ['recordings', 'recording-policies']),
  });
}

export function useCreateRecordingPolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: vcrCommunicationsRepository.createRecordingPolicy,
    onSuccess: () => invalidateVcr(qc, ['recording-policies']),
  });
}

export function useUpdateRecordingPolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) =>
      vcrCommunicationsRepository.updateRecordingPolicy(id, payload),
    onSuccess: () => invalidateVcr(qc, ['recording-policies']),
  });
}

export function useDeleteRecordingPolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: vcrCommunicationsRepository.deleteRecordingPolicy,
    onSuccess: () => invalidateVcr(qc, ['recording-policies']),
  });
}
