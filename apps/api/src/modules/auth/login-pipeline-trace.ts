/**
 * TEMPORARY RC1 login pipeline timing — remove after blocker identified.
 * Log tag: [vsp-pipeline]
 */
import { Logger } from '@nestjs/common';

const logger = new Logger('LoginPipelineTrace');

export type PipelinePhase =
  | 'middleware.security_headers'
  | 'middleware.load_balancer'
  | 'guard.AuthRateLimitGuard'
  | 'guard.AuthRateLimitGuard.redis.incr'
  | 'interceptor.InFlight'
  | 'pipe.ValidationPipe'
  | 'controller.AuthController.login'
  | 'service.AuthService.login'
  | 'service.AuthHardening.assertNotLocked'
  | 'service.AuthHardening.assertNotLocked.redis.get'
  | 'service.Prisma.user.findFirst'
  | 'service.verifyPassword'
  | 'service.jwt.signJwt';

export function pipelineEnter(phase: PipelinePhase, reqId: string): number {
  const t0 = Date.now();
  logger.warn(
    JSON.stringify({
      tag: '[vsp-pipeline]',
      phase,
      stage: 'ENTER',
      reqId,
      t0,
    }),
  );
  return t0;
}

export function pipelineExit(phase: PipelinePhase, reqId: string, t0: number): void {
  logger.warn(
    JSON.stringify({
      tag: '[vsp-pipeline]',
      phase,
      stage: 'EXIT',
      reqId,
      elapsedMs: Date.now() - t0,
    }),
  );
}

export function pipelineReqId(req: { headers?: Record<string, unknown>; ip?: string }): string {
  const incoming = req.headers?.['x-request-id'];
  if (typeof incoming === 'string' && incoming.length > 0) return incoming;
  return `login-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
