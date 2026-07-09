/** Telnyx phone number inventory — mock adapter until REST CRUD is available. */

export type TelnyxNumberStatus = 'available' | 'assigned' | 'pending' | 'porting' | 'released';
export type TelnyxNumberType = 'local' | 'toll-free' | 'mobile';

export type TelnyxNumber = {
  id: string;
  number: string;
  e164: string;
  type: TelnyxNumberType;
  status: TelnyxNumberStatus;
  capabilities: string[];
  assignedTenant: string | null;
  assignedTo: string | null;
  monthlyCost: number;
  purchasedAt: string;
  region: string;
  telnyxConnectionId: string;
  trunkGroup: string;
};

export const mockTelnyxNumbers: TelnyxNumber[] = [
  {
    id: 'tn-1',
    number: '+1 (415) 555-0100',
    e164: '+14155550100',
    type: 'local',
    status: 'assigned',
    capabilities: ['voice', 'sms'],
    assignedTenant: 'Acme Corp',
    assignedTo: 'Main IVR',
    monthlyCost: 1.0,
    purchasedAt: '2025-11-12',
    region: 'US-CA',
    telnyxConnectionId: 'conn_abc123',
    trunkGroup: 'Telnyx Primary',
  },
  {
    id: 'tn-2',
    number: '+1 (415) 555-0101',
    e164: '+14155550101',
    type: 'local',
    status: 'assigned',
    capabilities: ['voice'],
    assignedTenant: 'Acme Corp',
    assignedTo: 'Sales Queue',
    monthlyCost: 1.0,
    purchasedAt: '2025-11-12',
    region: 'US-CA',
    telnyxConnectionId: 'conn_abc123',
    trunkGroup: 'Telnyx Primary',
  },
  {
    id: 'tn-3',
    number: '+1 (800) 555-0199',
    e164: '+18005550199',
    type: 'toll-free',
    status: 'assigned',
    capabilities: ['voice'],
    assignedTenant: 'Globex Inc',
    assignedTo: 'Support',
    monthlyCost: 2.0,
    purchasedAt: '2025-10-01',
    region: 'US',
    telnyxConnectionId: 'conn_def456',
    trunkGroup: 'Telnyx Primary',
  },
  {
    id: 'tn-4',
    number: '+1 (628) 555-0200',
    e164: '+16285550200',
    type: 'local',
    status: 'available',
    capabilities: ['voice', 'sms', 'mms'],
    assignedTenant: null,
    assignedTo: null,
    monthlyCost: 1.0,
    purchasedAt: '2026-01-15',
    region: 'US-CA',
    telnyxConnectionId: 'conn_abc123',
    trunkGroup: 'Telnyx Primary',
  },
  {
    id: 'tn-5',
    number: '+1 (628) 555-0201',
    e164: '+16285550201',
    type: 'local',
    status: 'available',
    capabilities: ['voice'],
    assignedTenant: null,
    assignedTo: null,
    monthlyCost: 1.0,
    purchasedAt: '2026-01-15',
    region: 'US-CA',
    telnyxConnectionId: 'conn_abc123',
    trunkGroup: 'Telnyx Primary',
  },
  {
    id: 'tn-6',
    number: '+1 (212) 555-0300',
    e164: '+12125550300',
    type: 'local',
    status: 'pending',
    capabilities: ['voice'],
    assignedTenant: null,
    assignedTo: null,
    monthlyCost: 1.25,
    purchasedAt: '2026-03-01',
    region: 'US-NY',
    telnyxConnectionId: '—',
    trunkGroup: 'Telnyx Failover',
  },
  {
    id: 'tn-7',
    number: '+1 (888) 555-0400',
    e164: '+18885550400',
    type: 'toll-free',
    status: 'porting',
    capabilities: ['voice'],
    assignedTenant: 'Initech',
    assignedTo: 'Port-in progress',
    monthlyCost: 2.0,
    purchasedAt: '2026-02-20',
    region: 'US',
    telnyxConnectionId: 'conn_ghi789',
    trunkGroup: 'Telnyx Primary',
  },
];

export type TelnyxInventorySummary = {
  total: number;
  available: number;
  assigned: number;
  pending: number;
  monthlySpend: number;
};

export function summarizeTelnyxInventory(numbers: TelnyxNumber[]): TelnyxInventorySummary {
  return {
    total: numbers.length,
    available: numbers.filter((n) => n.status === 'available').length,
    assigned: numbers.filter((n) => n.status === 'assigned').length,
    pending: numbers.filter((n) => n.status === 'pending' || n.status === 'porting').length,
    monthlySpend: numbers.reduce((sum, n) => sum + n.monthlyCost, 0),
  };
}

export const mockTenants = [
  { id: 't1', name: 'Acme Corp', extensions: 248, users: 186, status: 'active' as const, plan: 'Enterprise' },
  { id: 't2', name: 'Globex Inc', extensions: 92, users: 64, status: 'active' as const, plan: 'Business' },
  { id: 't3', name: 'Initech', extensions: 45, users: 38, status: 'active' as const, plan: 'Business' },
  { id: 't4', name: 'Umbrella Co', extensions: 12, users: 8, status: 'trial' as const, plan: 'Trial' },
];

export const mockLiveCalls = [
  { id: 'c1', direction: 'Inbound', from: '+14155550100', to: '1001', tenant: 'Acme Corp', duration: '2:14', state: 'Active', quality: 'Good' },
  { id: 'c2', direction: 'Outbound', from: '1002', to: '+14155550999', tenant: 'Acme Corp', duration: '0:45', state: 'Ringing', quality: '—' },
  { id: 'c3', direction: 'Inbound', from: '+18005550199', to: 'Support Queue', tenant: 'Globex Inc', duration: '5:32', state: 'Active', quality: 'Fair' },
  { id: 'c4', direction: 'Internal', from: '1003', to: '1001', tenant: 'Acme Corp', duration: '1:08', state: 'Active', quality: 'Good' },
];

export const mockSipTrunks = [
  { id: 'tr1', name: 'Telnyx Primary', carrier: 'Telnyx', host: 'sip.telnyx.com', channels: 50, inUse: 12, status: 'healthy' as const, latencyMs: 18 },
  { id: 'tr2', name: 'Telnyx Failover', carrier: 'Telnyx', host: 'sip.telnyx.com', channels: 25, inUse: 0, status: 'healthy' as const, latencyMs: 22 },
];

export const mockBillingSummary = {
  currentPeriod: 'Jul 1 – Jul 31, 2026',
  platformMrr: 24850,
  telnyxSpend: 1842,
  usageMinutes: 847200,
  overageMinutes: 12400,
};
