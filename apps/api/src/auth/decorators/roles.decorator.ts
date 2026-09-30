import { SetMetadata } from '@nestjs/common';
import { Role } from '../../generated/prisma/enums';

export const ROLES_KEY = 'roles';

/**
 * Restrict a route (or a whole controller) to the given roles.
 * Evaluated by RolesGuard, which runs after JwtAuthGuard.
 *
 * @example @Roles('VENDOR', 'ADMIN')
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
