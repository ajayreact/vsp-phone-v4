import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { ApiErrorBody } from '../../../common/errors/api-error.types';
import { mapException } from '../../../common/errors/error-mapper';
import { resolveRequestId } from '../../../common/errors/request-id.middleware';

/** Phase 16 — sanitized, structured errors for non-telecom routes. */
@Catch()
export class SecurityExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(SecurityExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    if (res.headersSent) return;

    const path = req.originalUrl || req.url || '';
    if (path.includes('/v1/telecom')) {
      throw exception;
    }

    const requestId = resolveRequestId(req);
    let mapped;
    try {
      mapped = mapException(exception);
    } catch {
      mapped = {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred. Please try again or contact support.',
        details: null,
        field: null,
      };
    }

    const payload: ApiErrorBody = {
      success: false,
      code: mapped.code,
      message: mapped.message,
      details: mapped.details ?? null,
      field: mapped.field ?? null,
      requestId,
      timestamp: new Date().toISOString(),
    };

    this.safeLogError(exception, {
      status: mapped.status,
      code: mapped.code,
      path,
      method: req.method,
      requestId,
    });

    if (!res.headersSent) {
      res.setHeader('x-request-id', requestId);
      res.status(mapped.status).json(payload);
    }
  }

  private safeLogError(
    exception: unknown,
    ctx: { status: number; code: string; path: string; method: string; requestId: string },
  ): void {
    try {
      const errMsg =
        exception instanceof HttpException
          ? JSON.stringify(exception.getResponse())
          : exception instanceof Error
            ? exception.message
            : typeof exception === 'string'
              ? exception
              : String(exception);
      const errName = exception instanceof Error ? exception.name : 'Unknown';
      const safeMsg = String(errMsg ?? '')
        .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
        .slice(0, 500);

      if (ctx.status >= 500) {
        this.logger.error(
          JSON.stringify({
            event: 'security.error',
            statusCode: ctx.status,
            code: ctx.code,
            path: ctx.path,
            method: ctx.method,
            requestId: ctx.requestId,
            errName,
            errMsg: safeMsg,
            stack:
              exception instanceof Error ? exception.stack?.split('\n').slice(0, 8) : undefined,
          }),
        );
      } else {
        this.logger.warn(
          JSON.stringify({
            event: 'security.error',
            statusCode: ctx.status,
            code: ctx.code,
            path: ctx.path,
            method: ctx.method,
            requestId: ctx.requestId,
          }),
        );
      }
    } catch {
      try {
        // eslint-disable-next-line no-console
        console.error(
          JSON.stringify({
            event: 'security.error.log_failed',
            path: ctx.path,
            method: ctx.method,
            statusCode: ctx.status,
            requestId: ctx.requestId,
          }),
        );
      } catch {
        /* ignore */
      }
    }
  }
}
