import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { RazorpayGateway, StubRazorpayGateway } from './razorpay.gateway';

/** Rupees → paise, the only unit Razorpay accepts. */
export const toPaise = (rupees: Prisma.Decimal | string): number =>
  new Prisma.Decimal(rupees).times(100).toNumber();

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: RazorpayGateway,
    private readonly realtime: RealtimeService,
  ) {}

  /** What the browser needs to open the checkout widget. */
  config() {
    return { provider: 'RAZORPAY', keyId: this.gateway.keyId, mode: this.gateway.mode };
  }

  /**
   * Opens the provider-side order for a freshly created master order and
   * returns everything the browser widget needs.
   *
   * Deliberately called after the checkout transaction commits — a network
   * call inside a transaction would hold catalogue row locks open for as long
   * as Razorpay takes to answer.
   */
  async openProviderOrder(masterOrderId: string, amount: Prisma.Decimal | string, receipt: string) {
    const providerOrder = await this.gateway.createOrder(toPaise(amount), receipt);

    await this.prisma.payment.update({
      where: { masterOrderId },
      data: { razorpayOrderId: providerOrder.id },
    });

    return {
      provider: 'RAZORPAY' as const,
      keyId: this.gateway.keyId,
      mode: this.gateway.mode,
      razorpayOrderId: providerOrder.id,
      amountPaise: providerOrder.amount,
      currency: providerOrder.currency,
    };
  }

  /**
   * Confirms a payment reported by the browser.
   *
   * The signature is the only thing that makes this trustworthy — the client
   * could claim anything, so nothing is believed until `order_id|payment_id`
   * verifies against the key secret. A failed check is recorded, not silently
   * ignored.
   */
  async confirm(
    userId: string,
    masterOrderId: string,
    dto: { razorpayPaymentId: string; razorpaySignature: string },
  ) {
    const payment = await this.prisma.payment.findFirst({
      where: { masterOrderId, masterOrder: { customerId: userId } },
      include: { masterOrder: { select: { id: true, status: true, orderNumber: true } } },
    });

    if (!payment) throw new NotFoundException('Order not found');
    if (payment.provider === 'COD') {
      throw new BadRequestException('This is a cash on delivery order');
    }

    // Idempotent: Razorpay's callback and its webhook both land here.
    if (payment.status === 'PAID') {
      return { status: 'PAID' as const, orderNumber: payment.masterOrder.orderNumber };
    }
    if (payment.status === 'FAILED') {
      throw new BadRequestException('This payment already failed — please place the order again');
    }

    const valid = this.gateway.verifyPaymentSignature(
      payment.razorpayOrderId ?? '',
      dto.razorpayPaymentId,
      dto.razorpaySignature,
    );

    if (!valid) {
      this.logger.warn(`Signature mismatch on ${payment.masterOrder.orderNumber}`);
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { failureReason: 'Signature verification failed' },
      });
      throw new BadRequestException('Payment could not be verified');
    }

    return this.markPaid(payment.id, dto.razorpayPaymentId, dto.razorpaySignature);
  }

  /**
   * Flips the order from PENDING_PAYMENT to PLACED.
   *
   * Guarded by a conditional `updateMany`: if two callers (the browser and the
   * webhook) race, exactly one of them transitions the order and only that one
   * notifies the shops.
   */
  private async markPaid(paymentId: string, providerPaymentId: string, signature?: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.payment.updateMany({
        where: { id: paymentId, status: 'PENDING' },
        data: {
          status: 'PAID',
          paidAt: new Date(),
          razorpayPaymentId: providerPaymentId,
          razorpaySignature: signature,
          failureReason: null,
        },
      });

      const payment = await tx.payment.findUniqueOrThrow({
        where: { id: paymentId },
        include: {
          masterOrder: {
            select: {
              id: true,
              orderNumber: true,
              status: true,
              vendorOrders: {
                select: {
                  id: true,
                  orderNumber: true,
                  total: true,
                  vendorId: true,
                  _count: { select: { items: true } },
                },
              },
            },
          },
        },
      });

      if (claimed.count === 1 && payment.masterOrder.status === 'PENDING_PAYMENT') {
        await tx.masterOrder.update({
          where: { id: payment.masterOrderId },
          data: { status: 'PLACED' },
        });
      }

      return { firstToClaim: claimed.count === 1, payment };
    });

    // The shops only hear about an order once the money is in.
    if (result.firstToClaim) {
      for (const vendorOrder of result.payment.masterOrder.vendorOrders) {
        this.realtime.emit(RealtimeService.vendorRoom(vendorOrder.vendorId), 'order.created', {
          vendorOrderId: vendorOrder.id,
          orderNumber: vendorOrder.orderNumber,
          masterOrderId: result.payment.masterOrderId,
          total: vendorOrder.total.toFixed(2),
          itemCount: vendorOrder._count.items,
          at: new Date().toISOString(),
        });
      }
      this.logger.log(`Payment captured for ${result.payment.masterOrder.orderNumber}`);
    }

    return { status: 'PAID' as const, orderNumber: result.payment.masterOrder.orderNumber };
  }

  /**
   * Abandoned or declined payment: cancel the order and put the reserved stock
   * back, in one transaction.
   */
  async fail(userId: string, masterOrderId: string, reason: string) {
    const payment = await this.prisma.payment.findFirst({
      where: { masterOrderId, masterOrder: { customerId: userId } },
      select: { id: true, status: true, provider: true },
    });

    if (!payment) throw new NotFoundException('Order not found');
    if (payment.provider === 'COD')
      throw new BadRequestException('This is a cash on delivery order');
    if (payment.status === 'PAID') throw new BadRequestException('This order is already paid');

    return this.releaseOrder(payment.id, reason);
  }

  private async releaseOrder(paymentId: string, reason: string) {
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.payment.updateMany({
        where: { id: paymentId, status: 'PENDING' },
        data: { status: 'FAILED', failureReason: reason.slice(0, 280) },
      });

      const payment = await tx.payment.findUniqueOrThrow({
        where: { id: paymentId },
        select: { masterOrderId: true, masterOrder: { select: { orderNumber: true } } },
      });

      if (claimed.count === 1) {
        // Unsold stock must not stay reserved against an order nobody paid for.
        const items = await tx.orderItem.findMany({
          where: { vendorOrder: { masterOrderId: payment.masterOrderId } },
          select: { productId: true, quantity: true },
        });
        for (const item of items) {
          await tx.product.update({
            where: { id: item.productId },
            data: { stock: { increment: item.quantity } },
          });
        }

        await tx.masterOrder.update({
          where: { id: payment.masterOrderId },
          data: { status: 'CANCELLED' },
        });
        await tx.vendorOrder.updateMany({
          where: { masterOrderId: payment.masterOrderId },
          data: { status: 'REJECTED', rejectionReason: 'Payment was not completed' },
        });

        this.logger.log(
          `Payment failed for ${payment.masterOrder.orderNumber}: ${reason} — ${items.length} line(s) restocked`,
        );
      }

      return { status: 'FAILED' as const, orderNumber: payment.masterOrder.orderNumber };
    });
  }

  /**
   * Razorpay's server-to-server notification — the authoritative signal.
   *
   * The browser can be closed mid-payment, so the webhook is what guarantees a
   * captured payment is eventually recorded. Verified against the raw body: a
   * re-serialised JSON object would produce a different HMAC.
   */
  async handleWebhook(rawBody: string, signature: string) {
    if (!this.gateway.verifyWebhookSignature(rawBody, signature)) {
      throw new BadRequestException('Invalid webhook signature');
    }

    const event = JSON.parse(rawBody) as {
      event?: string;
      payload?: {
        payment?: { entity?: { id?: string; order_id?: string; error_description?: string } };
      };
    };

    const entity = event.payload?.payment?.entity;
    if (!entity?.order_id) return { handled: false, reason: 'No payment in the payload' };

    const payment = await this.prisma.payment.findUnique({
      where: { razorpayOrderId: entity.order_id },
      select: { id: true, status: true },
    });
    if (!payment) return { handled: false, reason: 'Unknown order' };
    if (payment.status !== 'PENDING') return { handled: true, note: 'Already settled' };

    if (event.event === 'payment.captured') {
      await this.markPaid(payment.id, entity.id ?? 'unknown');
      return { handled: true, status: 'PAID' };
    }
    if (event.event === 'payment.failed') {
      await this.releaseOrder(payment.id, entity.error_description ?? 'Declined by the provider');
      return { handled: true, status: 'FAILED' };
    }

    return { handled: false, reason: `Ignored event ${event.event ?? 'unknown'}` };
  }

  /**
   * Demo-only shortcut: returns the signature Razorpay would have sent, so the
   * flow can be completed offline. Refuses to exist when real keys are set.
   */
  simulateSuccess(masterOrderId: string, userId: string) {
    if (!(this.gateway instanceof StubRazorpayGateway)) {
      throw new BadRequestException('Not available when Razorpay is configured');
    }

    return this.prisma.payment
      .findFirst({
        where: { masterOrderId, masterOrder: { customerId: userId } },
        select: { razorpayOrderId: true },
      })
      .then((payment) => {
        if (!payment?.razorpayOrderId) throw new NotFoundException('Order not found');
        const razorpayPaymentId = `pay_${Date.now().toString(36)}`;
        return {
          razorpayPaymentId,
          razorpaySignature: (this.gateway as StubRazorpayGateway).signPayment(
            payment.razorpayOrderId,
            razorpayPaymentId,
          ),
        };
      });
  }
}
