import { deviceRepository } from '../repositories/device.repository';

export function normalizeMac(mac: string): string {
  return mac.replace(/[^a-fA-F0-9]/g, '').toLowerCase().slice(0, 12);
}

export function isValidMac(mac: string): boolean {
  return /^[a-f0-9]{12}$/.test(normalizeMac(mac));
}

export type MacCheckStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'same_extension'
  | 'other_extension'
  | 'invalid';

export type MacCheckResult = {
  status: MacCheckStatus;
  message?: string;
  extension?: string;
  extensionLabel?: string;
};

type MacCheckContext = {
  lineId: string;
  extension: string;
};

function deviceLineId(device: Record<string, unknown>): string {
  const line = device.line as { id?: string } | undefined;
  return String(line?.id ?? device.lineId ?? '');
}

function deviceExtensionNumber(device: Record<string, unknown>): string {
  const line = device.line as { extension?: { extension?: string } } | undefined;
  return String(line?.extension?.extension ?? '');
}

function deviceExtensionLabel(device: Record<string, unknown>): string {
  const line = device.line as { name?: string; extension?: { extension?: string } } | undefined;
  const ext = String(line?.extension?.extension ?? '').trim();
  const name = String(line?.name ?? '').trim();
  if (ext && name) return `Extension ${ext} (${name})`;
  if (ext) return `Extension ${ext}`;
  return 'another extension';
}

/** Client-side MAC lookup via GET /v1/tenant/devices?search= (no dedicated check-mac API). */
export async function checkMac(mac: string, context: MacCheckContext): Promise<MacCheckResult> {
  const normalized = normalizeMac(mac);
  if (!normalized) return { status: 'idle' };
  if (normalized.length < 12) return { status: 'idle' };
  if (!isValidMac(mac)) {
    return { status: 'invalid', message: 'Enter a valid 12-character MAC address.' };
  }

  const rows = await deviceRepository.listDevices(normalized);
  const match = rows.find((d) => normalizeMac(String(d.macAddress ?? '')) === normalized);
  if (!match) {
    return { status: 'available', message: 'MAC address available.' };
  }

  const matchLineId = deviceLineId(match);
  const matchExt = deviceExtensionNumber(match);
  const matchLabel = deviceExtensionLabel(match);

  if (matchLineId === context.lineId) {
    return {
      status: 'same_extension',
      message: 'This phone is already assigned to this extension.',
      extension: matchExt || context.extension,
      extensionLabel: matchLabel,
    };
  }

  return {
    status: 'other_extension',
    message: `This phone is currently assigned to ${matchLabel}.`,
    extension: matchExt,
    extensionLabel: matchLabel,
  };
}

export function macCheckAllowsSubmit(result: MacCheckResult): boolean {
  return result.status === 'available';
}

export function macCheckBlocksSubmit(result: MacCheckResult): boolean {
  return (
    result.status === 'checking' ||
    result.status === 'same_extension' ||
    result.status === 'other_extension' ||
    result.status === 'invalid'
  );
}
