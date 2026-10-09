import { RealtimeService } from './realtime.service';

describe('RealtimeService', () => {
  let service: RealtimeService;
  let emit: jest.Mock;
  let to: jest.Mock;

  beforeEach(() => {
    service = new RealtimeService();
    emit = jest.fn();
    to = jest.fn().mockReturnValue({ emit });
    service.registerServer({ to } as never);
  });

  describe('tickets', () => {
    it('issues an opaque ticket with a TTL', () => {
      const { ticket, expiresIn } = service.issueTicket({ userId: 'u1', role: 'CUSTOMER' });

      expect(ticket).toMatch(/^[\w-]{20,}$/);
      expect(ticket).not.toContain('u1');
      expect(expiresIn).toBe(60);
    });

    it('redeems a ticket back to its identity', () => {
      const { ticket } = service.issueTicket({ userId: 'u1', role: 'VENDOR', vendorId: 'v1' });

      expect(service.redeemTicket(ticket)).toEqual({
        userId: 'u1',
        role: 'VENDOR',
        vendorId: 'v1',
      });
    });

    it('is single use, so a replayed handshake fails', () => {
      const { ticket } = service.issueTicket({ userId: 'u1', role: 'CUSTOMER' });

      expect(service.redeemTicket(ticket)).not.toBeNull();
      expect(service.redeemTicket(ticket)).toBeNull();
    });

    it('rejects unknown and missing tickets', () => {
      expect(service.redeemTicket('made-up')).toBeNull();
      expect(service.redeemTicket(undefined)).toBeNull();
    });

    it('rejects an expired ticket', () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-09-30T06:00:00Z'));
      const { ticket } = service.issueTicket({ userId: 'u1', role: 'CUSTOMER' });

      jest.setSystemTime(new Date('2026-09-30T06:02:00Z')); // +2 minutes
      expect(service.redeemTicket(ticket)).toBeNull();
      jest.useRealTimers();
    });

    it('gives every caller a different ticket', () => {
      const a = service.issueTicket({ userId: 'u1', role: 'CUSTOMER' }).ticket;
      const b = service.issueTicket({ userId: 'u1', role: 'CUSTOMER' }).ticket;
      expect(a).not.toBe(b);
    });
  });

  describe('rooms', () => {
    it('namespaces room names by kind', () => {
      expect(RealtimeService.userRoom('u1')).toBe('user:u1');
      expect(RealtimeService.vendorRoom('v1')).toBe('vendor:v1');
      expect(RealtimeService.orderRoom('o1')).toBe('order:o1');
    });
  });

  describe('emit', () => {
    it('sends to the requested room', () => {
      service.emit('order:o1', 'order.status', { status: 'ACCEPTED' });

      expect(to).toHaveBeenCalledWith('order:o1');
      expect(emit).toHaveBeenCalledWith('order.status', { status: 'ACCEPTED' });
    });

    it('addresses all rooms in one emit, so a socket in two of them gets one copy', () => {
      service.emitToMany(['a', 'b', 'a'], 'evt', {});

      expect(to).toHaveBeenCalledTimes(1);
      expect(to).toHaveBeenCalledWith(['a', 'b']);
      expect(emit).toHaveBeenCalledTimes(1);
    });

    it('is a no-op for a multi-room emit before the gateway has started', () => {
      const detached = new RealtimeService();
      expect(() => detached.emitToMany(['a'], 'evt', {})).not.toThrow();
    });

    it('is a no-op before the gateway has started, never a crash', () => {
      const detached = new RealtimeService();
      expect(() => detached.emit('order:o1', 'evt', {})).not.toThrow();
    });
  });
});
