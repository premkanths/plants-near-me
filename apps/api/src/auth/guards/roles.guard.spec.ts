import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '../../generated/prisma/enums';
import { AuthenticatedUser } from '../auth.types';
import { RolesGuard } from './roles.guard';

function contextWith(user?: Partial<AuthenticatedUser>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => jest.fn(),
    getClass: () => jest.fn(),
  } as unknown as ExecutionContext;
}

function guardRequiring(roles: Role[] | undefined) {
  const reflector = { getAllAndOverride: jest.fn().mockReturnValue(roles) } as unknown as Reflector;
  return new RolesGuard(reflector);
}

const vendor: AuthenticatedUser = {
  id: 'u1',
  email: 'v@eplant.test',
  role: 'VENDOR',
  vendorId: 'v1',
};
const customer: AuthenticatedUser = { id: 'u2', email: 'c@eplant.test', role: 'CUSTOMER' };
const admin: AuthenticatedUser = { id: 'u3', email: 'a@eplant.test', role: 'ADMIN' };

describe('RolesGuard', () => {
  it('allows any authenticated user when no @Roles is set', () => {
    expect(guardRequiring(undefined).canActivate(contextWith(customer))).toBe(true);
  });

  it('allows a user whose role is listed', () => {
    expect(guardRequiring(['VENDOR']).canActivate(contextWith(vendor))).toBe(true);
  });

  it('allows a user matching one of several roles', () => {
    expect(guardRequiring(['VENDOR', 'ADMIN']).canActivate(contextWith(admin))).toBe(true);
  });

  it('rejects a user whose role is not listed', () => {
    expect(() => guardRequiring(['VENDOR']).canActivate(contextWith(customer))).toThrow(
      ForbiddenException,
    );
  });

  it('does not let a CUSTOMER reach ADMIN routes', () => {
    expect(() => guardRequiring(['ADMIN']).canActivate(contextWith(customer))).toThrow(
      /Requires role: ADMIN/,
    );
  });

  it('rejects when there is no authenticated user', () => {
    expect(() => guardRequiring(['ADMIN']).canActivate(contextWith(undefined))).toThrow(
      ForbiddenException,
    );
  });
});
