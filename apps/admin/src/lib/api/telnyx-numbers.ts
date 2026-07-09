import {
  mockTelnyxNumbers,
  summarizeTelnyxInventory,
  type TelnyxNumber,
  type TelnyxInventorySummary,
} from '../mock/telecom';

/** Adapter — replace with GET /v1/telnyx/numbers when backend is ready. */

export async function fetchTelnyxNumbers(): Promise<TelnyxNumber[]> {
  await delay(350);
  return [...mockTelnyxNumbers];
}

export async function fetchTelnyxSummary(): Promise<TelnyxInventorySummary> {
  const numbers = await fetchTelnyxNumbers();
  return summarizeTelnyxInventory(numbers);
}

export async function assignNumberToTenant(
  numberId: string,
  tenantName: string,
  assignedTo: string,
): Promise<TelnyxNumber | null> {
  await delay(200);
  const n = mockTelnyxNumbers.find((x) => x.id === numberId);
  if (!n) return null;
  n.status = 'assigned';
  n.assignedTenant = tenantName;
  n.assignedTo = assignedTo;
  return { ...n };
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
