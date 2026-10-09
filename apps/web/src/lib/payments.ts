import { api } from './api-client';

export interface PaymentHandle {
  provider: 'RAZORPAY';
  keyId: string;
  mode: 'live' | 'stub';
  razorpayOrderId: string;
  amountPaise: number;
  currency: string;
}

export class PaymentCancelled extends Error {
  constructor() {
    super('Payment was cancelled');
    this.name = 'PaymentCancelled';
  }
}

interface RazorpayResponse {
  razorpay_payment_id: string;
  razorpay_signature: string;
}

interface RazorpayConstructor {
  new (options: Record<string, unknown>): { open: () => void };
}

const CHECKOUT_SCRIPT = 'https://checkout.razorpay.com/v1/checkout.js';

/** Loads Razorpay's widget once and caches the tag. */
function loadCheckoutScript(): Promise<RazorpayConstructor> {
  const existing = (window as unknown as { Razorpay?: RazorpayConstructor }).Razorpay;
  if (existing) return Promise.resolve(existing);

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = CHECKOUT_SCRIPT;
    script.onload = () => {
      const loaded = (window as unknown as { Razorpay?: RazorpayConstructor }).Razorpay;
      if (loaded) resolve(loaded);
      else reject(new Error('Razorpay checkout did not load'));
    };
    script.onerror = () => reject(new Error('Could not reach Razorpay'));
    document.body.appendChild(script);
  });
}

/**
 * Takes an order from "created" to "paid".
 *
 * Two routes, same ending — the server only ever believes a signature it can
 * verify itself:
 *
 * - **live**: open Razorpay's hosted widget, then post what it hands back.
 * - **stub** (no API keys configured): ask our own API for the signature the
 *   provider would have produced. That keeps the demo working offline without
 *   weakening the real path, because the stub refuses to exist the moment real
 *   keys are present.
 *
 * A dismissed widget is reported too, so the reserved stock goes back rather
 * than sitting on an order nobody will pay for.
 */
export async function payWithRazorpay(
  masterOrderId: string,
  handle: PaymentHandle,
  customer: { name?: string; phone?: string },
): Promise<void> {
  if (handle.mode === 'stub') {
    const signed = await api.post<{ razorpayPaymentId: string; razorpaySignature: string }>(
      `/api/orders/${masterOrderId}/payment/simulate`,
      {},
    );
    await api.post(`/api/orders/${masterOrderId}/payment/confirm`, signed);
    return;
  }

  const Razorpay = await loadCheckoutScript();

  await new Promise<void>((resolve, reject) => {
    const widget = new Razorpay({
      key: handle.keyId,
      order_id: handle.razorpayOrderId,
      amount: handle.amountPaise,
      currency: handle.currency,
      name: 'E-PlantShopping',
      description: 'Plants from your neighbourhood nurseries',
      prefill: { name: customer.name, contact: customer.phone },
      theme: { color: '#059669' },
      handler: (response: RazorpayResponse) => {
        api
          .post(`/api/orders/${masterOrderId}/payment/confirm`, {
            razorpayPaymentId: response.razorpay_payment_id,
            razorpaySignature: response.razorpay_signature,
          })
          .then(() => resolve())
          .catch(reject);
      },
      modal: {
        ondismiss: () => {
          // Fire and forget: releasing the stock must not block the UI.
          void api
            .post(`/api/orders/${masterOrderId}/payment/failed`, {
              reason: 'Customer closed the payment window',
            })
            .catch(() => undefined);
          reject(new PaymentCancelled());
        },
      },
    });

    widget.open();
  });
}
