import { db } from "@/db";
import { payments, users } from "@/db/schema";
import { and, desc, eq, gt, lt } from "drizzle-orm";
import { getPaymentProvider } from "@/lib/payments";
import type { PaymentStatus } from "@/lib/payments/types";
import { getPlanById } from "@/lib/services/planService";
import { activateOrExtendSubscription } from "@/lib/services/subscriptionService";

export type Payment = typeof payments.$inferSelect;

const PENDING_REUSE_WINDOW_MS = 15 * 60 * 1000;

export class PaymentError extends Error {}

/** Creates (or reuses an existing pending) payment order for a plan purchase. */
export async function createPaymentForPlan(userId: number, planId: number) {
  const plan = await getPlanById(planId);
  if (!plan || !plan.isActive) {
    throw new PaymentError("This plan is no longer available.");
  }

  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new PaymentError("User not found.");

  const reuseCutoff = new Date(Date.now() - PENDING_REUSE_WINDOW_MS);
  const [existing] = await db
    .select()
    .from(payments)
    .where(
      and(
        eq(payments.userId, userId),
        eq(payments.planId, planId),
        eq(payments.status, "PENDING"),
        gt(payments.createdAt, reuseCutoff),
      ),
    )
    .orderBy(desc(payments.createdAt))
    .limit(1);

  if (existing && existing.shortUrl) {
    return existing;
  }

  const [payment] = await db
    .insert(payments)
    .values({
      userId,
      planId,
      amount: plan.price,
      currency: "INR",
      gateway: "razorpay",
      status: "PENDING",
    })
    .returning();

  try {
    const provider = getPaymentProvider();
    const order = await provider.createOrder({
      amountInRupees: Number(plan.price),
      currency: "INR",
      receipt: `payment-${payment.id}`,
      description: `${plan.name} (${plan.durationDays} day${plan.durationDays === 1 ? "" : "s"}) - Premium Video Bot`,
      notes: {
        paymentId: String(payment.id),
        userId: String(userId),
        planId: String(planId),
        telegramId: String(user.telegramId),
      },
    });

    const [updated] = await db
      .update(payments)
      .set({ gatewayOrderId: order.providerOrderId, shortUrl: order.paymentUrl, updatedAt: new Date() })
      .where(eq(payments.id, payment.id))
      .returning();

    return updated;
  } catch (err) {
    await db
      .update(payments)
      .set({ status: "FAILED", updatedAt: new Date() })
      .where(eq(payments.id, payment.id));
    throw err instanceof Error ? err : new PaymentError("Failed to create payment order.");
  }
}

interface FinalizeResult {
  payment: Payment;
  alreadyProcessed: boolean;
  subscriptionExpiresAt?: Date;
}

/** Marks a payment as SUCCESS and activates/extends the subscription. Safe to call multiple times (idempotent). */
export async function finalizePaymentSuccess(paymentId: number, gatewayPaymentId: string | null, raw?: unknown): Promise<FinalizeResult> {
  return db.transaction(async (tx) => {
    const [payment] = await tx.select().from(payments).where(eq(payments.id, paymentId)).limit(1);
    if (!payment) throw new PaymentError(`Payment ${paymentId} not found`);

    if (payment.status === "SUCCESS") {
      return { payment, alreadyProcessed: true };
    }

    const [updated] = await tx
      .update(payments)
      .set({
        status: "SUCCESS",
        gatewayPaymentId: gatewayPaymentId ?? payment.gatewayPaymentId,
        rawPayload: raw ? (raw as object) : payment.rawPayload,
        updatedAt: new Date(),
      })
      .where(eq(payments.id, paymentId))
      .returning();

    if (!updated.planId) {
      throw new PaymentError("Payment has no associated plan");
    }
    const plan = await getPlanById(updated.planId);
    if (!plan) throw new PaymentError("Plan not found for payment");

    const subscription = await activateOrExtendSubscription(updated.userId, updated.planId, plan.durationDays);

    return { payment: updated, alreadyProcessed: false, subscriptionExpiresAt: subscription.expiresAt };
  });
}

export async function markPaymentStatus(paymentId: number, status: PaymentStatus) {
  const [updated] = await db
    .update(payments)
    .set({ status, updatedAt: new Date() })
    .where(eq(payments.id, paymentId))
    .returning();
  return updated;
}

export async function getPaymentById(id: number): Promise<Payment | undefined> {
  const [row] = await db.select().from(payments).where(eq(payments.id, id)).limit(1);
  return row;
}

/** Fallback path: actively poll the gateway for a payment's status (used by the "I've paid" button). */
export async function pollAndFinalizePayment(paymentId: number): Promise<FinalizeResult | { status: "pending" | "failed" | "unknown" }> {
  const payment = await getPaymentById(paymentId);
  if (!payment) throw new PaymentError("Payment not found");
  if (payment.status === "SUCCESS") {
    return { payment, alreadyProcessed: true };
  }
  if (!payment.gatewayOrderId) return { status: "unknown" };

  const provider = getPaymentProvider();
  const check = await provider.checkOrderStatus(payment.gatewayOrderId);

  if (check.status === "paid") {
    return finalizePaymentSuccess(paymentId, check.providerPaymentId);
  }
  if (check.status === "cancelled" || check.status === "expired") {
    await markPaymentStatus(paymentId, check.status === "expired" ? "EXPIRED" : "FAILED");
    return { status: "failed" };
  }
  return { status: "pending" };
}

/** Expires stale pending payments so they stop showing as "pending" forever. */
export async function expireStalePayments(olderThanMinutes = 30): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanMinutes * 60 * 1000);
  const rows = await db
    .update(payments)
    .set({ status: "EXPIRED", updatedAt: new Date() })
    .where(and(eq(payments.status, "PENDING"), lt(payments.createdAt, cutoff)))
    .returning();
  return rows.length;
}

export interface PaymentListFilters {
  status?: PaymentStatus | "ALL";
  search?: string;
  page?: number;
  pageSize?: number;
}
