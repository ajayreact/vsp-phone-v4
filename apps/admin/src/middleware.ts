import { NextResponse, type NextRequest } from 'next/server';
import {
  isPathAllowedForPortal,
  resolvePortalFromRequest,
} from './lib/portal/portal-routes';

const PUBLIC_PREFIXES = ['/login', '/_next', '/favicon.ico', '/api'];

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
