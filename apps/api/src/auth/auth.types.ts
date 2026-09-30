import { Role } from '../generated/prisma/enums';

/** Payload embedded in the access token. */
export interface JwtPayload {
  sub: string; // user id
  email: string;
  role: Role;
  /** Vendor profile id — only present for VENDOR accounts. */
  vendorId?: string;
}

/** Payload embedded in the refresh token. */
export interface RefreshPayload {
  sub: string;
  tokenVersion: 'v1';
  /** Random per-token id: guarantees every issued refresh token is unique,
   *  so rotation genuinely invalidates the previous one. */
  jti: string;
}

/** What `req.user` holds once JwtAuthGuard has run. */
export interface AuthenticatedUser {
  id: string;
  email: string;
  role: Role;
  vendorId?: string;
}

export interface AuthUserView {
  id: string;
  email: string;
  name: string;
  role: Role;
  phone: string | null;
  vendor?: { id: string; name: string; slug: string; approved: boolean };
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface AuthResponse extends AuthTokens {
  user: AuthUserView;
}
