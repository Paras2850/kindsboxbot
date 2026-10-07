import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { payments, plans, users } from "@/db/schema";
import { and, count, desc, eq, or, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const search = searchParams.get("search")?.trim();
  const page = Number(searchParams.get("page") ?? "1");
  const pageSize = Number(searchParams.get("pageSize") ?? "20");

  const conditions = [];
  if (status && status !== "ALL") {
    conditions.push(eq(payments.status, status));
  }
  if (search) {
    const asNumber = Number(search);
    conditions.push(
      or(
        sql`${users.username} ILIKE ${"%" + search + "%"}`,
        sql`${users.firstName} ILIKE ${"%" + search + "%"}`,
        sql`${payments.gatewayOrderId} ILIKE ${"%" + search + "%"}`,
        Number.isFinite(asNumber) ? eq(users.telegramId, asNumber) : sql`false`,
      ),
    );
  }
  const where = conditions.length ? and(...conditions) : undefined;

  const rows = await db
    .select({ payment: payments, user: users, planName: plans.name })
    .from(payments)
    .innerJoin(users, eq(users.id, payments.userId))
    .leftJoin(plans, eq(plans.id, payments.planId))
    .where(where)
    .orderBy(desc(payments.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const [{ c: total }] = await db
    .select({ c: count() })
    .from(payments)
    .innerJoin(users, eq(users.id, payments.userId))
    .where(where);

  return NextResponse.json({
    ok: true,
    rows: rows.map((r) => ({
      ...r.payment,
      planName: r.planName,
      user: { id: r.user.id, telegramId: r.user.telegramId, username: r.user.username, firstName: r.user.firstName },
    })),
    total,
    page,
    pageSize,
  });
}
