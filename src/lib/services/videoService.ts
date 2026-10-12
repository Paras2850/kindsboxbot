import { db } from "@/db";
import { videoDeliveries, videos } from "@/db/schema";
import { and, asc, count, desc, eq, inArray, max, notExists, notInArray, sql } from "drizzle-orm";
import { isRepeatMode } from "@/lib/services/settingsService";

export type Video = typeof videos.$inferSelect;

export async function getNextSequence(dbOrTx: typeof db | any = db): Promise<number> {
  const [row] = await dbOrTx.select({ max: max(videos.sequence) }).from(videos);
  return (row?.max ?? 0) + 1;
}

export interface CreateVideoInput {
  telegramFileId: string;
  fileUniqueId?: string | null;
  channelId?: string | null;
  channelMessageId?: number | null;
  contentHash?: string | null;
  caption?: string | null;
  fileSize?: number | null;
  durationSeconds?: number | null;
  width?: number | null;
  height?: number | null;
  addedBy?: string | null;
  uploadedAt?: Date | null;
}

export interface CreateVideoResult {
  video: Video;
  isDuplicate: boolean;
  duplicateReason?:
    | "channel_message"
    | "file_unique_id"
    | "content_hash"
    | "content_fingerprint"
    | "telegram_file_id"
    | "concurrent_conflict";
}

export async function findDuplicateVideo(
  input: {
    channelId?: string | null;
    channelMessageId?: number | null;
    fileUniqueId?: string | null;
    contentHash?: string | null;
    telegramFileId?: string | null;
    fileSize?: number | null;
    durationSeconds?: number | null;
    width?: number | null;
    height?: number | null;
  },
  dbOrTx: typeof db | any = db,
): Promise<{ existing: Video; reason: CreateVideoResult["duplicateReason"] } | null> {
  // 1. Check exact channel post message
  if (input.channelId && typeof input.channelMessageId === "number") {
    const [existing] = await dbOrTx
      .select()
      .from(videos)
      .where(
        and(
          eq(videos.channelId, input.channelId),
          eq(videos.channelMessageId, input.channelMessageId),
        ),
      )
      .limit(1);
    if (existing) {
      return { existing, reason: "channel_message" };
    }
  }

  // 2. Check Telegram file_unique_id
  if (input.fileUniqueId) {
    const [existing] = await dbOrTx
      .select()
      .from(videos)
      .where(eq(videos.fileUniqueId, input.fileUniqueId))
      .limit(1);
    if (existing) {
      return { existing, reason: "file_unique_id" };
    }
  }

  // 3. Check SHA-256 content hash (when raw bytes were hashed)
  if (input.contentHash) {
    const [existing] = await dbOrTx
      .select()
      .from(videos)
      .where(eq(videos.contentHash, input.contentHash))
      .limit(1);
    if (existing) {
      return { existing, reason: "content_hash" };
    }
  }

  // 4. Check Telegram file_id
  if (input.telegramFileId) {
    const [existing] = await dbOrTx
      .select()
      .from(videos)
      .where(eq(videos.telegramFileId, input.telegramFileId))
      .limit(1);
    if (existing) {
      return { existing, reason: "telegram_file_id" };
    }
  }

  // 5. Content fingerprint: match on exact byte size + duration/dimensions
  // Protects against re-uploading the identical video under a different Telegram message or unique_id
  if (typeof input.fileSize === "number" && input.fileSize > 0) {
    const candidates = await dbOrTx
      .select()
      .from(videos)
      .where(eq(videos.fileSize, input.fileSize));

    for (const existing of candidates) {
      // Both have duration > 0: match if duration is within 1s tolerance
      if (
        typeof input.durationSeconds === "number" &&
        input.durationSeconds > 0 &&
        typeof existing.durationSeconds === "number" &&
        existing.durationSeconds > 0
      ) {
        if (Math.abs(existing.durationSeconds - input.durationSeconds) <= 1) {
          return { existing, reason: "content_fingerprint" };
        }
      } else if (
        // One or both lack duration or duration is 0 (e.g. document vs video upload)
        (input.durationSeconds == null || input.durationSeconds === 0) ||
        (existing.durationSeconds == null || existing.durationSeconds === 0)
      ) {
        // If both specify width and height, they must match
        if (
          input.width &&
          input.height &&
          existing.width &&
          existing.height
        ) {
          if (input.width === existing.width && input.height === existing.height) {
            return { existing, reason: "content_fingerprint" };
          }
        } else {
          // Identical byte size down to the single byte
          return { existing, reason: "content_fingerprint" };
        }
      }
    }
  }

  return null;
}

export async function createVideo(input: CreateVideoInput): Promise<CreateVideoResult> {
  const lockKey = input.fileSize
    ? `video_size_${input.fileSize}`
    : input.fileUniqueId
      ? `video_uniq_${input.fileUniqueId}`
      : `video_msg_${input.channelId || ""}_${input.channelMessageId || ""}`;

  return await db.transaction(async (tx) => {
    // Acquire transaction-scoped advisory lock in Postgres to serialize concurrent imports
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`);

    const duplicate = await findDuplicateVideo(input, tx);
    if (duplicate) {
      return {
        video: duplicate.existing,
        isDuplicate: true,
        duplicateReason: duplicate.reason,
      };
    }

    const sequence = await getNextSequence(tx);
    try {
      const [video] = await tx
        .insert(videos)
        .values({
          telegramFileId: input.telegramFileId,
          fileUniqueId: input.fileUniqueId ?? null,
          channelId: input.channelId ?? null,
          channelMessageId: input.channelMessageId ?? null,
          contentHash: input.contentHash ?? null,
          caption: input.caption ?? null,
          sequence,
          fileSize: input.fileSize ?? null,
          durationSeconds: input.durationSeconds ?? null,
          width: input.width ?? null,
          height: input.height ?? null,
          addedBy: input.addedBy ?? null,
          uploadedAt: input.uploadedAt ?? new Date(),
        })
        .returning();

      return {
        video,
        isDuplicate: false,
      };
    } catch (err: any) {
      // 23505 is PostgreSQL unique_violation code - handles concurrent race conditions safely
      if (err?.code === "23505") {
        const raceDuplicate = await findDuplicateVideo(input, tx);
        if (raceDuplicate) {
          return {
            video: raceDuplicate.existing,
            isDuplicate: true,
            duplicateReason: "concurrent_conflict",
          };
        }
      }
      throw err;
    }
  });
}

export interface NextVideoResult {
  video: Video | null;
  isRepeat: boolean;
}

export interface GetNextVideoOptions {
  excludeVideoIds?: number[];
}

export async function getNextVideoForUser(
  userId: number,
  options?: GetNextVideoOptions,
): Promise<NextVideoResult> {
  const repeatMode = await isRepeatMode();

  const unseenConditions = [
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
  ];

  if (options?.excludeVideoIds && options.excludeVideoIds.length > 0) {
    unseenConditions.push(notInArray(videos.id, options.excludeVideoIds));
  }

  // 1. Always prioritize the newest UNSEEN active video: uploadedAt DESC, id DESC
  const [unseenVideo] = await db
    .select()
    .from(videos)
    .where(and(...unseenConditions))
    .orderBy(desc(videos.uploadedAt), desc(videos.id))
    .limit(1);

  if (unseenVideo) {
    return { video: unseenVideo, isRepeat: false };
  }

  // If user has seen all videos and repeat mode is disabled, no more videos
  if (!repeatMode) {
    return { video: null, isRepeat: false };
  }

  // 2. Repeat mode enabled: cycle through active videos in newest-first order
  const [totalActive, deliveredCount] = await Promise.all([
    countActiveVideos(),
    countDeliveredToUser(userId),
  ]);

  if (totalActive === 0) return { video: null, isRepeat: false };

  const offset = deliveredCount % totalActive;
  const repeatConditions = [eq(videos.status, "active")];
  if (options?.excludeVideoIds && options.excludeVideoIds.length > 0) {
    repeatConditions.push(notInArray(videos.id, options.excludeVideoIds));
  }

  const [repeatVideo] = await db
    .select()
    .from(videos)
    .where(and(...repeatConditions))
    .orderBy(desc(videos.uploadedAt), desc(videos.id))
    .limit(1)
    .offset(offset);

  return { video: repeatVideo ?? null, isRepeat: true };
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
    .orderBy(desc(videos.uploadedAt), desc(videos.id))
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
