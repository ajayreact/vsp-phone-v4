import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { getTelecomContext } from './telecom.context';
import { TelecomErrorCode, type TelecomErrorBody } from './telecom.errors';
import { TELECOM_HEADERS } from './telecom.headers';

@Catch()
export class TelecomExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(TelecomExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();
    const store = getTelecomContext();
    const requestId =
      store?.requestId ||
      req.header(TELECOM_HEADERS.REQUEST_ID) ||
      undefined;
    const correlationId =
      store?.correlationId ||
      req.header(TELECOM_HEADERS.CORRELATION_ID) ||
      requestId;
    const platformUuid =
      store?.platformUuid ||
      req.header(TELECOM_HEADERS.PLATFORM_UUID) ||
      undefined;

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
        } else if (status === HttpStatus.UNAUTHORIZED) {
          code = TelecomErrorCode.UNAUTHORIZED;
        } else if (status === HttpStatus.FORBIDDEN) {
          code = TelecomErrorCode.FORBIDDEN;
        } else if (status === HttpStatus.NOT_FOUND) {
          code = TelecomErrorCode.NOT_FOUND;
        } else if (status === HttpStatus.CONFLICT) {
          code = TelecomErrorCode.CONFLICT;
        } else if (status === HttpStatus.TOO_MANY_REQUESTS) {
          code = TelecomErrorCode.RATE_LIMITED;
        } else if (status === HttpStatus.BAD_REQUEST) {
          code = TelecomErrorCode.VALIDATION_FAILED;
        } else if (status === HttpStatus.SERVICE_UNAVAILABLE) {
          code = TelecomErrorCode.FAIL_CLOSED;
        } else if (status === HttpStatus.GATEWAY_TIMEOUT || status === HttpStatus.REQUEST_TIMEOUT) {
          code = TelecomErrorCode.TIMEOUT;
        }
        if (obj.details !== undefined) {
          details = obj.details;
        }
      }
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    const payload: TelecomErrorBody = {
      statusCode: status,
      code,
      message,
      requestId,
      correlationId,
      platformUuid,
      timestamp: new Date().toISOString(),
      details,
    };

    this.logger.warn(
      JSON.stringify({
        event: 'telecom.error',
        ...payload,
        path: req.originalUrl || req.url,
        method: req.method,
      }),
    );

    if (requestId) {
      res.setHeader(TELECOM_HEADERS.REQUEST_ID, requestId);
    }
    if (correlationId) {
      res.setHeader(TELECOM_HEADERS.CORRELATION_ID, correlationId);
    }
    if (platformUuid) {
      res.setHeader(TELECOM_HEADERS.PLATFORM_UUID, platformUuid);
    }

    res.status(status).json(payload);
  }
}
