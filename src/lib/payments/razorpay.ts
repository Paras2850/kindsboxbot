import crypto from "crypto";
import { env } from "@/lib/env";
import type {
  CreateOrderParams,
  CreateOrderResult,
  PaymentProvider,
  PaymentStatusCheck,
  WebhookEvent,
} from "@/lib/payments/types";

const API_BASE = "https://api.razorpay.com/v1";

function authHeader(): string {
  const token = Buffer.from(`${env.razorpayKeyId}:${env.razorpayKeySecret}`).toString("base64");
  return `Basic ${token}`;
}

interface RazorpayPaymentLink {
  id: string;
  short_url: string;
  status: string;
  amount: number;
  payments?: Array<{ payment_id: string; status: string }>;
}

export class RazorpayProvider implements PaymentProvider {
  readonly name = "razorpay";

  private get configured() {
    return Boolean(env.razorpayKeyId && env.razorpayKeySecret);
  }

  async createOrder(params: CreateOrderParams): Promise<CreateOrderResult> {
    if (!this.configured) {
      throw new Error(
        "Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in your environment.",
      );
    }

    const body = {
      amount: Math.round(params.amountInRupees * 100),
      currency: params.currency ?? "INR",
      description: params.description,
      reference_id: params.receipt,
      notes: params.notes,
      notify: { sms: false, email: false },
      reminder_enable: false,
      callback_method: "get" as const,
      callback_url: `${env.appUrl}/payments/callback`,
    };

    const res = await fetch(`${API_BASE}/payment_links`, {
      method: "POST",
      headers: {
        Authorization: authHeader(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = (await res.json()) as RazorpayPaymentLink & { error?: { description?: string } };
    if (!res.ok || !data.id) {
      throw new Error(`Razorpay order creation failed: ${data.error?.description ?? res.statusText}`);
    }

    return {
      providerOrderId: data.id,
      paymentUrl: data.short_url,
      raw: data,
    };
  }

  verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
    if (!signature || !env.razorpayWebhookSecret) return false;
    const expected = crypto.createHmac("sha256", env.razorpayWebhookSecret).update(rawBody).digest("hex");
    try {
      return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
    } catch {
      return false;
    }
  }

  parseWebhookEvent(rawBody: string): WebhookEvent | null {
    try {
      const payload = JSON.parse(rawBody) as {
        event?: string;
        payload?: {
          payment_link?: { entity?: { id?: string; notes?: Record<string, string> } };
          payment?: { entity?: { id?: string; notes?: Record<string, string> } };
        };
      };

      const paymentLink = payload.payload?.payment_link?.entity;
      const payment = payload.payload?.payment?.entity;
      const notes = paymentLink?.notes ?? payment?.notes ?? {};

      let type: WebhookEvent["type"] = "unknown";
      if (payload.event === "payment_link.paid" || payload.event === "payment.captured") {
        type = "payment.success";
      } else if (payload.event === "payment_link.cancelled" || payload.event === "payment.failed") {
        type = "payment.failed";
      }

      return {
        type,
        providerOrderId: paymentLink?.id ?? null,
        providerPaymentId: payment?.id ?? null,
        notes,
        raw: payload,
      };
    } catch (err) {
      console.error("[razorpay] failed to parse webhook payload", err instanceof Error ? err.message : err);
      return null;
    }
  }

  async checkOrderStatus(providerOrderId: string): Promise<PaymentStatusCheck> {
    if (!this.configured) {
      return { status: "unknown", providerPaymentId: null };
    }
    const res = await fetch(`${API_BASE}/payment_links/${providerOrderId}`, {
      headers: { Authorization: authHeader() },
      cache: "no-store",
    });
    if (!res.ok) return { status: "unknown", providerPaymentId: null };
    const data = (await res.json()) as RazorpayPaymentLink;
    const lastPayment = data.payments?.[data.payments.length - 1];

    let status: PaymentStatusCheck["status"] = "unknown";
    if (data.status === "paid") status = "paid";
    else if (data.status === "created" || data.status === "partially_paid") status = "pending";
    else if (data.status === "cancelled") status = "cancelled";
    else if (data.status === "expired") status = "expired";

    return { status, providerPaymentId: lastPayment?.payment_id ?? null };
  }
}
