import { Controller, Post } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators';
import type { AuthenticatedUser } from '../auth/auth.types';
import { RealtimeService } from './realtime.service';

@Controller('realtime')
export class RealtimeController {
  constructor(private readonly realtime: RealtimeService) {}

  /**
   * Exchanges the caller's session for a short-lived socket ticket.
   * Authenticated by the normal JWT guard, so the browser only ever holds the
   * ticket — never the access token.
   */
  @Post('ticket')
  issue(@CurrentUser() user: AuthenticatedUser) {
    return this.realtime.issueTicket({
      userId: user.id,
      role: user.role,
      vendorId: user.vendorId,
    });
  }
}
