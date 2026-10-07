import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { payments, plans, videoDeliveries } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { getUserById, setUserBlocked } from "@/lib/services/userService";
import { getCurrentSubscription, manuallySetSubscription } from "@/lib/services/subscriptionService";
import { countDeliveredToUser } from "@/lib/services/videoService";
import { getAdminSession } from "@/lib/auth/session";
import { logAudit } from "@/lib/services/auditService";
import { notifyUser } from "@/lib/services/notificationService";
import { z } from "zod";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = Number(id);
  const user = await getUserById(userId);
  if (!user) return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });

  const [subscription, videosWatched, paymentHistory] = await Promise.all([
    getCurrentSubscription(userId),
    countDeliveredToUser(userId),
    db
      .select({ payment: payments, planName: plans.name })
      .from(payments)
      .leftJoin(plans, eq(plans.id, payments.planId))
      .where(eq(payments.userId, userId))
      .orderBy(desc(payments.createdAt))
      .limit(50),
  ]);

  const totalPaid = paymentHistory
    .filter((p) => p.payment.status === "SUCCESS")
    .reduce((sum, p) => sum + Number(p.payment.amount), 0);

  return NextResponse.json({
    ok: true,
    user,
    subscription,
    videosWatched,
    totalPaid,
    payments: paymentHistory.map((p) => ({ ...p.payment, planName: p.planName })),
  });
}

const actionSchema = z.object({
  action: z.enum(["block", "unblock", "activate", "extend", "expire", "cancel"]),
  planId: z.number().int().optional(),
  days: z.number().int().positive().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = Number(id);
  const user = await getUserById(userId);
  if (!user) return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });

  const json = await req.json().catch(() => null);
  const parsed = actionSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });

  const session = await getAdminSession();
  const { action } = parsed.data;

  if (action === "block" || action === "unblock") {
    await setUserBlocked(userId, action === "block");
    await logAudit(session?.adminId ?? null, `user.${action}`, { userId });
    return NextResponse.json({ ok: true });
  }

  if (action === "activate" || action === "extend") {
    const days = parsed.data.days ?? 30;
    const current = await getCurrentSubscription(userId);
    const base =
      action === "extend" && current && current.expiresAt.getTime() > Date.now() ? current.expiresAt : new Date();
    const expiresAt = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
    const planId = parsed.data.planId ?? current?.planId ?? null;
    await manuallySetSubscription(userId, { planId, status: "active", expiresAt });
    await logAudit(session?.adminId ?? null, `user.subscription.${action}`, { userId, days, planId });
    await notifyUser(
      user.telegramId,
      `✅ Your subscription has been ${action === "extend" ? "extended" : "activated"} by an administrator.\n\nValid until: ${expiresAt.toLocaleString()}`,
    );
    return NextResponse.json({ ok: true });
  }

  if (action === "expire" || action === "cancel") {
    const current = await getCurrentSubscription(userId);
    await manuallySetSubscription(userId, {
      planId: current?.planId ?? null,
      status: action === "expire" ? "expired" : "cancelled",
      expiresAt: new Date(),
    });
    await logAudit(session?.adminId ?? null, `user.subscription.${action}`, { userId });
    await notifyUser(user.telegramId, `⚠️ Your subscription has been ${action === "expire" ? "expired" : "cancelled"} by an administrator.`);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false, error: "Unsupported action" }, { status: 400 });
}
