import { NextRequest, NextResponse } from "next/server";
import { getPaymentProvider } from "@/lib/payments";
import { finalizePaymentSuccess, markPaymentStatus } from "@/lib/services/paymentService";
import { getPlanById } from "@/lib/services/planService";
import { getUserById } from "@/lib/services/userService";
import { notifyUser } from "@/lib/services/notificationService";
import { paymentSuccessText } from "@/lib/bot/texts";
import { db } from "@/db";
import { payments } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

// Simple in-memory idempotency guard against duplicate webhook deliveries
// (Razorpay may retry webhooks that don't respond fast enough / with 2xx).
const processedEventIds = new Set<string>();

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-razorpay-signature");

  const provider = getPaymentProvider();

  if (!provider.verifyWebhookSignature(rawBody, signature)) {
    console.warn("[razorpay-webhook] invalid signature");
    return NextResponse.json({ ok: false, error: "invalid signature" }, { status: 401 });
  }

  // De-dupe using signature as a cheap idempotency key (same payload always
  // produces the same signature).
  if (signature && processedEventIds.has(signature)) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  const event = provider.parseWebhookEvent(rawBody);
  if (!event) {
    return NextResponse.json({ ok: false, error: "unparsable payload" }, { status: 400 });
  }

  if (signature) {
    processedEventIds.add(signature);
    if (processedEventIds.size > 5000) {
      const first = processedEventIds.values().next().value;
      if (first) processedEventIds.delete(first);
    }
  }

  const paymentIdNote = event.notes?.paymentId;
  if (!paymentIdNote) {
    return NextResponse.json({ ok: true, ignored: true });
  }
  const paymentId = Number(paymentIdNote);
  if (!Number.isFinite(paymentId)) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  try {
    if (event.type === "payment.success") {
      const result = await finalizePaymentSuccess(paymentId, event.providerPaymentId, event.raw);
      if (!result.alreadyProcessed) {
        const [payment] = await db.select().from(payments).where(eq(payments.id, paymentId)).limit(1);
        const user = payment ? await getUserById(payment.userId) : undefined;
        const plan = payment?.planId ? await getPlanById(payment.planId) : undefined;
        if (user && plan && result.subscriptionExpiresAt) {
          await notifyUser(
            user.telegramId,
            paymentSuccessText(plan.name, Number(payment!.amount), result.subscriptionExpiresAt),
          );
        }
      }
    } else if (event.type === "payment.failed") {
      await markPaymentStatus(paymentId, "FAILED");
    }
  } catch (err) {
    console.error("[razorpay-webhook] failed to process event", err instanceof Error ? err.message : err);
    // Still return 200 to avoid endless gateway retries for a permanent error,
    // but log loudly so it shows up in monitoring.
  }

  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({ ok: true, message: "Razorpay webhook endpoint. Use POST." });
}
