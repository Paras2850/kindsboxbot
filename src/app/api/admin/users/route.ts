import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { payments, subscriptions, users, videoDeliveries, plans } from "@/db/schema";
import { and, count, desc, eq, inArray, or, sql, sum } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search")?.trim();
  const page = Number(searchParams.get("page") ?? "1");
  const pageSize = Number(searchParams.get("pageSize") ?? "20");

  const conditions = [];
  if (search) {
    const asNumber = Number(search);
    conditions.push(
      or(
        sql`${users.username} ILIKE ${"%" + search + "%"}`,
        sql`${users.firstName} ILIKE ${"%" + search + "%"}`,
        Number.isFinite(asNumber) ? eq(users.telegramId, asNumber) : sql`false`,
      ),
    );
  }
  const where = conditions.length ? and(...conditions) : undefined;

  const rows = await db
    .select()
    .from(users)
    .where(where)
    .orderBy(desc(users.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const [{ c: total }] = await db.select({ c: count() }).from(users).where(where);

  const userIds = rows.map((r) => r.id);

  const [subRows, paymentRows, deliveryRows] = await Promise.all([
    userIds.length
      ? db
          .select({ sub: subscriptions, planName: plans.name })
          .from(subscriptions)
          .leftJoin(plans, eq(plans.id, subscriptions.planId))
          .where(inArray(subscriptions.userId, userIds))
          .orderBy(desc(subscriptions.expiresAt))
      : Promise.resolve([]),
    userIds.length
      ? db
          .select({ userId: payments.userId, total: sum(payments.amount) })
          .from(payments)
          .where(and(inArray(payments.userId, userIds), eq(payments.status, "SUCCESS")))
          .groupBy(payments.userId)
      : Promise.resolve([]),
    userIds.length
      ? db
          .select({ userId: videoDeliveries.userId, c: count() })
          .from(videoDeliveries)
          .where(inArray(videoDeliveries.userId, userIds))
          .groupBy(videoDeliveries.userId)
      : Promise.resolve([]),
  ]);

  const latestSubByUser = new Map<number, (typeof subRows)[number]>();
  for (const row of subRows) {
    if (!latestSubByUser.has(row.sub.userId)) latestSubByUser.set(row.sub.userId, row);
  }
  const paidByUser = new Map(paymentRows.map((r) => [r.userId, Number(r.total ?? 0)]));
  const deliveriesByUser = new Map(deliveryRows.map((r) => [r.userId, r.c]));

  const data = rows.map((u) => {
    const subRow = latestSubByUser.get(u.id);
    const isActive = Boolean(
      subRow && subRow.sub.status === "active" && subRow.sub.expiresAt.getTime() > Date.now(),
    );
    return {
      ...u,
      subscription: subRow
        ? {
            status: isActive ? "active" : subRow.sub.status,
            planName: subRow.planName,
            startedAt: subRow.sub.startedAt,
            expiresAt: subRow.sub.expiresAt,
          }
        : null,
      totalPaid: paidByUser.get(u.id) ?? 0,
      videosWatched: deliveriesByUser.get(u.id) ?? 0,
    };
  });

  return NextResponse.json({ ok: true, rows: data, total, page, pageSize });
}
