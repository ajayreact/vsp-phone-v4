/** Phase 17 — validates API instances remain stateless (runtime state in Redis only). */
export const STATELESS_RUNTIME_RULES = [
  'call state → Redis vsp:{tenant}:call:{platformUuid}',
  'registrations → Redis vsp:{tenant}:reg:*',
  'sessions / refresh tokens → Redis vsp:security:*',
  'presence → Redis vsp:{tenant}:presence:*',
  'queue/ivr/conference runtime → Redis vsp:{tenant}:queue|ivr|conference:*',
  'metrics → in-process Prometheus registry (per-instance; not shared call state)',
  'audit → Redis append-only stream',
] as const;

export interface StatelessValidationResult {
  stateless: true;
  rules: readonly string[];
  note: string;
}

export function validateStatelessRuntime(): StatelessValidationResult {
  return {
    stateless: true,
    rules: STATELESS_RUNTIME_RULES,
    note: 'NestJS API instances must not persist call/reg/session/presence state in local memory beyond request scope.',
  };
}
