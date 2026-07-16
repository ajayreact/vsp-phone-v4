'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { deviceRepository } from '../../repositories/device.repository';
import { queryKeys } from '../../query/query-keys';

function invalidateDeviceQueries(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ['tenant', 'devices'] });
  void qc.invalidateQueries({ queryKey: ['tenant', 'provisioning'] });
}

export function useTenantDevice(id: string | null) {
  return useQuery({
    queryKey: queryKeys.tenant.device(id ?? ''),
    queryFn: () => deviceRepository.getDevice(id!),
    enabled: Boolean(id),
  });
}

export function useTenantFirmware() {
  return useQuery({
    queryKey: queryKeys.tenant.firmware(),
    queryFn: () => deviceRepository.listFirmware(),
  });
}

export function useTenantProvisioningTemplates() {
  return useQuery({
    queryKey: queryKeys.tenant.provisioningTemplates(),
    queryFn: () => deviceRepository.listTemplates(),
  });
}

export function useCreateTenantDevice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deviceRepository.createDevice,
    onSuccess: () => invalidateDeviceQueries(qc),
  });
}

export function useUpdateTenantDevice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) =>
      deviceRepository.updateDevice(id, payload),
    onSuccess: () => invalidateDeviceQueries(qc),
  });
}

export function useDeleteTenantDevice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deviceRepository.deleteDevice,
    onSuccess: () => invalidateDeviceQueries(qc),
  });
}

export function useAssignTenantDevice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, lineId }: { id: string; lineId: string }) => deviceRepository.assignDevice(id, lineId),
    onSuccess: () => invalidateDeviceQueries(qc),
  });
}

export function useBulkImportDevices() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deviceRepository.bulkImport,
    onSuccess: () => invalidateDeviceQueries(qc),
  });
}

export function useBulkAssignDevices() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ deviceIds, lineId }: { deviceIds: string[]; lineId: string }) =>
      deviceRepository.bulkAssign(deviceIds, lineId),
    onSuccess: () => invalidateDeviceQueries(qc),
  });
}

export function useBulkDeleteDevices() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deviceRepository.bulkDelete,
    onSuccess: () => invalidateDeviceQueries(qc),
  });
}

export function useEnrollDevice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deviceRepository.enroll,
    onSuccess: () => invalidateDeviceQueries(qc),
  });
}

export function useReprovisionDevice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deviceRepository.reprovision,
    onSuccess: () => invalidateDeviceQueries(qc),
  });
}

export function useRebootDevice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deviceRepository.rebootDevice,
    onSuccess: () => invalidateDeviceQueries(qc),
  });
}

export function useRollbackDeviceConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ deviceId, targetConfigVersion }: { deviceId: string; targetConfigVersion: number }) =>
      deviceRepository.rollback(deviceId, targetConfigVersion),
    onSuccess: () => invalidateDeviceQueries(qc),
  });
}

export function useBulkProvisionDevices() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deviceRepository.bulkProvision,
    onSuccess: () => invalidateDeviceQueries(qc),
  });
}

export function useBulkRebootDevices() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deviceRepository.bulkReboot,
    onSuccess: () => invalidateDeviceQueries(qc),
  });
}

export function useBulkFactoryResetDevices() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deviceRepository.bulkFactoryReset,
    onSuccess: () => invalidateDeviceQueries(qc),
  });
}

export function useCreateProvisioningTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deviceRepository.createTemplate,
    onSuccess: () => invalidateDeviceQueries(qc),
  });
}

export function useDeleteProvisioningTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deviceRepository.deleteTemplate,
    onSuccess: () => invalidateDeviceQueries(qc),
  });
}

export function useApproveFirmware() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ releaseId, rolloutPercent }: { releaseId: string; rolloutPercent?: number }) =>
      deviceRepository.approveFirmware(releaseId, rolloutPercent),
    onSuccess: () => invalidateDeviceQueries(qc),
  });
}
