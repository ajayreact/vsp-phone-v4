/** Mock data adapters — replace with live API hooks when backend CRUD is ready. */

export type MockUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  extension: string;
  status: 'active' | 'inactive' | 'pending';
};

export type MockExtension = {
  id: string;
  extension: string;
  name: string;
  device: string;
  status: 'online' | 'offline' | 'pending';
  site: string;
};

export type MockDevice = {
  id: string;
  model: string;
  mac: string;
  extension: string;
  firmware: string;
  status: 'online' | 'offline';
  site: string;
};

export type MockDid = {
  id: string;
  number: string;
  provider: string;
  assignedTo: string;
  status: 'active' | 'pending' | 'inactive';
  type: string;
};

export type MockCall = {
  id: string;
  from: string;
  to: string;
  direction: 'Inbound' | 'Outbound';
  duration: string;
  status: 'Completed' | 'Failed' | 'Missed';
  time: string;
};

export const mockUsers: MockUser[] = [
  { id: '1', name: 'Jane Smith', email: 'jane@acme.com', role: 'Admin', extension: '1001', status: 'active' },
  { id: '2', name: 'John Davis', email: 'john@acme.com', role: 'User', extension: '1002', status: 'active' },
  { id: '3', name: 'Sarah Chen', email: 'sarah@acme.com', role: 'Supervisor', extension: '1003', status: 'active' },
  { id: '4', name: 'Mike Wilson', email: 'mike@acme.com', role: 'User', extension: '1004', status: 'pending' },
  { id: '5', name: 'Lisa Park', email: 'lisa@acme.com', role: 'User', extension: '1005', status: 'inactive' },
];

export const mockExtensions: MockExtension[] = [
  { id: '1', extension: '1001', name: 'Jane Smith', device: 'GRP2612W', status: 'online', site: 'HQ' },
  { id: '2', extension: '1002', name: 'John Davis', device: 'WebRTC', status: 'online', site: 'HQ' },
  { id: '3', extension: '1003', name: 'Sarah Chen', device: 'GRP2612W', status: 'offline', site: 'Branch' },
  { id: '4', extension: '1004', name: 'Mike Wilson', device: '—', status: 'pending', site: 'HQ' },
  { id: '5', extension: '2001', name: 'Reception', device: 'GRP2614', status: 'online', site: 'HQ' },
];

export const mockDevices: MockDevice[] = [
  { id: '1', model: 'Grandstream GRP2612W', mac: 'C0:74:AD:12:34:56', extension: '1001', firmware: '1.0.7.12', status: 'online', site: 'HQ' },
  { id: '2', model: 'Grandstream GRP2614', mac: 'C0:74:AD:98:76:54', extension: '2001', firmware: '1.0.7.12', status: 'online', site: 'HQ' },
  { id: '3', model: 'Grandstream GRP2612W', mac: 'C0:74:AD:AA:BB:CC', extension: '1003', firmware: '1.0.7.11', status: 'offline', site: 'Branch' },
];

export const mockDids: MockDid[] = [
  { id: '1', number: '+1 (415) 555-0100', provider: 'Telnyx', assignedTo: 'Main IVR', status: 'active', type: 'Local' },
  { id: '2', number: '+1 (415) 555-0101', provider: 'Telnyx', assignedTo: 'Sales Queue', status: 'active', type: 'Local' },
  { id: '3', number: '+1 (800) 555-0199', provider: 'Telnyx', assignedTo: 'Support', status: 'active', type: 'Toll-Free' },
  { id: '4', number: '+1 (628) 555-0200', provider: 'Telnyx', assignedTo: 'Unassigned', status: 'pending', type: 'Local' },
];

export const mockRecentCalls: MockCall[] = [
  { id: '1', from: '+14155550100', to: '1001', direction: 'Inbound', duration: '4:32', status: 'Completed', time: '2 min ago' },
  { id: '2', from: '1002', to: '+14155550999', direction: 'Outbound', duration: '12:08', status: 'Completed', time: '8 min ago' },
  { id: '3', from: '+18005550199', to: 'Support Queue', direction: 'Inbound', duration: '0:00', status: 'Missed', time: '15 min ago' },
  { id: '4', from: '1003', to: '1001', direction: 'Outbound', duration: '1:45', status: 'Completed', time: '22 min ago' },
  { id: '5', from: '+14155550200', to: '1004', direction: 'Inbound', duration: '0:00', status: 'Failed', time: '35 min ago' },
];

export const dashboardKpis = {
  extensions: 248,
  users: 186,
  devices: 142,
  registeredPhones: 128,
  dids: 24,
  todaysCalls: 1847,
  failedCalls: 12,
  callQuality: '98.2%',
};

export type HealthService = {
  id: string;
  name: string;
  status: 'healthy' | 'warning' | 'error';
  latencyMs: number;
  uptime: string;
};

export const mockHealthServices: HealthService[] = [
  { id: 'api', name: 'API', status: 'healthy', latencyMs: 42, uptime: '99.99%' },
  { id: 'kamailio', name: 'Kamailio', status: 'healthy', latencyMs: 8, uptime: '99.98%' },
  { id: 'redis', name: 'Redis', status: 'healthy', latencyMs: 2, uptime: '100%' },
  { id: 'postgres', name: 'PostgreSQL', status: 'healthy', latencyMs: 5, uptime: '99.99%' },
  { id: 'rtpengine', name: 'RTPengine', status: 'healthy', latencyMs: 12, uptime: '99.97%' },
  { id: 'webrtc', name: 'WebRTC', status: 'warning', latencyMs: 89, uptime: '99.90%' },
  { id: 'provisioning', name: 'Provisioning', status: 'healthy', latencyMs: 34, uptime: '99.95%' },
];

export function getMockRows(moduleId: string): Record<string, unknown>[] {
  switch (moduleId) {
    case 'users':
      return mockUsers;
    case 'extensions':
      return mockExtensions;
    case 'devices':
      return mockDevices;
    case 'dids':
      return mockDids;
    case 'roles':
      return [
        { id: '1', name: 'Tenant Admin', users: 4, permissions: 28, system: true },
        { id: '2', name: 'Supervisor', users: 12, permissions: 16, system: true },
        { id: '3', name: 'Agent', users: 142, permissions: 8, system: true },
      ];
    case 'queues':
      return [
        { id: '1', name: 'Sales', agents: 8, waiting: 2, strategy: 'Round Robin', status: 'active' },
        { id: '2', name: 'Support', agents: 14, waiting: 0, strategy: 'Longest Idle', status: 'active' },
      ];
    case 'ivr':
      return [
        { id: '1', name: 'Main Menu', extensions: '2001', options: 4, status: 'active' },
        { id: '2', name: 'After Hours', extensions: '—', options: 2, status: 'active' },
      ];
    case 'audit-logs':
      return [
        { id: '1', action: 'User login', actor: 'admin@vspphone.com', time: '2 min ago', ip: '203.0.113.1' },
        { id: '2', action: 'Extension updated', actor: 'jane@acme.com', time: '1 hr ago', ip: '198.51.100.42' },
      ];
    case 'cdr':
      return mockRecentCalls.map((c) => ({
        id: c.id,
        time: c.time,
        direction: c.direction,
        from: c.from,
        to: c.to,
        duration: c.duration,
        status: c.status,
      }));
    case 'sip-accounts':
      return [
        { id: '1', username: '1001@sip.acme.com', extension: '1001', domain: 'sip.acme.com', status: 'online' as const },
        { id: '2', username: '1002@sip.acme.com', extension: '1002', domain: 'sip.acme.com', status: 'online' as const },
        { id: '3', username: '1003@sip.acme.com', extension: '1003', domain: 'sip.acme.com', status: 'offline' as const },
      ];
    case 'trunks':
      return [
        { id: '1', name: 'Telnyx Primary', carrier: 'Telnyx', channels: 50, status: 'active' as const },
        { id: '2', name: 'Telnyx Failover', carrier: 'Telnyx', channels: 25, status: 'active' as const },
      ];
    default:
      return Array.from({ length: 5 }, (_, i) => ({
        id: String(i + 1),
        name: `${moduleId} item ${i + 1}`,
        status: i % 2 === 0 ? 'active' : 'pending',
        updated: `${i + 1}d ago`,
      }));
  }
}
