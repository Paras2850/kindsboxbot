import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { broadcasts } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { getAudienceTelegramIds, sendBroadcast } from "@/lib/services/notificationService";
import { getAdminSession } from "@/lib/auth/session";
import { logAudit } from "@/lib/services/auditService";
import { z } from "zod";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(broadcasts).orderBy(desc(broadcasts.createdAt)).limit(50);
  return NextResponse.json({ ok: true, rows });
}

const schema = z.object({
  audience: z.enum(["all", "active", "expired"]),
  message: z.string().min(1).max(4000),
});

export async function POST(req: NextRequest) {
  const json = await req.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });

  const session = await getAdminSession();
  const telegramIds = await getAudienceTelegramIds(parsed.data.audience);

  const [job] = await db
    .insert(broadcasts)
    .values({
      adminId: session?.adminId ?? null,
      audience: parsed.data.audience,
      message: parsed.data.message,
      totalRecipients: telegramIds.length,
      status: "processing",
    })
    .returning();

  await logAudit(session?.adminId ?? null, "broadcast.send", { jobId: job.id, audience: parsed.data.audience, recipients: telegramIds.length });

  // Fire-and-forget background processing so the admin panel doesn't block
  // while potentially thousands of messages are sent (respecting Telegram's
  // rate limits).
  void (async () => {
    try {
      const result = await sendBroadcast(telegramIds, parsed.data.message, async (progress) => {
        await db
          .update(broadcasts)
          .set({ successCount: progress.success, failedCount: progress.failed })
          .where(eq(broadcasts.id, job.id));
      });
      await db
        .update(broadcasts)
        .set({
          successCount: result.success,
          failedCount: result.failed,
          status: "completed",
          completedAt: new Date(),
        })
        .where(eq(broadcasts.id, job.id));
    } catch (err) {
      console.error("[broadcast] job failed", err instanceof Error ? err.message : err);
      await db.update(broadcasts).set({ status: "completed", completedAt: new Date() }).where(eq(broadcasts.id, job.id));
    }
  })();

  return NextResponse.json({ ok: true, jobId: job.id, recipients: telegramIds.length });
}
