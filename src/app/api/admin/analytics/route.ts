import { NextResponse } from "next/server";
import { db } from "@/db";
import { payments, subscriptions, users, videoDeliveries, videos } from "@/db/schema";
import { and, count, desc, eq, gte, sql, sum } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfWeek = new Date(startOfToday.getTime() - 6 * 24 * 60 * 60 * 1000);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [[{ c: totalUsers }], [{ c: newUsersToday }], [{ c: newUsersWeek }], [{ c: activeSubs }], [{ c: expiredSubs }]] =
    await Promise.all([
      db.select({ c: count() }).from(users),
      db.select({ c: count() }).from(users).where(gte(users.createdAt, startOfToday)),
      db.select({ c: count() }).from(users).where(gte(users.createdAt, startOfWeek)),
      db.select({ c: count() }).from(subscriptions).where(eq(subscriptions.status, "active")),
      db.select({ c: count() }).from(subscriptions).where(eq(subscriptions.status, "expired")),
    ]);

  const [[{ total: revenueToday }], [{ total: revenueWeek }], [{ total: revenueMonth }]] = await Promise.all([
    db.select({ total: sum(payments.amount) }).from(payments).where(and(eq(payments.status, "SUCCESS"), gte(payments.createdAt, startOfToday))),
    db.select({ total: sum(payments.amount) }).from(payments).where(and(eq(payments.status, "SUCCESS"), gte(payments.createdAt, startOfWeek))),
    db.select({ total: sum(payments.amount) }).from(payments).where(and(eq(payments.status, "SUCCESS"), gte(payments.createdAt, startOfMonth))),
  ]);

  const mostWatched = await db
    .select({ id: videos.id, caption: videos.caption, sequence: videos.sequence, deliveryCount: videos.deliveryCount })
    .from(videos)
    .orderBy(desc(videos.deliveryCount))
    .limit(10);

  const [{ c: totalDeliveries }] = await db.select({ c: count() }).from(videoDeliveries);

  // Conversion rate = users with at least one SUCCESS payment / total users
  const [{ c: payingUsers }] = await db
    .select({ c: sql<number>`count(distinct ${payments.userId})` })
    .from(payments)
    .where(eq(payments.status, "SUCCESS"));
  const conversionRate = totalUsers > 0 ? (Number(payingUsers) / totalUsers) * 100 : 0;

  const revenueSeries = await db
    .select({
      day: sql<string>`to_char(${payments.createdAt}, 'YYYY-MM-DD')`,
      total: sum(payments.amount),
    })
    .from(payments)
    .where(and(eq(payments.status, "SUCCESS"), gte(payments.createdAt, startOfWeek)))
    .groupBy(sql`to_char(${payments.createdAt}, 'YYYY-MM-DD')`)
    .orderBy(sql`to_char(${payments.createdAt}, 'YYYY-MM-DD')`);

  const userSeries = await db
    .select({
      day: sql<string>`to_char(${users.createdAt}, 'YYYY-MM-DD')`,
      total: count(),
    })
    .from(users)
    .where(gte(users.createdAt, startOfWeek))
    .groupBy(sql`to_char(${users.createdAt}, 'YYYY-MM-DD')`)
    .orderBy(sql`to_char(${users.createdAt}, 'YYYY-MM-DD')`);

  return NextResponse.json({
    ok: true,
    analytics: {
      totalUsers,
      newUsersToday,
      newUsersWeek,
      activeSubscribers: activeSubs,
      expiredSubscribers: expiredSubs,
      revenueToday: Number(revenueToday ?? 0),
      revenueWeek: Number(revenueWeek ?? 0),
      revenueMonth: Number(revenueMonth ?? 0),
      mostWatched,
      totalDeliveries,
      conversionRate,
      revenueSeries: revenueSeries.map((r) => ({ day: r.day, total: Number(r.total ?? 0) })),
      userSeries: userSeries.map((r) => ({ day: r.day, total: Number(r.total ?? 0) })),
    },
  });
}
