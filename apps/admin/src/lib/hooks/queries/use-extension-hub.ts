'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../query/query-keys';
import { tenantRepository } from '../../repositories/tenant.repository';

export type ExtensionHubStatus = 'Registered' | 'Provisioned' | 'NoDevice' | 'RegistrationFailed';

export type ExtensionHubStats = {
  totalExtensions: number;
  assignedDids: number;
  registeredDevices: number;
  offlineDevices: number;
  unassignedExtensions: number;
  mobileApps: number;
  deskPhones: number;
};

export type ExtensionHubRow = {
  id: string;
  lineId: string;
  extension: string;
  displayName: string;
  label: string;
  description: string | null;
  department: { id: string; name: string } | null;
  did: { id: string; number: string; formatted: string } | null;
  device: {
    id: string;
    name: string;
    deviceType: string;
    manufacturer: string | null;
    model: string | null;
    registrationStatus: string;
    deviceLabel: string;
  } | null;
  hasMobileApp: boolean;
  hasDeskPhone: boolean;
  status: ExtensionHubStatus;
  statusLabel: string;
  onlineStatus: 'Online' | 'Offline';
  registrationLabel: string;
  lastCallAt: string | null;
  lastCallRelative: string | null;
  linkedUser: { id: string; email: string; displayName: string | null } | null;
};

export type ExtensionMobileQrResult = {
  extensionId: string;
  extension: string;
  displayName?: string;
  label?: string;
  deviceId: string;
  deepLink: string;
  qrDataUrl: string;
  expiresAt: string;
  expiresInMinutes: number;
  supports: { webrtc: boolean; nativeApp: boolean };
};

const HUB_POLL_MS = 15_000;

export function useExtensionHub(search?: string) {
  return useQuery({
    queryKey: queryKeys.tenant.extensionHub(search),
    queryFn: () => tenantRepository.listExtensionHub(search),
    refetchInterval: HUB_POLL_MS,
  });
}

export function useExtensionHubStats() {
  return useQuery({
    queryKey: queryKeys.tenant.extensionHubStats(),
    queryFn: () => tenantRepository.getExtensionHubStats(),
    refetchInterval: HUB_POLL_MS,
  });
}

export function useRenameExtensionDisplayName() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      displayName,
      description,
      departmentId,
    }: {
      id: string;
      displayName: string;
      description?: string;
      departmentId?: string;
    }) => tenantRepository.renameExtensionDisplayName(id, { displayName, description, departmentId }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tenant', 'extensionHub'] });
      void qc.invalidateQueries({ queryKey: ['tenant', 'extensions'] });
    },
  });
}

export function useExtensionMobileQr() {
  return useMutation({
    mutationFn: (id: string) => tenantRepository.createExtensionMobileQr(id),
  });
}

export function useExtensionUnassignDid() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => tenantRepository.unassignExtensionDid(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['tenant', 'extensionHub'] }),
  });
}

export function useExtensionRestartRegistration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => tenantRepository.restartExtensionRegistration(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['tenant', 'extensionHub'] }),
  });
}

export type ConfigureTabId =
  | 'general'
  | 'phone'
  | 'mobile'
  | 'desk'
  | 'voicemail'
  | 'callForward'
  | 'recording'
  | 'security'
  | 'advanced';
