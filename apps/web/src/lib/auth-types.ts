export type Role = 'CUSTOMER' | 'VENDOR' | 'ADMIN';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  phone?: string | null;
  vendor?: { id: string; name: string; slug: string; approved: boolean };
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface AuthResponse extends AuthTokens {
  user: AuthUser;
}

/** Where each role lands after logging in. */
export const HOME_BY_ROLE: Record<Role, string> = {
  CUSTOMER: '/account',
  VENDOR: '/vendor',
  ADMIN: '/admin',
};
