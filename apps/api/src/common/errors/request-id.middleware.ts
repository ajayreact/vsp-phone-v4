import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}

/** Attach a stable request id for error responses and support correlation. */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.headers['x-request-id'];
  const requestId =
    typeof incoming === 'string' && incoming.trim().length > 0 ? incoming.trim() : randomUUID();
  req.requestId = requestId;
  res.setHeader('x-request-id', requestId);
  next();
}

export function resolveRequestId(req: Request): string {
  return req.requestId ?? randomUUID();
}
