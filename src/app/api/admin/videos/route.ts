import { NextRequest, NextResponse } from "next/server";
import { listVideos } from "@/lib/services/videoService";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search") ?? undefined;
  const status = (searchParams.get("status") as "active" | "disabled" | "all" | null) ?? "all";
  const page = Number(searchParams.get("page") ?? "1");
  const pageSize = Number(searchParams.get("pageSize") ?? "20");

  const result = await listVideos({ search, status, page, pageSize });
  return NextResponse.json({ ok: true, ...result });
}
