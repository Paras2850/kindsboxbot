import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { plans } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getAllPlans } from "@/lib/services/planService";
import { getAdminSession } from "@/lib/auth/session";
import { logAudit } from "@/lib/services/auditService";
import { z } from "zod";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await getAllPlans();
  return NextResponse.json({ ok: true, rows });
}

const createSchema = z.object({
  name: z.string().min(1).max(64),
  price: z.number().positive(),
  durationDays: z.number().int().positive(),
  sortOrder: z.number().int().optional(),
});

export async function POST(req: NextRequest) {
  const json = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });

  const [plan] = await db
    .insert(plans)
    .values({
      name: parsed.data.name,
      price: parsed.data.price.toFixed(2),
      durationDays: parsed.data.durationDays,
      sortOrder: parsed.data.sortOrder ?? 0,
    })
    .returning();

  const session = await getAdminSession();
  await logAudit(session?.adminId ?? null, "plans.create", { planId: plan.id });

  return NextResponse.json({ ok: true, plan });
}

const patchSchema = z.object({
  id: z.number().int(),
  name: z.string().min(1).max(64).optional(),
  price: z.number().positive().optional(),
  durationDays: z.number().int().positive().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export async function PATCH(req: NextRequest) {
  const json = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });

  const { id, price, ...rest } = parsed.data;
  const patch: Record<string, unknown> = { ...rest };
  if (price !== undefined) patch.price = price.toFixed(2);

  const [plan] = await db.update(plans).set(patch).where(eq(plans.id, id)).returning();
  if (!plan) return NextResponse.json({ ok: false, error: "Plan not found" }, { status: 404 });

  const session = await getAdminSession();
  await logAudit(session?.adminId ?? null, "plans.update", { planId: id, patch });

  return NextResponse.json({ ok: true, plan });
}
