import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { PaymentsService, toPaise } from './payments.service';
import { RazorpayGateway } from './razorpay.gateway';

describe('PaymentsService', () => {
  let service: PaymentsService;
  let prisma: {
    $transaction: jest.Mock;
    payment: Record<string, jest.Mock>;
  };
  let tx: {
    payment: { updateMany: jest.Mock; findUniqueOrThrow: jest.Mock };
    masterOrder: { update: jest.Mock };
    vendorOrder: { updateMany: jest.Mock };
    orderItem: { findMany: jest.Mock };
    product: { update: jest.Mock };
  };
  let gateway: {
    verifyPaymentSignature: jest.Mock;
    verifyWebhookSignature: jest.Mock;
    keyId: string;
    mode: string;
    createOrder: jest.Mock;
  };
  let realtime: { emit: jest.Mock; emitToMany: jest.Mock };

  const ORDER = 'master-1';
  const USER = 'user-1';

  const paymentRow = (overrides: Record<string, unknown> = {}) => ({
    id: 'payment-1',
    masterOrderId: ORDER,
    provider: 'RAZORPAY',
    status: 'PENDING',
    razorpayOrderId: 'order_abc',
    masterOrder: { id: ORDER, status: 'PENDING_PAYMENT', orderNumber: 'EP-260930-ABCDEF' },
    ...overrides,
  });

  const txPayment = (claimed = 1, masterStatus = 'PENDING_PAYMENT') => {
    tx.payment.updateMany.mockResolvedValue({ count: claimed });
    tx.payment.findUniqueOrThrow.mockResolvedValue({
      masterOrderId: ORDER,
      masterOrder: {
        id: ORDER,
        orderNumber: 'EP-260930-ABCDEF',
        status: masterStatus,
        vendorOrders: [
          {
            id: 'vo-1',
            orderNumber: 'EP-260930-ABCDEF-V1',
            total: { toFixed: () => '469.00' },
            vendorId: 'vendor-1',
            _count: { items: 2 },
          },
        ],
      },
    });
  };

  beforeEach(async () => {
    tx = {
      payment: { updateMany: jest.fn(), findUniqueOrThrow: jest.fn() },
      masterOrder: { update: jest.fn() },
      vendorOrder: { updateMany: jest.fn() },
      orderItem: { findMany: jest.fn().mockResolvedValue([]) },
      product: { update: jest.fn() },
    };
    prisma = {
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
      payment: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
    };
    gateway = {
      keyId: 'rzp_test_x',
      mode: 'stub',
      createOrder: jest.fn(),
      verifyPaymentSignature: jest.fn().mockReturnValue(true),
      verifyWebhookSignature: jest.fn().mockReturnValue(true),
    };
    realtime = { emit: jest.fn(), emitToMany: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: PrismaService, useValue: prisma },
        { provide: RazorpayGateway, useValue: gateway },
        { provide: RealtimeService, useValue: realtime },
      ],
    }).compile();

    service = moduleRef.get(PaymentsService);
  });

  describe('money', () => {
    it('converts rupees to paise without float drift', () => {
      expect(toPaise('528.00')).toBe(52800);
      expect(toPaise('0.10')).toBe(10);
      expect(toPaise('1234.56')).toBe(123456);
    });
  });

  describe('confirm', () => {
    it('404s on an order that is not the caller’s', async () => {
      prisma.payment.findFirst.mockResolvedValue(null);
      await expect(
        service.confirm(USER, ORDER, { razorpayPaymentId: 'pay_1', razorpaySignature: 'sig' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('refuses a COD order', async () => {
      prisma.payment.findFirst.mockResolvedValue(paymentRow({ provider: 'COD' }));
      await expect(
        service.confirm(USER, ORDER, { razorpayPaymentId: 'pay_1', razorpaySignature: 'sig' }),
      ).rejects.toThrow(/cash on delivery/i);
    });

    it('rejects a bad signature and records why, without paying the order', async () => {
      prisma.payment.findFirst.mockResolvedValue(paymentRow());
      gateway.verifyPaymentSignature.mockReturnValue(false);

      await expect(
        service.confirm(USER, ORDER, { razorpayPaymentId: 'pay_1', razorpaySignature: 'forged' }),
      ).rejects.toThrow(/could not be verified/i);

      expect(prisma.payment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { failureReason: 'Signature verification failed' },
        }),
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('verifies against the stored provider order id, not one supplied by the client', async () => {
      prisma.payment.findFirst.mockResolvedValue(paymentRow());
      txPayment();

      await service.confirm(USER, ORDER, { razorpayPaymentId: 'pay_1', razorpaySignature: 'sig' });

      expect(gateway.verifyPaymentSignature).toHaveBeenCalledWith('order_abc', 'pay_1', 'sig');
    });

    it('marks the order paid and releases it to the shops', async () => {
      prisma.payment.findFirst.mockResolvedValue(paymentRow());
      txPayment();

      const result = await service.confirm(USER, ORDER, {
        razorpayPaymentId: 'pay_1',
        razorpaySignature: 'sig',
      });

      expect(result.status).toBe('PAID');
      expect(tx.masterOrder.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'PLACED' } }),
      );
      expect(realtime.emit).toHaveBeenCalledWith(
        'vendor:vendor-1',
        'order.created',
        expect.objectContaining({ vendorOrderId: 'vo-1' }),
      );
    });

    it('is idempotent: a second confirmation is a no-op, not a second order', async () => {
      prisma.payment.findFirst.mockResolvedValue(paymentRow({ status: 'PAID' }));

      const result = await service.confirm(USER, ORDER, {
        razorpayPaymentId: 'pay_1',
        razorpaySignature: 'sig',
      });

      expect(result.status).toBe('PAID');
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(realtime.emit).not.toHaveBeenCalled();
    });

    it('notifies the shops only once when the browser and the webhook race', async () => {
      prisma.payment.findFirst.mockResolvedValue(paymentRow());
      txPayment(0, 'PLACED'); // another caller already claimed the row

      await service.confirm(USER, ORDER, { razorpayPaymentId: 'pay_1', razorpaySignature: 'sig' });

      expect(tx.masterOrder.update).not.toHaveBeenCalled();
      expect(realtime.emit).not.toHaveBeenCalled();
    });

    it('refuses to resurrect a failed payment', async () => {
      prisma.payment.findFirst.mockResolvedValue(paymentRow({ status: 'FAILED' }));
      await expect(
        service.confirm(USER, ORDER, { razorpayPaymentId: 'pay_1', razorpaySignature: 'sig' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('fail', () => {
    it('cancels the order and puts every reserved unit back', async () => {
      prisma.payment.findFirst.mockResolvedValue({
        id: 'payment-1',
        status: 'PENDING',
        provider: 'RAZORPAY',
      });
      tx.payment.updateMany.mockResolvedValue({ count: 1 });
      tx.payment.findUniqueOrThrow.mockResolvedValue({
        masterOrderId: ORDER,
        masterOrder: { orderNumber: 'EP-260930-ABCDEF' },
      });
      tx.orderItem.findMany.mockResolvedValue([
        { productId: 'p1', quantity: 2 },
        { productId: 'p2', quantity: 1 },
      ]);

      const result = await service.fail(USER, ORDER, 'Customer closed the widget');

      expect(result.status).toBe('FAILED');
      expect(tx.product.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { stock: { increment: 2 } },
      });
      expect(tx.masterOrder.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'CANCELLED' } }),
      );
      expect(tx.vendorOrder.updateMany).toHaveBeenCalled();
    });

    it('will not fail an order that is already paid', async () => {
      prisma.payment.findFirst.mockResolvedValue({
        id: 'payment-1',
        status: 'PAID',
        provider: 'RAZORPAY',
      });
      await expect(service.fail(USER, ORDER, 'oops')).rejects.toThrow(/already paid/i);
    });

    it('does not restock twice if called again', async () => {
      prisma.payment.findFirst.mockResolvedValue({
        id: 'payment-1',
        status: 'PENDING',
        provider: 'RAZORPAY',
      });
      tx.payment.updateMany.mockResolvedValue({ count: 0 }); // someone else got there first
      tx.payment.findUniqueOrThrow.mockResolvedValue({
        masterOrderId: ORDER,
        masterOrder: { orderNumber: 'EP-260930-ABCDEF' },
      });

      await service.fail(USER, ORDER, 'retry');
      expect(tx.product.update).not.toHaveBeenCalled();
    });
  });

  describe('webhook', () => {
    const body = (event: string) =>
      JSON.stringify({
        event,
        payload: { payment: { entity: { id: 'pay_1', order_id: 'order_abc' } } },
      });

    it('rejects an unsigned or badly signed call', async () => {
      gateway.verifyWebhookSignature.mockReturnValue(false);
      await expect(service.handleWebhook(body('payment.captured'), 'nope')).rejects.toThrow(
        /Invalid webhook signature/,
      );
    });

    it('captures a payment it recognises', async () => {
      prisma.payment.findUnique.mockResolvedValue({ id: 'payment-1', status: 'PENDING' });
      txPayment();

      await expect(service.handleWebhook(body('payment.captured'), 'sig')).resolves.toEqual({
        handled: true,
        status: 'PAID',
      });
    });

    it('releases stock when the provider reports a failure', async () => {
      prisma.payment.findUnique.mockResolvedValue({ id: 'payment-1', status: 'PENDING' });
      tx.payment.updateMany.mockResolvedValue({ count: 1 });
      tx.payment.findUniqueOrThrow.mockResolvedValue({
        masterOrderId: ORDER,
        masterOrder: { orderNumber: 'EP-260930-ABCDEF' },
      });

      await expect(service.handleWebhook(body('payment.failed'), 'sig')).resolves.toEqual({
        handled: true,
        status: 'FAILED',
      });
      expect(tx.masterOrder.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'CANCELLED' } }),
      );
    });

    it('ignores an unknown order instead of throwing', async () => {
      prisma.payment.findUnique.mockResolvedValue(null);
      await expect(service.handleWebhook(body('payment.captured'), 'sig')).resolves.toMatchObject({
        handled: false,
      });
    });

    it('ignores events it does not care about', async () => {
      prisma.payment.findUnique.mockResolvedValue({ id: 'payment-1', status: 'PENDING' });
      await expect(service.handleWebhook(body('refund.created'), 'sig')).resolves.toMatchObject({
        handled: false,
      });
    });

    it('does not re-process an already settled payment', async () => {
      prisma.payment.findUnique.mockResolvedValue({ id: 'payment-1', status: 'PAID' });
      await expect(service.handleWebhook(body('payment.captured'), 'sig')).resolves.toEqual({
        handled: true,
        note: 'Already settled',
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('config', () => {
    it('exposes the public key id and never a secret', () => {
      const config = service.config();
      expect(config).toEqual({ provider: 'RAZORPAY', keyId: 'rzp_test_x', mode: 'stub' });
      expect(JSON.stringify(config)).not.toMatch(/secret/i);
    });
  });
});
