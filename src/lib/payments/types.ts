export type PaymentStatus = "PENDING" | "SUCCESS" | "FAILED" | "EXPIRED" | "REFUNDED";

export interface CreateOrderParams {
  amountInRupees: number;
  currency?: string;
  receipt: string;
  description: string;
  notes: Record<string, string>;
  customerName?: string;
}

export interface CreateOrderResult {
  providerOrderId: string;
  paymentUrl: string;
  raw: unknown;
}

export type WebhookEventType = "payment.success" | "payment.failed" | "unknown";

export interface WebhookEvent {
  type: WebhookEventType;
  providerOrderId: string | null;
  providerPaymentId: string | null;
  notes: Record<string, string>;
  raw: unknown;
}

export interface PaymentStatusCheck {
  status: "paid" | "pending" | "cancelled" | "expired" | "unknown";
  providerPaymentId: string | null;
}

/**
 * Abstraction over a real payment gateway. Telegram handlers and admin code
 * never talk to a gateway SDK directly - they always go through this
 * interface (and PaymentService), which makes it straightforward to swap
 * Razorpay for another Indian gateway (Cashfree, PhonePe, etc.) later.
 */
export interface PaymentProvider {
  readonly name: string;
  createOrder(params: CreateOrderParams): Promise<CreateOrderResult>;
  verifyWebhookSignature(rawBody: string, signature: string | null): boolean;
  parseWebhookEvent(rawBody: string): WebhookEvent | null;
  checkOrderStatus(providerOrderId: string): Promise<PaymentStatusCheck>;
}
