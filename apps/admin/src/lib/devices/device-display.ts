import type { ActivityEvent } from '../hooks/queries/use-extension-activity';

export type RegistrationBadge = {
  emoji: string;
  label: string;
  tone: 'success' | 'warning' | 'destructive' | 'muted';
};

export type DeviceDetailField = {
  id: string;
  label: string;
  value: string;
  mono?: boolean;
};

const DEVICE_ACTIVITY_PREFIXES = ['pbx.device.', 'pbx.provision.'];

const DEVICE_ACTIVITY_LABELS: Record<string, string> = {
  'pbx.device.reprovision': 'Last Provisioned',
  'pbx.provision.commit': 'Last Provisioned',
  'pbx.device.enroll': 'Device Added',
  'pbx.device.create': 'Device Added',
  'pbx.device.create.enroll': 'Device Added',
  'pbx.device.delete': 'Device Removed',
  'pbx.device.reset': 'Provisioning Reset',
  'pbx.device.clear': 'Provisioning Cleared',
  'pbx.device.config_rollback': 'Provisioning Rolled Back',
};

export function formatManufacturerLabel(manufacturer: unknown): string | null {
  const raw = String(manufacturer ?? '').trim();
  if (!raw) return null;
  return raw.charAt(0) + raw.slice(1).toLowerCase();
}

export function formatDeviceTypeLabel(deviceType: unknown): string | null {
  const raw = String(deviceType ?? '').trim();
  if (!raw) return null;
  return raw
    .split('_')
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(' ');
}

export function formatDateTime(value: unknown): string | null {
  if (value == null || value === '') return null;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString();
}

export function getProvisioningStatusLabel(status: unknown): string | null {
  const raw = String(status ?? '').trim().toUpperCase();
  if (!raw) return null;
  const labels: Record<string, string> = {
    PENDING: 'Pending',
    PROVISIONING: 'Provisioning',
    PROVISIONED: 'Provisioned',
    FAILED: 'Failed',
    QUARANTINED: 'Quarantined',
  };
  return labels[raw] ?? null;
}

export function getSipRegistrationState(device: Record<string, unknown>): string | null {
  const sip = device.sipEndpoint as { registrationStatus?: string } | undefined;
  const raw = String(sip?.registrationStatus ?? '').trim().toUpperCase();
  if (!raw) return null;
  const labels: Record<string, string> = {
    REGISTERED: 'Registered',
    UNREGISTERED: 'Unregistered',
  };
  return labels[raw] ?? raw.charAt(0) + raw.slice(1).toLowerCase();
}

/** Maps backend registration/provisioning values to operator-friendly badges. */
export function getRegistrationBadge(device: Record<string, unknown>): RegistrationBadge {
  const sip = device.sipEndpoint as
    | { registrationStatus?: string; lastRegisteredAt?: string | null }
    | undefined;
  const regStatus = String(sip?.registrationStatus ?? '').toUpperCase();
  const provStatus = String(device.provisioningStatus ?? '').toUpperCase();
  const deviceStatus = String(device.status ?? '').toUpperCase();
  const lastRegisteredAt = sip?.lastRegisteredAt;

  if (regStatus === 'REGISTERED' || deviceStatus === 'ONLINE' || deviceStatus === 'REGISTERED') {
    return { emoji: '🟢', label: 'Online', tone: 'success' };
  }

  if (provStatus === 'FAILED' || deviceStatus === 'OFFLINE' || deviceStatus === 'INACTIVE') {
    return { emoji: '🔴', label: 'Offline', tone: 'destructive' };
  }

  if (
    provStatus === 'PROVISIONED' ||
    provStatus === 'PROVISIONING' ||
    deviceStatus === 'PROVISIONING'
  ) {
    return { emoji: '🟡', label: 'Provisioned – Waiting for Registration', tone: 'warning' };
  }

  if (regStatus === 'UNREGISTERED' && !lastRegisteredAt) {
    return { emoji: '⚪', label: 'Never Registered', tone: 'muted' };
  }

  if (regStatus === 'UNREGISTERED' && lastRegisteredAt) {
    return { emoji: '🔴', label: 'Offline', tone: 'destructive' };
  }

  if (!regStatus && !provStatus && !deviceStatus) {
    return { emoji: '⚪', label: 'Unknown', tone: 'muted' };
  }

  return { emoji: '⚪', label: 'Unknown', tone: 'muted' };
}

export function registrationBadgeClassName(tone: RegistrationBadge['tone']): string {
  const map = {
    success: 'text-emerald-700 dark:text-emerald-400',
    warning: 'text-amber-700 dark:text-amber-400',
    destructive: 'text-destructive',
    muted: 'text-muted-foreground',
  };
  return map[tone];
}

function readConfigVersion(device: Record<string, unknown>): string | null {
  const meta = device.provisioningMeta as { configVersion?: number | null } | undefined;
  if (meta?.configVersion != null) return String(meta.configVersion);
  if (device.configVersion != null && device.configVersion !== '') return String(device.configVersion);
  if (device.version != null && device.version !== '') return String(device.version);
  return null;
}

function readFirmwareVersion(device: Record<string, unknown>): string | null {
  const raw = device.firmwareVersion;
  if (raw == null || raw === '') return null;
  return String(raw);
}

function readProvUrl(device: Record<string, unknown>): string | null {
  const raw = device.provUrl;
  if (raw == null || raw === '') return null;
  return String(raw);
}

/** Builds detail rows for the Current Device card; omits empty values. */
export function buildDeviceDetailFields(
  lineDevice: Record<string, unknown>,
  enrichedDevice: Record<string, unknown> | null,
): DeviceDetailField[] {
  const merged = enrichedDevice ? { ...lineDevice, ...enrichedDevice } : lineDevice;
  const fields: DeviceDetailField[] = [];

  const manufacturer = formatManufacturerLabel(merged.manufacturer);
  if (manufacturer) fields.push({ id: 'manufacturer', label: 'Manufacturer', value: manufacturer });

  const model = String(merged.model ?? '').trim();
  if (model) fields.push({ id: 'model', label: 'Model', value: model });

  const deviceType = formatDeviceTypeLabel(merged.deviceType);
  if (deviceType) fields.push({ id: 'deviceType', label: 'Device Type', value: deviceType });

  const mac = String(merged.macAddress ?? '').trim();
  if (mac) fields.push({ id: 'mac', label: 'MAC Address', value: mac, mono: true });

  const provisioningStatus = getProvisioningStatusLabel(merged.provisioningStatus);
  if (provisioningStatus) {
    fields.push({ id: 'provisioningStatus', label: 'Provisioning Status', value: provisioningStatus });
  }

  if (typeof merged.isPrimary === 'boolean') {
    fields.push({
      id: 'primary',
      label: 'Primary Device',
      value: merged.isPrimary ? 'Yes' : 'No',
    });
  }

  const lastSeen = formatDateTime(merged.lastSeenAt);
  if (lastSeen) fields.push({ id: 'lastSeen', label: 'Last Seen', value: lastSeen });

  const firmware = readFirmwareVersion(merged);
  if (firmware) fields.push({ id: 'firmware', label: 'Firmware Version', value: firmware });

  const configVersion = readConfigVersion(merged);
  if (configVersion) {
    fields.push({ id: 'configVersion', label: 'Configuration Version', value: configVersion });
  }

  const provUrl = readProvUrl(merged);
  if (provUrl) fields.push({ id: 'provUrl', label: 'Provisioning URL', value: provUrl, mono: true });

  const sipState = getSipRegistrationState(merged);
  if (sipState) fields.push({ id: 'sipState', label: 'SIP Registration State', value: sipState });

  const lastProvisioned = formatDateTime(merged.lastProvisionedAt);
  if (lastProvisioned) {
    fields.push({ id: 'lastProvisioned', label: 'Last Provisioned', value: lastProvisioned });
  }

  return fields;
}

export function filterDeviceActivityEvents(events: ActivityEvent[]): ActivityEvent[] {
  return events
    .filter((event) => DEVICE_ACTIVITY_PREFIXES.some((prefix) => event.action.startsWith(prefix)))
    .map((event) => ({
      ...event,
      label: DEVICE_ACTIVITY_LABELS[event.action] ?? event.label,
    }))
    .slice(0, 5);
}
