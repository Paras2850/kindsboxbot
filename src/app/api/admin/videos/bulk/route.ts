import { NextRequest, NextResponse } from "next/server";
import { bulkDelete, bulkUpdateStatus } from "@/lib/services/videoService";
import { getAdminSession } from "@/lib/auth/session";
import { logAudit } from "@/lib/services/auditService";
import { z } from "zod";

export const dynamic = "force-dynamic";

const schema = z.object({
  ids: z.array(z.number().int()).min(1),
  action: z.enum(["enable", "disable", "delete"]),
});

export async function POST(req: NextRequest) {
  const json = await req.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });
  }

  const { ids, action } = parsed.data;

  if (action === "delete") {
    await bulkDelete(ids);
  } else {
    await bulkUpdateStatus(ids, action === "enable" ? "active" : "disabled");
  }

  const session = await getAdminSession();
  await logAudit(session?.adminId ?? null, `videos.bulk_${action}`, { ids });

  return NextResponse.json({ ok: true, affected: ids.length });
}
