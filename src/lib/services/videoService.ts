import { db } from "@/db";
import { videoDeliveries, videos } from "@/db/schema";
import { and, asc, count, desc, eq, inArray, max, notExists, notInArray, sql } from "drizzle-orm";
import { isRepeatMode } from "@/lib/services/settingsService";

export type Video = typeof videos.$inferSelect;

export async function getNextSequence(): Promise<number> {
  const [row] = await db.select({ max: max(videos.sequence) }).from(videos);
  return (row?.max ?? 0) + 1;
}

export async function createVideo(input: {
  telegramFileId: string;
  fileUniqueId?: string | null;
  caption?: string | null;
  fileSize?: number | null;
  durationSeconds?: number | null;
  addedBy?: string | null;
}): Promise<Video> {
  // Prevent duplicates if already imported (e.g. webhook retries)
  if (input.fileUniqueId) {
    const [existing] = await db
      .select()
      .from(videos)
      .where(eq(videos.fileUniqueId, input.fileUniqueId))
      .limit(1);
    if (existing) {
      return existing;
    }
  }

  const [existingByFileId] = await db
    .select()
    .from(videos)
    .where(eq(videos.telegramFileId, input.telegramFileId))
    .limit(1);
  if (existingByFileId) {
    return existingByFileId;
  }

  const sequence = await getNextSequence();
  const [video] = await db
    .insert(videos)
    .values({
      telegramFileId: input.telegramFileId,
      fileUniqueId: input.fileUniqueId ?? null,
      caption: input.caption ?? null,
      sequence,
      fileSize: input.fileSize ?? null,
      durationSeconds: input.durationSeconds ?? null,
      addedBy: input.addedBy ?? null,
    })
    .returning();
  return video;
}

export interface NextVideoResult {
  video: Video | null;
  isRepeat: boolean;
}

export async function getNextVideoForUser(userId: number): Promise<NextVideoResult> {
  const repeatMode = await isRepeatMode();

  if (!repeatMode) {
    // Single efficient query using NOT EXISTS - avoids fetching delivery IDs over network
    const [video] = await db
      .select()
      .from(videos)
      .where(
        and(
          eq(videos.status, "active"),
          notExists(
            db
              .select({ id: videoDeliveries.id })
              .from(videoDeliveries)
              .where(
                and(
                  eq(videoDeliveries.videoId, videos.id),
                  eq(videoDeliveries.userId, userId),
                ),
              ),
          ),
        ),
      )
      .orderBy(asc(videos.sequence))
      .limit(1);

    return { video: video ?? null, isRepeat: false };
  }

  // Repeat mode: cycle through active videos based on how many deliveries the user already has.
  const [totalActive, deliveredCount] = await Promise.all([
    countActiveVideos(),
    countDeliveredToUser(userId),
  ]);

  if (totalActive === 0) return { video: null, isRepeat: false };

  const offset = deliveredCount % totalActive;
  const [video] = await db
    .select()
    .from(videos)
    .where(eq(videos.status, "active"))
    .orderBy(asc(videos.sequence))
    .limit(1)
    .offset(offset);

  return { video: video ?? null, isRepeat: deliveredCount >= totalActive };
}

export async function recordDelivery(userId: number, videoId: number): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.insert(videoDeliveries).values({ userId, videoId });
    await tx
      .update(videos)
      .set({ deliveryCount: sql`${videos.deliveryCount} + 1` })
      .where(eq(videos.id, videoId));
  });
}

export async function countDeliveredToUser(userId: number): Promise<number> {
  const [row] = await db.select({ c: count() }).from(videoDeliveries).where(eq(videoDeliveries.userId, userId));
  return row?.c ?? 0;
}

export async function countActiveVideos(): Promise<number> {
  const [row] = await db.select({ c: count() }).from(videos).where(eq(videos.status, "active"));
  return row?.c ?? 0;
}

export interface VideoListFilters {
  search?: string;
  status?: "active" | "disabled" | "all";
  page?: number;
  pageSize?: number;
}

export async function listVideos(filters: VideoListFilters) {
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 20;

  const conditions = [];
  if (filters.status && filters.status !== "all") {
    conditions.push(eq(videos.status, filters.status));
  }
  if (filters.search) {
    conditions.push(sql`${videos.caption} ILIKE ${"%" + filters.search + "%"}`);
  }
  const where = conditions.length ? and(...conditions) : undefined;

  const rows = await db
    .select()
    .from(videos)
    .where(where)
    .orderBy(desc(videos.sequence))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const [{ c: total }] = await db
    .select({ c: count() })
    .from(videos)
    .where(where);

  return { rows, total, page, pageSize };
}

export async function updateVideo(
  id: number,
  patch: Partial<Pick<Video, "caption" | "status" | "sequence">>,
): Promise<Video | undefined> {
  const [row] = await db.update(videos).set(patch).where(eq(videos.id, id)).returning();
  return row;
}

export async function deleteVideo(id: number): Promise<void> {
  await db.delete(videos).where(eq(videos.id, id));
}

export async function bulkUpdateStatus(ids: number[], status: "active" | "disabled"): Promise<void> {
  if (ids.length === 0) return;
  await db.update(videos).set({ status }).where(inArray(videos.id, ids));
}

export async function bulkDelete(ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  await db.delete(videos).where(inArray(videos.id, ids));
}

export async function getMostWatchedVideos(limit = 10) {
  return db.select().from(videos).orderBy(desc(videos.deliveryCount)).limit(limit);
}

export async function getTotalDeliveries(): Promise<number> {
  const [row] = await db.select({ c: count() }).from(videoDeliveries);
  return row?.c ?? 0;
}
