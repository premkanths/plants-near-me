import { Injectable, Logger } from '@nestjs/common';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export interface RazorpayOrder {
  id: string;
  amount: number; // paise
  currency: string;
  /** Our own order number, echoed back for reconciliation. */
  receipt: string;
}

/**
 * Razorpay, behind a seam.
 *
 * `LiveRazorpayGateway` talks to the real test-mode API; `StubRazorpayGateway`
 * stands in when no keys are configured. The stub is not a no-op — it mints
 * realistic ids and signs payloads with the *same* HMAC the real thing uses, so
 * verification, tampering checks and webhooks are all exercised for real in
 * tests and in the offline demo. Only the HTTP call is faked.
 */
export abstract class RazorpayGateway {
  abstract readonly mode: 'live' | 'stub';
  /** Public key id, safe to hand to the browser checkout widget. */
  abstract readonly keyId: string;

  abstract createOrder(amountPaise: number, receipt: string): Promise<RazorpayOrder>;

  /** Razorpay signs `order_id|payment_id` with the key secret. */
  abstract verifyPaymentSignature(
    razorpayOrderId: string,
    razorpayPaymentId: string,
    signature: string,
  ): boolean;

  /** Webhooks are signed over the raw request body with a separate secret. */
  abstract verifyWebhookSignature(rawBody: string, signature: string): boolean;
}

/** Constant-time compare that cannot throw on a length mismatch. */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export const sign = (payload: string, secret: string): string =>
  createHmac('sha256', secret).update(payload).digest('hex');

abstract class BaseRazorpayGateway extends RazorpayGateway {
  constructor(
    readonly keyId: string,
    protected readonly keySecret: string,
    protected readonly webhookSecret: string,
  ) {
    super();
  }

  verifyPaymentSignature(
    razorpayOrderId: string,
    razorpayPaymentId: string,
    signature: string,
  ): boolean {
    if (!signature) return false;
    return safeEqual(sign(`${razorpayOrderId}|${razorpayPaymentId}`, this.keySecret), signature);
  }

  verifyWebhookSignature(rawBody: string, signature: string): boolean {
    if (!signature || !this.webhookSecret) return false;
    return safeEqual(sign(rawBody, this.webhookSecret), signature);
  }

  abstract createOrder(amountPaise: number, receipt: string): Promise<RazorpayOrder>;
}

@Injectable()
export class LiveRazorpayGateway extends BaseRazorpayGateway {
  readonly mode = 'live' as const;
  private readonly logger = new Logger(LiveRazorpayGateway.name);

  async createOrder(amountPaise: number, receipt: string): Promise<RazorpayOrder> {
    const auth = Buffer.from(`${this.keyId}:${this.keySecret}`).toString('base64');

    const response = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: amountPaise,
        currency: 'INR',
        receipt,
        payment_capture: 1,
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      this.logger.error(`Razorpay rejected the order: ${response.status} ${detail}`);
      throw new Error('Could not reach the payment provider');
    }

    const order = (await response.json()) as RazorpayOrder;
    return {
      id: order.id,
      amount: order.amount,
      currency: order.currency,
      receipt: order.receipt ?? receipt,
    };
  }
}

@Injectable()
export class StubRazorpayGateway extends BaseRazorpayGateway {
  readonly mode = 'stub' as const;

  createOrder(amountPaise: number, receipt: string): Promise<RazorpayOrder> {
    return Promise.resolve({
      id: `order_${randomBytes(9).toString('base64url')}`,
      amount: amountPaise,
      currency: 'INR',
      receipt,
    });
  }

  /**
   * Lets the demo complete a payment without Razorpay's hosted widget: the
   * caller can ask for the signature the real provider would have returned.
   * Only ever reachable in stub mode.
   */
  signPayment(razorpayOrderId: string, razorpayPaymentId: string): string {
    return sign(`${razorpayOrderId}|${razorpayPaymentId}`, this.keySecret);
  }
}
