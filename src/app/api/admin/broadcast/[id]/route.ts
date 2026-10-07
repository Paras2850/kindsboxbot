import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { broadcasts } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [row] = await db.select().from(broadcasts).where(eq(broadcasts.id, Number(id))).limit(1);
  if (!row) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true, broadcast: row });
}
