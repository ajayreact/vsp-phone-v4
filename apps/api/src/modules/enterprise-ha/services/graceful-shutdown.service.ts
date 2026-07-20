import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Request } from 'express';
import { Observable, finalize, tap } from 'rxjs';
import { pipelineEnter, pipelineExit } from '../../auth/login-pipeline-trace';
import { ShutdownCoordinatorService } from './shutdown-coordinator.service';

/** Tracks in-flight HTTP requests for graceful shutdown drain. */
@Injectable()
export class InFlightInterceptor implements NestInterceptor {
  constructor(private readonly shutdown: ShutdownCoordinatorService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (this.shutdown.isDraining()) {
      throw new ServiceUnavailableException('Service is shutting down');
    }
    this.shutdown.beginRequest();
    const req = context.switchToHttp().getRequest<Request & { vspPipelineReqId?: string }>();
    const isLogin = req?.method === 'POST' && /\/v1\/auth\/login\/?$/.test(req.path ?? '');
    const reqId = req?.vspPipelineReqId || (isLogin ? `interceptor-${Date.now()}` : '');
    const t0 = isLogin ? pipelineEnter('interceptor.InFlight', reqId) : 0;
    return next.handle().pipe(
      tap({
        next: () => {
          if (isLogin) pipelineExit('interceptor.InFlight', reqId, t0);
        },
        error: () => {
          if (isLogin) pipelineExit('interceptor.InFlight', reqId, t0);
        },
      }),
      finalize(() => this.shutdown.endRequest()),
    );
  }
}

/** Phase 17 — flushes pending async work on shutdown (audit/logging best-effort). */
@Injectable()
export class GracefulShutdownService {
  private readonly logger = new Logger(GracefulShutdownService.name);

  async flush(): Promise<void> {
    await new Promise((resolve) => setImmediate(resolve));
    this.logger.log(JSON.stringify({ event: 'ha.shutdown.flush_complete' }));
  }
}
