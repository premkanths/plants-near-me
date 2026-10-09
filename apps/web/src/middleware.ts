import { NextResponse, type NextRequest } from 'next/server';
import { HOME_BY_ROLE, type AuthUser, type Role } from '@/lib/auth-types';
import { USER_COOKIE } from '@/lib/session';

/**
 * Route-level role gate.
 *
 * This is UX only — it redirects instead of rendering a page the user cannot use.
 * Real enforcement happens in the API (JwtAuthGuard + RolesGuard), because the
 * `eplant_user` cookie is readable and therefore not trustworthy on its own.
 */
const PROTECTED: { prefix: string; roles: Role[] }[] = [
  { prefix: '/vendor', roles: ['VENDOR'] },
  { prefix: '/admin', roles: ['ADMIN'] },
  { prefix: '/account', roles: ['CUSTOMER', 'VENDOR', 'ADMIN'] },
  { prefix: '/cart', roles: ['CUSTOMER'] },
  { prefix: '/checkout', roles: ['CUSTOMER'] },
  { prefix: '/orders', roles: ['CUSTOMER'] },
  { prefix: '/reviews', roles: ['CUSTOMER'] },
];

const GUEST_ONLY = ['/login', '/register'];

function readUser(request: NextRequest): AuthUser | null {
  const raw = request.cookies.get(USER_COOKIE)?.value;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const user = readUser(request);

  if (user && GUEST_ONLY.some((p) => pathname.startsWith(p))) {
    return NextResponse.redirect(new URL(HOME_BY_ROLE[user.role] ?? '/', request.url));
  }

  const rule = PROTECTED.find((r) => pathname === r.prefix || pathname.startsWith(`${r.prefix}/`));
  if (!rule) return NextResponse.next();

  if (!user) {
    const login = new URL('/login', request.url);
    login.searchParams.set('next', pathname);
    return NextResponse.redirect(login);
  }

  if (!rule.roles.includes(user.role)) {
    const home = new URL(HOME_BY_ROLE[user.role] ?? '/', request.url);
    home.searchParams.set('denied', pathname);
    return NextResponse.redirect(home);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/vendor/:path*',
    '/admin/:path*',
    '/account/:path*',
    '/cart/:path*',
    '/checkout/:path*',
    '/orders/:path*',
    '/reviews/:path*',
    '/login',
    '/register',
  ],
};
