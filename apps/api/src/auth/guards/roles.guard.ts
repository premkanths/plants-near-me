import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { Role } from '../../generated/prisma/enums';
import { AuthenticatedUser } from '../auth.types';
import { ROLES_KEY } from '../decorators/roles.decorator';

/**
 * Enforces `@Roles(...)`. Runs after JwtAuthGuard, so `req.user` is populated.
 * Routes without `@Roles` are open to any authenticated user.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles || requiredRoles.length === 0) return true;

    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const user = request.user;
    if (!user) throw new ForbiddenException('Not authenticated');

    if (!requiredRoles.includes(user.role)) {
      throw new ForbiddenException(
        `Requires role: ${requiredRoles.join(' or ')} (you are ${user.role})`,
      );
    }
    return true;
  }
}
