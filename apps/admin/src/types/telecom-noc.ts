export type NocDashboard = {
  platformStatus: string;
  concurrentCalls: number;
  registeredSipPhones: number;
  registeredWebrtcClients: number;
  kamailioStatus: { status: string };
  dispatcherStatus: { status: string; nodesUp: number; nodesTotal: number };
  rtpengineStatus: { status: string };
  redis: Record<string, unknown>;
  postgres: Record<string, unknown>;
  minio?: { status: string };
  api: { status: string };
  host: {
    cpuCount: number;
    loadAvg1m: number;
    memoryUsedPct: number;
    uptimeSec: number;
  };
  infrastructure: Record<string, { status: string; latencyMs?: number }>;
  ts: string;
};

export type NocSipRegistration = {
  id: string;
  username: string;
  extension: string | null;
  tenantName: string;
  device: string | null;
  ip: string | null;
  port: number | null;
  transport: string;
  tls: boolean;
  userAgent: string;
  registrationTime: string | null;
  expires: string | null;
  latencyMs: number | null;
  packetLossPct: number | null;
  jitterMs: number | null;
  status: string;
};

export type NocSipDialog = {
  callId: string;
  platformUuid: string;
  from: string;
  to: string;
  state: string;
  codec: string;
  durationSec: number;
  direction: string;
  carrier: string;
  tenant: string;
  queue: string | null;
  agent: string | null;
  transferStatus: string;
  recordingStatus: string;
};

export type NocAlert = {
  id: string;
  severity: string;
  title: string;
  message: string;
  source: string;
  status: string;
  createdAt: string;
};

export type FraudScan = {
  signals: Array<{ id: string; type: string; severity: string; title: string; detail: string; detectedAt: string }>;
  scannedAt: string;
};
