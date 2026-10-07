import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { supportMessages, users } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { notifyUser } from "@/lib/services/notificationService";
import { getAdminSession } from "@/lib/auth/session";
import { logAudit } from "@/lib/services/auditService";
import { z } from "zod";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");

  const rows = await db
    .select({ message: supportMessages, user: users })
    .from(supportMessages)
    .innerJoin(users, eq(users.id, supportMessages.userId))
    .where(status && status !== "all" ? eq(supportMessages.status, status) : undefined)
    .orderBy(desc(supportMessages.createdAt))
    .limit(100);

  return NextResponse.json({
    ok: true,
    rows: rows.map((r) => ({
      ...r.message,
      user: { id: r.user.id, telegramId: r.user.telegramId, username: r.user.username, firstName: r.user.firstName },
    })),
  });
}

const replySchema = z.object({
  id: z.number().int(),
  reply: z.string().min(1).max(2000),
});

export async function POST(req: NextRequest) {
  const json = await req.json().catch(() => null);
  const parsed = replySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });

  const [row] = await db
    .select({ message: supportMessages, user: users })
    .from(supportMessages)
    .innerJoin(users, eq(users.id, supportMessages.userId))
    .where(eq(supportMessages.id, parsed.data.id))
    .limit(1);

  if (!row) return NextResponse.json({ ok: false, error: "Message not found" }, { status: 404 });

  await db
    .update(supportMessages)
    .set({ adminReply: parsed.data.reply, status: "closed", repliedAt: new Date() })
    .where(eq(supportMessages.id, parsed.data.id));

  await notifyUser(row.user.telegramId, `🛠 <b>Support reply</b>\n\n${parsed.data.reply}`);

  const session = await getAdminSession();
  await logAudit(session?.adminId ?? null, "support.reply", { messageId: parsed.data.id });

  return NextResponse.json({ ok: true });
}
