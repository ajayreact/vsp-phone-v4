import { NextResponse, type NextRequest } from 'next/server';
import {
  isPathAllowedForPortal,
  resolvePortalFromRequest,
} from './lib/portal/portal-routes';
import { resolveTenantLegacyRedirect } from './lib/navigation/tenant-redirects';

const PUBLIC_PREFIXES = ['/login', '/impersonate', '/_next', '/favicon.ico', '/api'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const portal = resolvePortalFromRequest({
    forwardedHost: request.headers.get('x-forwarded-host'),
    host: request.headers.get('host'),
    urlHostname: request.nextUrl.hostname,
    envPortal: process.env.NEXT_PUBLIC_PORTAL,
  });

  if (portal === 'tenant') {
    const redirectTo = resolveTenantLegacyRedirect(pathname);
    if (redirectTo && redirectTo !== pathname.split('?')[0]) {
      const url = request.nextUrl.clone();
      url.pathname = redirectTo;
      return NextResponse.redirect(url);
    }
  }

  if (!isPathAllowedForPortal(pathname, portal)) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    url.searchParams.set('portal', portal);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|.*\\..*).*)'],
};
