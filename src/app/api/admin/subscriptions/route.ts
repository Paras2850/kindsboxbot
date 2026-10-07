import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { plans, subscriptions, users } from "@/db/schema";
import { and, count, desc, eq, gt, lt } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const filter = searchParams.get("filter") ?? "all"; // all | active | expired | expiring_soon
  const planFilter = searchParams.get("plan");
  const page = Number(searchParams.get("page") ?? "1");
  const pageSize = Number(searchParams.get("pageSize") ?? "20");

  const conditions = [];
  if (filter === "active") conditions.push(and(eq(subscriptions.status, "active"), gt(subscriptions.expiresAt, new Date())));
  if (filter === "expired") conditions.push(eq(subscriptions.status, "expired"));
  if (filter === "expiring_soon") {
    conditions.push(
      and(
        eq(subscriptions.status, "active"),
        gt(subscriptions.expiresAt, new Date()),
        lt(subscriptions.expiresAt, new Date(Date.now() + 24 * 60 * 60 * 1000)),
      ),
    );
  }
  if (planFilter) conditions.push(eq(plans.name, planFilter));

  const where = conditions.length ? and(...conditions) : undefined;

  const rows = await db
    .select({ sub: subscriptions, planName: plans.name, user: users })
    .from(subscriptions)
    .innerJoin(users, eq(users.id, subscriptions.userId))
    .leftJoin(plans, eq(plans.id, subscriptions.planId))
    .where(where)
    .orderBy(desc(subscriptions.expiresAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const [{ c: total }] = await db
    .select({ c: count() })
    .from(subscriptions)
    .innerJoin(users, eq(users.id, subscriptions.userId))
    .leftJoin(plans, eq(plans.id, subscriptions.planId))
    .where(where);

  return NextResponse.json({
    ok: true,
    rows: rows.map((r) => ({
      ...r.sub,
      planName: r.planName,
      user: { id: r.user.id, telegramId: r.user.telegramId, username: r.user.username, firstName: r.user.firstName },
    })),
    total,
    page,
    pageSize,
  });
}
