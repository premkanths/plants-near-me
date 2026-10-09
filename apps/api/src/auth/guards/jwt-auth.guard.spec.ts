import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { JwtAuthGuard } from './jwt-auth.guard';

const SECRET = 'test-access-secret-at-least-32-characters-long';

function contextWith(headers: Record<string, string> = {}) {
  const request: { headers: Record<string, string>; user?: unknown } = { headers };
  const ctx = {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => jest.fn(),
    getClass: () => jest.fn(),
  } as unknown as ExecutionContext;
  return { ctx, request };
}

describe('JwtAuthGuard', () => {
  const jwt = new JwtService({});
  const build = (isPublic = false) =>
    new JwtAuthGuard(jwt, {
      getAllAndOverride: jest.fn().mockReturnValue(isPublic),
    } as unknown as Reflector);

  beforeAll(() => {
    process.env.JWT_ACCESS_SECRET = SECRET;
  });

  it('lets @Public() routes through without a token', async () => {
    const { ctx } = contextWith();
    await expect(build(true).canActivate(ctx)).resolves.toBe(true);
  });

  it('rejects a request with no Authorization header', async () => {
    const { ctx } = contextWith();
    await expect(build().canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a non-bearer scheme', async () => {
    const { ctx } = contextWith({ authorization: 'Basic abc123' });
    await expect(build().canActivate(ctx)).rejects.toThrow(/Missing bearer token/);
  });

  it('rejects a token signed with the wrong secret', async () => {
    const token = await jwt.signAsync(
      { sub: 'u1', role: 'CUSTOMER' },
      { secret: 'another-secret-value-32-characters!!' },
    );
    const { ctx } = contextWith({ authorization: `Bearer ${token}` });
    await expect(build().canActivate(ctx)).rejects.toThrow(/Invalid or expired token/);
  });

  it('rejects an expired token', async () => {
    const token = await jwt.signAsync(
      { sub: 'u1', email: 'a@b.c', role: 'CUSTOMER' },
      { secret: SECRET, expiresIn: '-1s' },
    );
    const { ctx } = contextWith({ authorization: `Bearer ${token}` });
    await expect(build().canActivate(ctx)).rejects.toThrow(/Invalid or expired token/);
  });

  it('accepts a valid token and populates req.user', async () => {
    const token = await jwt.signAsync(
      { sub: 'u1', email: 'vendor@eplant.test', role: 'VENDOR', vendorId: 'v1' },
      { secret: SECRET, expiresIn: '5m' },
    );
    const { ctx, request } = contextWith({ authorization: `Bearer ${token}` });

    await expect(build().canActivate(ctx)).resolves.toBe(true);
    expect(request.user).toEqual({
      id: 'u1',
      email: 'vendor@eplant.test',
      role: 'VENDOR',
      vendorId: 'v1',
    });
  });
});
