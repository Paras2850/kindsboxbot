import { NextRequest, NextResponse } from "next/server";
import { deleteVideo, updateVideo } from "@/lib/services/videoService";
import { getAdminSession } from "@/lib/auth/session";
import { logAudit } from "@/lib/services/auditService";
import { z } from "zod";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  caption: z.string().max(1024).optional(),
  status: z.enum(["active", "disabled"]).optional(),
  sequence: z.number().int().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const videoId = Number(id);
  if (!Number.isFinite(videoId)) {
    return NextResponse.json({ ok: false, error: "Invalid video id" }, { status: 400 });
  }

  const json = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });
  }

  const video = await updateVideo(videoId, parsed.data);
  if (!video) return NextResponse.json({ ok: false, error: "Video not found" }, { status: 404 });

  const session = await getAdminSession();
  await logAudit(session?.adminId ?? null, "videos.update", { videoId, patch: parsed.data });

  return NextResponse.json({ ok: true, video });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const videoId = Number(id);
  if (!Number.isFinite(videoId)) {
    return NextResponse.json({ ok: false, error: "Invalid video id" }, { status: 400 });
  }

  await deleteVideo(videoId);

  const session = await getAdminSession();
  await logAudit(session?.adminId ?? null, "videos.delete", { videoId });

  return NextResponse.json({ ok: true });
}
