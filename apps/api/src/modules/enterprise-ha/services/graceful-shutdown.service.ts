import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Observable, finalize } from 'rxjs';
import { ShutdownCoordinatorService } from './shutdown-coordinator.service';

/** Tracks in-flight HTTP requests for graceful shutdown drain. */
@Injectable()
export class InFlightInterceptor implements NestInterceptor {
  constructor(private readonly shutdown: ShutdownCoordinatorService) {}

  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (this.shutdown.isDraining()) {
      throw new ServiceUnavailableException('Service is shutting down');
    }
    this.shutdown.beginRequest();
    return next.handle().pipe(finalize(() => this.shutdown.endRequest()));
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
