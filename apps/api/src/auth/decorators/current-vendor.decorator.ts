import { ExecutionContext, ForbiddenException, createParamDecorator } from '@nestjs/common';
import type { Request } from 'express';
import { AuthenticatedUser } from '../auth.types';

/**
 * Injects the vendor id carried by the access token.
 * Throws if the account has no vendor profile, so controllers can never
 * accidentally run a vendor query with `undefined` as the owner.
 */
export const CurrentVendorId = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
  const vendorId = request.user?.vendorId;
  if (!vendorId) throw new ForbiddenException('This account has no vendor profile');
  return vendorId;
});
