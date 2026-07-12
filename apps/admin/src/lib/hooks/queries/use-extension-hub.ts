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
  | 'overview'
  | 'general'
  | 'phone'
  | 'mobile'
  | 'desk'
  | 'voicemail'
  | 'callHandling'
  | 'advanced';

/** Form state for ExtensionConfigureDrawer — hydrated from GET /extensions/:id */
export type ExtensionConfigureFormState = {
  displayName: string;
  description: string;
  departmentId: string;
  linkedUserId: string;
  callerIdName: string;
  pin: string;
  callForwardEnabled: boolean;
  callForwardDestination: string;
  dndEnabled: boolean;
  voicemailNotifyEmail: string;
  recordingEnabled: boolean;
  selectedDidId: string;
};

export function mapExtensionDetailToForm(
  row: ExtensionHubRow,
  detail: Record<string, unknown>,
): ExtensionConfigureFormState {
  const line = detail.line as Record<string, unknown> | undefined;
  const ts = line?.telephonySettings as Record<string, unknown> | undefined;
  const callerId = line?.callerId as Record<string, unknown> | undefined;
  const recordingPolicy = line?.recordingPolicy as Record<string, unknown> | undefined;
  const user = line?.user as { id?: string } | undefined;
  const dept = detail.department as { id?: string; name?: string } | null | undefined;
  const vm = line?.voicemail as { pin?: string | null } | undefined;
  const phoneNumbers = line?.phoneNumbers as { id?: string }[] | undefined;
  const didFromLine = phoneNumbers?.[0]?.id ?? (callerId?.phoneNumber as { id?: string } | undefined)?.id;

  return {
    displayName: String(line?.name ?? row.displayName),
    description: detail.description != null ? String(detail.description) : (row.description ?? ''),
    departmentId: dept?.id ?? row.department?.id ?? '',
    linkedUserId: user?.id ?? row.linkedUser?.id ?? '',
    callerIdName: callerId?.callerIdName != null ? String(callerId.callerIdName) : '',
    pin: ts?.pin != null ? String(ts.pin) : vm?.pin != null ? String(vm.pin) : '',
    callForwardEnabled: Boolean(ts?.callForwardEnabled),
    callForwardDestination: ts?.callForwardDestination != null ? String(ts.callForwardDestination) : '',
    dndEnabled: Boolean(ts?.dndEnabled),
    voicemailNotifyEmail: ts?.voicemailNotifyEmail != null ? String(ts.voicemailNotifyEmail) : '',
    recordingEnabled: Boolean(recordingPolicy?.recordingEnabled),
    selectedDidId: row.did?.id ?? didFromLine ?? '',
  };
}

export function extensionDetailMatchesRow(
  detail: Record<string, unknown> | undefined,
  extensionId: string,
): detail is Record<string, unknown> {
  if (!detail || !extensionId) return false;
  const detailId = detail.id != null ? String(detail.id) : '';
  return !detailId || detailId === extensionId;
}

export function useExtensionDetail(id: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.tenant.extensionDetail(id),
    queryFn: ({ signal }) => tenantRepository.getExtension(id, signal),
    enabled: enabled && Boolean(id),
  });
}
