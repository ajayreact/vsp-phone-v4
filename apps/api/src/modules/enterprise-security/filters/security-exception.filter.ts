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
import { TelecomErrorCode, type TelecomErrorBody } from '../../../common/telecom/telecom.errors';
import { TELECOM_HEADERS } from '../../../common/telecom/telecom.headers';

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
      if (path.includes('auth/sip-digest')) {
        const requestId =
          resolveRequestId(req) ||
          req.header(TELECOM_HEADERS.REQUEST_ID) ||
          req.header(TELECOM_HEADERS.SIP_CALL_ID);
        const sipCallId = req.header(TELECOM_HEADERS.SIP_CALL_ID);
        const errName =
          exception instanceof HttpException
            ? 'HttpException'
            : exception instanceof Error
              ? exception.name
              : typeof exception;
        const errMsg =
          exception instanceof HttpException
            ? JSON.stringify(exception.getResponse())
            : exception instanceof Error
              ? exception.message
              : String(exception);
        const stackLines =
          exception instanceof Error && exception.stack
            ? exception.stack.split('\n')
            : [];
        const firstFrame = stackLines[1]?.trim();
        this.logger.warn(
          JSON.stringify({
            event: 'telecom.sip-digest.pre_filter',
            path,
            method: req.method,
            requestId,
            sipCallId,
            exception: errName,
            message: errMsg,
            firstFrame,
            stack: stackLines.slice(0, 12),
          }),
        );

        let status = HttpStatus.INTERNAL_SERVER_ERROR;
        let code: string = TelecomErrorCode.INTERNAL;
        let message = 'Internal telecom error';
        let details: unknown;

        if (exception instanceof HttpException) {
          status = exception.getStatus();
          const body = exception.getResponse();
          if (typeof body === 'string') {
            message = body;
          } else if (body && typeof body === 'object') {
            const obj = body as Record<string, unknown>;
            message = String(obj.message ?? obj.error ?? message);
            if (Array.isArray(obj.message)) {
              message = 'Validation failed';
              details = obj.message;
              code = TelecomErrorCode.VALIDATION_FAILED;
            }
            if (typeof obj.code === 'string') {
              code = obj.code;
            } else if (status === HttpStatus.BAD_REQUEST) {
              code = TelecomErrorCode.VALIDATION_FAILED;
            } else if (status === HttpStatus.UNAUTHORIZED) {
              code = TelecomErrorCode.UNAUTHORIZED;
            }
            if (obj.details !== undefined) {
              details = obj.details;
            }
          }
        } else if (exception instanceof Error) {
          message = exception.message;
          if (exception.name === 'SyntaxError' || /JSON/i.test(exception.message)) {
            status = HttpStatus.BAD_REQUEST;
            code = TelecomErrorCode.VALIDATION_FAILED;
          }
        }

        const payload: TelecomErrorBody = {
          statusCode: status,
          code,
          message,
          requestId,
          correlationId: requestId,
          timestamp: new Date().toISOString(),
          details,
        };
        if (requestId) {
          res.setHeader(TELECOM_HEADERS.REQUEST_ID, requestId);
        }
        if (sipCallId) {
          res.setHeader(TELECOM_HEADERS.SIP_CALL_ID, sipCallId);
        }
        res.status(status).json(payload);
        return;
      }
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
