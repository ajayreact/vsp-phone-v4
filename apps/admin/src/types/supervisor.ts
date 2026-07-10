export type SupervisorDashboard = {
  activeCalls: number;
  waitingCalls: number;
  longestWaitingSec: number;
  answeredToday: number;
  abandoned: number;
  slaPct: number;
  availableAgents: number;
  busyAgents: number;
  offlineAgents: number;
  pausedAgents: number;
  averageHandleTimeSec: number;
  averageWaitTimeSec: number;
  serviceLevel: number;
  queueOccupancyPct: number;
  agentsLoggedIn: number;
  ts: string;
};

export type SupervisorWallboard = SupervisorDashboard & {
  queues: Array<{
    id: string;
    name: string;
    code: string | null;
    waiting: number;
    agents: number;
    paused: boolean;
    emergencyClosed: boolean;
  }>;
};

export type SupervisorAgent = {
  lineId: string;
  agentName: string;
  extension: string | null;
  queueId: string;
  queueName: string;
  status: string;
  presence: string;
  currentCallPlatformUuid: string | null;
  callDurationSec: number;
  callerNumber: string | null;
  customerName: string | null;
  lastActivity: string | null;
  loginTime: string | null;
  pauseReason: string | null;
  device: string | null;
  networkQuality: string;
  registration: string;
};

export type SupervisorQueue = {
  id: string;
  name: string;
  code: string | null;
  strategy: string;
  status: string;
  waitingCalls: number;
  agentsLoggedIn: number;
  averageWaitSec: number;
  longestWaitSec: number;
  abandonPct: number;
  serviceLevelPct: number;
  overflow: boolean;
  priority: number;
  overflowQueueId: string | null;
  paused: boolean;
  emergencyClosed: boolean;
  operational: boolean;
};

export type SupervisorLiveCall = {
  id: string;
  platformUuid: string;
  caller: string;
  callee: string;
  tenantName: string;
  extension?: string | null;
  trunk: string;
  codec: string;
  mos?: number | null;
  jitterMs?: number | null;
  packetLossPct?: number | null;
  durationSec: number;
  recording: boolean;
  status: string;
  queueName?: string | null;
  agentName?: string | null;
  transferStatus: string;
  rtpQuality: string;
};

export type CallTimeline = {
  platformUuid: string;
  callSessionId: string;
  state: string;
  recordingStatus: string;
  mediaState: string;
  timeline: Array<{ ts: string; event: string; detail: string }>;
};

export type SupervisorRecording = {
  id: string;
  publicId: string;
  callSessionId: string;
  platformUuid: string | null;
  status: string;
  durationSeconds: number | null;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
  annotations: Array<{ id: string; type: string; body: string | null; userId: string; createdAt: string }>;
};

export type SupervisorReports = {
  summary: {
    slaPct: number;
    avgHandleTimeSec: number;
    avgWaitTimeSec: number;
    abandonRatePct: number;
    firstCallResolutionPct: number;
    missedCalls: number;
    transfers: number;
    occupancyPct: number;
  };
  agentPerformance: Array<{
    lineId: string;
    agentName: string;
    callsHandled: number;
    avgHandleTimeSec: number;
    missedCalls: number;
    transfers: number;
  }>;
  queuePerformance: Array<{
    queueId: string;
    queueName: string;
    offered: number;
    answered: number;
    abandoned: number;
    abandonRatePct: number;
    avgWaitSec: number;
    slaPct: number;
    occupancyPct: number;
  }>;
};

export type CoachingNote = {
  id: string;
  callSessionId: string;
  agentLineId: string | null;
  supervisorUserId: string;
  qualityScore: number | null;
  agentScore: number | null;
  notes: string | null;
  whisperUsed: boolean;
  createdAt: string;
};
