import { NextResponse } from "next/server";
import { db } from "@/db";
import { payments, subscriptions, users, videoDeliveries, videos } from "@/db/schema";
import { and, count, eq, gte, sum } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const [[{ c: totalUsers }], [{ c: activeSubs }], [{ c: expiredSubs }], [{ c: totalVideos }], [{ c: totalDeliveries }], [{ c: newUsersToday }]] =
    await Promise.all([
      db.select({ c: count() }).from(users),
      db.select({ c: count() }).from(subscriptions).where(eq(subscriptions.status, "active")),
      db.select({ c: count() }).from(subscriptions).where(eq(subscriptions.status, "expired")),
      db.select({ c: count() }).from(videos),
      db.select({ c: count() }).from(videoDeliveries),
      db.select({ c: count() }).from(users).where(gte(users.createdAt, startOfToday)),
    ]);

  const [[{ total: todayRevenueRaw }], [{ total: totalRevenueRaw }]] = await Promise.all([
    db
      .select({ total: sum(payments.amount) })
      .from(payments)
      .where(and(eq(payments.status, "SUCCESS"), gte(payments.createdAt, startOfToday))),
    db.select({ total: sum(payments.amount) }).from(payments).where(eq(payments.status, "SUCCESS")),
  ]);

  return NextResponse.json({
    ok: true,
    stats: {
      totalUsers,
      activeSubscribers: activeSubs,
      expiredSubscribers: expiredSubs,
      todayRevenue: Number(todayRevenueRaw ?? 0),
      totalRevenue: Number(totalRevenueRaw ?? 0),
      totalVideos,
      videosDelivered: totalDeliveries,
      newUsersToday,
    },
  });
}
