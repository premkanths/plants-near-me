import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { AuthenticatedUser, JwtPayload } from '../auth.types';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * Verifies the `Authorization: Bearer <accessToken>` header and puts the
 * decoded user on `req.user`. Registered globally (see AuthModule), so routes
 * are private by default and must opt out with `@Public()`.
 *
 * A `@Public()` route still gets an identity when the caller happens to send a
 * valid token — that is what lets one endpoint serve both audiences
 * (recommendations are personalised when signed in, popular picks when not)
 * without a second URL. An invalid token on a public route is ignored rather
 * than rejected.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const token = this.extractToken(request);

    if (isPublic) {
      if (token) {
        const payload = await this.decode(token);
        if (payload) request.user = toUser(payload);
      }
      return true;
    }

    if (!token) throw new UnauthorizedException('Missing bearer token');

    const payload = await this.decode(token);
    if (!payload) throw new UnauthorizedException('Invalid or expired token');

    request.user = toUser(payload);
    return true;
  }

  private async decode(token: string): Promise<JwtPayload | null> {
    try {
      return await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret: process.env.JWT_ACCESS_SECRET,
      });
    } catch {
      return null;
    }
  }

  private extractToken(request: Request): string | null {
    const header = request.headers.authorization;
    if (!header) return null;
    const [scheme, token] = header.split(' ');
    return scheme?.toLowerCase() === 'bearer' && token ? token : null;
  }
}

const toUser = (payload: JwtPayload): AuthenticatedUser => ({
  id: payload.sub,
  email: payload.email,
  role: payload.role,
  vendorId: payload.vendorId,
});
