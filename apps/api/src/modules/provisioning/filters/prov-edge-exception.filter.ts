import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { resolveGrandstreamProvPath } from '../url/grandstream-prov-path.util';

/** Logs Grandstream prov-edge outcomes (including auth failures) with path normalization metadata. */
@Catch(HttpException)
export class ProvEdgeExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProvEdgeExceptionFilter.name);

  catch(exception: HttpException, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();
    const status = exception.getStatus();
    const requestPath = req.path || req.url;
    if (requestPath.startsWith('/gs/')) {
      const resolution = resolveGrandstreamProvPath(requestPath);
      const provReq = req as Request & { provMac?: string };

      this.logger.log(
        JSON.stringify({
          event: 'provisioning.request',
          requestedUri: resolution.requestedPath,
          normalizedUri: resolution.normalizedPath,
          mac: provReq.provMac ?? resolution.mac,
          userAgent: req.headers['user-agent'],
          httpStatus: status,
        }),
      );
    }

    const body = exception.getResponse();
    res.status(status).json(typeof body === 'string' ? { message: body, statusCode: status } : body);
  }
}
