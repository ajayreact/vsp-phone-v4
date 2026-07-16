import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { getJwtUser } from './jwt-auth.guard';
import type { AuthPortal } from './jwt.util';

export const PORTAL_KEY = 'security:portal';

/** Restrict route to JWT portal claim(s). */
export const RequirePortal = (...portals: AuthPortal[]) => SetMetadata(PORTAL_KEY, portals);

/**
 * Ensures JWT `portal` matches the route surface.
 * Also infers expected portal from path when metadata is absent:
 * - /v1/platform → platform
 * - /v1/tenant → tenant
 * - /v1/ops → ops
 */
@Injectable()
export class PortalGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const user = getJwtUser(req);

    const meta = this.reflector.getAllAndOverride<AuthPortal[]>(PORTAL_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const path = req.path || req.url || '';
    const inferred = inferPortalFromPath(path);
    const allowed = meta?.length ? meta : inferred ? [inferred] : null;

    // Auth and non-portal routes: no restriction
    if (!allowed) return true;

    if (!allowed.includes(user.portal)) {
      throw new ForbiddenException(
        `Token portal "${user.portal}" cannot access this ${allowed.join('|')} surface`,
      );
    }

    // Impersonation tokens are tenant-portal only
    if (user.impersonatorUserId && user.portal !== 'tenant') {
      throw new ForbiddenException('Impersonation token is limited to the tenant portal');
    }

    return true;
  }
}

function inferPortalFromPath(path: string): AuthPortal | null {
  const p = path.split('?')[0] ?? '';
  if (p.includes('/v1/platform')) return 'platform';
  if (p.includes('/v1/tenant')) return 'tenant';
  if (p.includes('/v1/ops')) return 'ops';
  return null;
}
