import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

export interface SecurityErrorBody {
  statusCode: number;
  code: string;
  message: string;
  timestamp: string;
  details?: unknown;
}

const LEAK_PATTERNS = [
  /\/apps\/api\//i,
  /prisma/i,
  /redis/i,
  /ECONNREFUSED/i,
  /password/i,
  /secret/i,
  /Bearer\s+/i,
];

/** Phase 16 — sanitized errors for non-telecom routes (no stack or infra leaks). */
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

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = 'An unexpected error occurred';
    let details: unknown;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = this.sanitizeMessage(body);
      } else if (body && typeof body === 'object') {
        const obj = body as Record<string, unknown>;
        if (Array.isArray(obj.message)) {
          message = 'Validation failed';
          details = obj.message;
          code = 'VALIDATION_FAILED';
        } else {
          message = this.sanitizeMessage(String(obj.message ?? obj.error ?? message));
        }
        if (typeof obj.code === 'string') code = obj.code;
        else if (status === HttpStatus.UNAUTHORIZED) code = 'UNAUTHORIZED';
        else if (status === HttpStatus.FORBIDDEN) code = 'FORBIDDEN';
        else if (status === HttpStatus.TOO_MANY_REQUESTS) code = 'RATE_LIMITED';
        else if (status === HttpStatus.BAD_REQUEST) code = 'VALIDATION_FAILED';
      }
    }

    const payload: SecurityErrorBody = {
      statusCode: status,
      code,
      message,
      timestamp: new Date().toISOString(),
      details,
    };

    const errMsg =
      exception instanceof Error
        ? exception.message
        : typeof exception === 'string'
          ? exception
          : String(exception);
    const errName = exception instanceof Error ? exception.name : 'Unknown';
    // Never send stack/message to clients; log server-side for ops (RC1).
    if (status >= 500) {
      this.logger.error(
        JSON.stringify({
          event: 'security.error',
          statusCode: status,
          code,
          path,
          method: req.method,
          errName,
          // Truncate only — do not apply client leak sanitizer (it hides Prisma text).
          errMsg: errMsg.replace(/Bearer\s+\S+/gi, 'Bearer [redacted]').slice(0, 500),
          stack: exception instanceof Error ? exception.stack?.split('\n').slice(0, 8) : undefined,
        }),
      );
    } else {
      this.logger.warn(
        JSON.stringify({
          event: 'security.error',
          statusCode: status,
          code,
          path,
          method: req.method,
        }),
      );
    }

    res.status(status).json(payload);
  }

  private sanitizeMessage(raw: string): string {
    if (LEAK_PATTERNS.some((p) => p.test(raw))) {
      return 'Request could not be processed';
    }
    return raw;
  }
}
