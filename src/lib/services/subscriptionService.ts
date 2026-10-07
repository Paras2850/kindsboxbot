import { db } from "@/db";
import { plans, subscriptions, users } from "@/db/schema";
import { and, desc, eq, inArray, isNotNull, lt } from "drizzle-orm";

export type Subscription = typeof subscriptions.$inferSelect;

export interface SubscriptionWithPlan extends Subscription {
  planName: string | null;
}

/** Returns the most relevant subscription row for a user, auto-expiring it if needed. */
export async function getCurrentSubscription(userId: number): Promise<SubscriptionWithPlan | null> {
  const [row] = await db
    .select({ sub: subscriptions, planName: plans.name })
    .from(subscriptions)
    .leftJoin(plans, eq(subscriptions.planId, plans.id))
    .where(eq(subscriptions.userId, userId))
    .orderBy(desc(subscriptions.expiresAt))
    .limit(1);

  if (!row) return null;

  let sub = row.sub;
  if (sub.status === "active" && sub.expiresAt.getTime() <= Date.now()) {
    const [updated] = await db
      .update(subscriptions)
      .set({ status: "expired" })
      .where(eq(subscriptions.id, sub.id))
      .returning();
    sub = updated;
  }

  return { ...sub, planName: row.planName };
}

export async function isSubscriptionActive(userId: number): Promise<boolean> {
  const sub = await getCurrentSubscription(userId);
  return Boolean(sub && sub.status === "active" && sub.expiresAt.getTime() > Date.now());
}

/** Activates a new subscription period or extends the currently active one. Idempotent-safe via transaction. */
export async function activateOrExtendSubscription(userId: number, planId: number, durationDays: number) {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, userId))
      .orderBy(desc(subscriptions.expiresAt))
      .limit(1);

    const now = new Date();
    const durationMs = durationDays * 24 * 60 * 60 * 1000;

    if (row && row.status === "active" && row.expiresAt.getTime() > now.getTime()) {
      const newExpiry = new Date(row.expiresAt.getTime() + durationMs);
      const [updated] = await tx
        .update(subscriptions)
        .set({ expiresAt: newExpiry, planId, remindedAt: null })
        .where(eq(subscriptions.id, row.id))
        .returning();
      return updated;
    }

    const [created] = await tx
      .insert(subscriptions)
      .values({
        userId,
        planId,
        status: "active",
        startedAt: now,
        expiresAt: new Date(now.getTime() + durationMs),
      })
      .returning();
    return created;
  });
}

export async function manuallySetSubscription(
  userId: number,
  opts: { planId: number | null; status: "active" | "expired" | "cancelled"; expiresAt: Date },
) {
  const [row] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .orderBy(desc(subscriptions.expiresAt))
    .limit(1);

  if (row) {
    const [updated] = await db
      .update(subscriptions)
      .set({ status: opts.status, expiresAt: opts.expiresAt, planId: opts.planId, remindedAt: null })
      .where(eq(subscriptions.id, row.id))
      .returning();
    return updated;
  }

  const [created] = await db
    .insert(subscriptions)
    .values({
      userId,
      planId: opts.planId,
      status: opts.status,
      startedAt: new Date(),
      expiresAt: opts.expiresAt,
    })
    .returning();
  return created;
}

/** Finds subscriptions that have passed their expiry but are still marked active, and expires them. */
export async function expireDueSubscriptions(): Promise<{ userId: number; telegramId: number }[]> {
  const due = await db
    .select({ id: subscriptions.id, userId: subscriptions.userId, telegramId: users.telegramId })
    .from(subscriptions)
    .innerJoin(users, eq(users.id, subscriptions.userId))
    .where(and(eq(subscriptions.status, "active"), lt(subscriptions.expiresAt, new Date())));

  if (due.length === 0) return [];

  await db
    .update(subscriptions)
    .set({ status: "expired" })
    .where(
      inArray(
        subscriptions.id,
        due.map((d) => d.id),
      ),
    );

  return due.map((d) => ({ userId: d.userId, telegramId: d.telegramId }));
}

/** Subscriptions expiring within the next N hours that have not been reminded yet. */
export async function findSubscriptionsNeedingReminder(hoursAhead: number) {
  const threshold = new Date(Date.now() + hoursAhead * 60 * 60 * 1000);
  const rows = await db
    .select({ sub: subscriptions, telegramId: users.telegramId, planName: plans.name })
    .from(subscriptions)
    .innerJoin(users, eq(users.id, subscriptions.userId))
    .leftJoin(plans, eq(subscriptions.planId, plans.id))
    .where(
      and(
        eq(subscriptions.status, "active"),
        lt(subscriptions.expiresAt, threshold),
        isNotNull(subscriptions.expiresAt),
      ),
    );

  return rows.filter((r) => r.sub.remindedAt === null && r.sub.expiresAt.getTime() > Date.now());
}

export async function markReminded(subscriptionId: number) {
  await db.update(subscriptions).set({ remindedAt: new Date() }).where(eq(subscriptions.id, subscriptionId));
}
