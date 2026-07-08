import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import type { Request, Response } from 'express';
import { getTelecomContext } from './telecom.context';
import { TELECOM_HEADERS } from './telecom.headers';

@Injectable()
export class TelecomLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('TelecomHttp');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    const started = Date.now();
    const store = getTelecomContext();

    this.logger.log(
      JSON.stringify({
        event: 'telecom.request',
        method: req.method,
        path: req.originalUrl || req.url,
        requestId: store?.requestId,
        correlationId: store?.correlationId,
        platformUuid: store?.platformUuid,
        idempotencyKey: store?.idempotencyKey,
      }),
    );

    return next.handle().pipe(
      tap({
        next: (body) => {
          // Echo platformUuid from response body when allocated
          if (
            body &&
            typeof body === 'object' &&
            'platformUuid' in body &&
            typeof (body as { platformUuid?: unknown }).platformUuid === 'string'
          ) {
            const uuid = (body as { platformUuid: string }).platformUuid;
            res.setHeader(TELECOM_HEADERS.PLATFORM_UUID, uuid);
          }
          this.logger.log(
            JSON.stringify({
              event: 'telecom.response',
              method: req.method,
              path: req.originalUrl || req.url,
              statusCode: res.statusCode,
              durationMs: Date.now() - started,
              requestId: store?.requestId,
              correlationId: store?.correlationId,
              platformUuid:
                store?.platformUuid ||
                (body &&
                typeof body === 'object' &&
                'platformUuid' in body &&
                typeof (body as { platformUuid?: unknown }).platformUuid === 'string'
                  ? (body as { platformUuid: string }).platformUuid
                  : undefined),
            }),
          );
        },
        error: () => {
          this.logger.warn(
            JSON.stringify({
              event: 'telecom.response_error',
              method: req.method,
              path: req.originalUrl || req.url,
              durationMs: Date.now() - started,
              requestId: store?.requestId,
              correlationId: store?.correlationId,
              platformUuid: store?.platformUuid,
            }),
          );
        },
      }),
    );
  }
}
