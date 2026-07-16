/** Shared helpers for multi-device SIPEndpoint resolution. */

export type DeviceWithAssignments = {
  id: string;
  lineId: string | null;
  deletedAt: Date | null;
  assignments?: Array<{
    tenantId: string;
    lineId: string | null;
    effectiveTo: Date | null;
    deletedAt: Date | null;
  }>;
};

export function activeDevices<T extends DeviceWithAssignments>(devices: T[] | undefined | null): T[] {
  return (devices ?? []).filter((d) => !d.deletedAt);
}

/** Prefer explicit deviceId, else a device with active assignment, else first line-bound device. */
export function pickRegistrableDevice<T extends DeviceWithAssignments>(
  devices: T[] | undefined | null,
  preferredDeviceId?: string,
): T | null {
  const list = activeDevices(devices);
  if (!list.length) return null;
  if (preferredDeviceId) {
    return list.find((d) => d.id === preferredDeviceId) ?? null;
  }
  const withAssignment = list.find((d) =>
    (d.assignments ?? []).some((a) => !a.deletedAt && a.effectiveTo == null),
  );
  return withAssignment ?? list.find((d) => Boolean(d.lineId)) ?? list[0] ?? null;
}

export function hasActiveAssignment(device: DeviceWithAssignments): boolean {
  return (device.assignments ?? []).some((a) => !a.deletedAt && a.effectiveTo == null);
}
