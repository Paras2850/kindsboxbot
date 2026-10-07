import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { runAllJobs } from "@/lib/cron/jobs";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret") ?? new URL(req.url).searchParams.get("secret");
  if (!env.cronSecret || secret !== env.cronSecret) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const result = await runAllJobs();
  return NextResponse.json({ ok: true, result });
}

export async function GET(req: NextRequest) {
  return POST(req);
}
