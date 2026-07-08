import { randomUUID } from 'node:crypto';
import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { TELECOM_HEADERS } from './telecom.headers';
import { telecomContextStorage, type TelecomRequestContext } from './telecom.context';

/** Propagates request/correlation/platformUuid and echoes them on the response. */
@Injectable()
export class TelecomCorrelationMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const requestId =
      (req.header(TELECOM_HEADERS.REQUEST_ID) || '').trim() || randomUUID();
    const correlationId =
      (req.header(TELECOM_HEADERS.CORRELATION_ID) || '').trim() || requestId;
    const platformUuid = (req.header(TELECOM_HEADERS.PLATFORM_UUID) || '').trim() || undefined;
    const idempotencyKey =
      (req.header(TELECOM_HEADERS.IDEMPOTENCY_KEY) || '').trim() || undefined;

    res.setHeader(TELECOM_HEADERS.REQUEST_ID, requestId);
    res.setHeader(TELECOM_HEADERS.CORRELATION_ID, correlationId);
    if (platformUuid) {
      res.setHeader(TELECOM_HEADERS.PLATFORM_UUID, platformUuid);
    }

    const ctx: TelecomRequestContext = {
      requestId,
      correlationId,
      platformUuid,
      idempotencyKey,
      path: req.originalUrl || req.url,
      method: req.method,
    };

    // Attach for guards/interceptors that do not use ALS yet
    (req as Request & { telecomContext?: TelecomRequestContext }).telecomContext = ctx;

    telecomContextStorage.run(ctx, () => next());
  }
}
