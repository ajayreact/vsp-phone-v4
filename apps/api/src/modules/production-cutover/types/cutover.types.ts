/** Phase 20 — production cutover & go-live types. */

export type CutoverPhase = 'pre_cutover' | 'migration' | 'post_cutover' | 'rollback';

export type ChecklistItemStatus = 'pending' | 'in_progress' | 'completed' | 'skipped';

export interface ChecklistItem {
  id: string;
  description: string;
  owner?: string;
  status: ChecklistItemStatus;
  timestamp?: string;
  notes?: string;
}

export interface ChecklistState {
  phase: CutoverPhase;
  items: ChecklistItem[];
  updatedAt: string;
}

export type SmokeTestId =
  | 'sip_registration'
  | 'inbound_call'
  | 'outbound_call'
  | 'internal_extension_call'
  | 'webrtc_registration'
  | 'grandstream_registration'
  | 'ivr'
  | 'queue'
  | 'conference'
  | 'park'
  | 'pickup'
  | 'recording'
  | 'presence'
  | 'blf'
  | 'telnyx_webhook'
  | 'health_endpoints';

export interface SmokeTestResult {
  id: SmokeTestId;
  name: string;
  pass: boolean;
  detail?: string;
  durationMs?: number;
}

export interface SmokeTestRun {
  runId: string;
  ts: string;
  passed: boolean;
  results: SmokeTestResult[];
}

export interface CutoverReadinessReport {
  ts: string;
  phase: 'phase20-production-cutover';
  ready: boolean;
  blocked: boolean;
  criticalFailures: string[];
  checks: Record<
    string,
    { pass: boolean; critical: boolean; detail?: string }
  >;
}

export interface CutoverStatusReport {
  ts: string;
  phase: 'phase20-production-cutover';
  cutoverState: string;
  readiness: { ready: boolean; blocked: boolean };
  migrationProgress: {
    batchCount: number;
    latestBatchId?: string;
    verifiedBatches: number;
  };
  smokeTests: { lastRunId?: string; passed?: boolean; runAt?: string };
  healthSummary: Record<string, string>;
  activeAlarms: string[];
  failedValidations: string[];
}

export interface RollbackPlan {
  ts: string;
  batchId?: string;
  checklist: ChecklistItem[];
  affectedComponents: string[];
  migrationBatchReferences: string[];
  verificationRequirements: string[];
  estimatedDurationMinutes: number;
  note: string;
}

export const CUTOVER_REDIS_KEYS = {
  state: 'vsp:cutover:state',
  checklist: (phase: CutoverPhase) => `vsp:cutover:checklist:${phase}`,
  smokeRun: (runId: string) => `vsp:cutover:smoke:${runId}`,
  smokeLatest: 'vsp:cutover:smoke:latest',
  report: 'vsp:cutover:report:latest',
} as const;
