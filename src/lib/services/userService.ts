import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { TelegramUser } from "@/lib/telegram/types";

export type User = typeof users.$inferSelect;

interface CachedUserEntry {
  user: User;
  expiresAt: number;
}

const userCache = new Map<number, CachedUserEntry>();
const USER_CACHE_TTL_MS = 60_000; // 1 minute

export function invalidateUserCache(telegramIdOrUserId: number): void {
  for (const [tgId, entry] of userCache.entries()) {
    if (entry.user.id === telegramIdOrUserId || entry.user.telegramId === telegramIdOrUserId) {
      userCache.delete(tgId);
    }
  }
}

function setCachedUser(user: User): void {
  if (userCache.size > 2000) {
    const now = Date.now();
    for (const [key, val] of userCache.entries()) {
      if (val.expiresAt <= now) userCache.delete(key);
    }
    if (userCache.size > 2000) userCache.clear();
  }
  userCache.set(user.telegramId, {
    user,
    expiresAt: Date.now() + USER_CACHE_TTL_MS,
  });
}

export async function upsertTelegramUser(tgUser: TelegramUser): Promise<User> {
  const cached = userCache.get(tgUser.id);
  const newUsername = tgUser.username ?? null;
  const newFirst = tgUser.first_name ?? null;
  const newLast = tgUser.last_name ?? null;

  if (cached && cached.expiresAt > Date.now()) {
    if (
      cached.user.username === newUsername &&
      cached.user.firstName === newFirst &&
      cached.user.lastName === newLast
    ) {
      return cached.user;
    }
  }

  const [existing] = await db.select().from(users).where(eq(users.telegramId, tgUser.id)).limit(1);

  if (existing) {
    if (
      existing.username === newUsername &&
      existing.firstName === newFirst &&
      existing.lastName === newLast
    ) {
      setCachedUser(existing);
      return existing;
    }

    const [updated] = await db
      .update(users)
      .set({
        username: newUsername,
        firstName: newFirst,
        lastName: newLast,
        updatedAt: new Date(),
      })
      .where(eq(users.id, existing.id))
      .returning();
    setCachedUser(updated);
    return updated;
  }

  const [created] = await db
    .insert(users)
    .values({
      telegramId: tgUser.id,
      username: newUsername,
      firstName: newFirst,
      lastName: newLast,
    })
    .returning();
  setCachedUser(created);
  return created;
}

export async function getUserByTelegramId(telegramId: number): Promise<User | undefined> {
  const cached = userCache.get(telegramId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.user;
  }
  const [user] = await db.select().from(users).where(eq(users.telegramId, telegramId)).limit(1);
  if (user) {
    setCachedUser(user);
  }
  return user;
}

export async function getUserById(id: number): Promise<User | undefined> {
  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (user) {
    setCachedUser(user);
  }
  return user;
}

export async function setUserBlocked(userId: number, blocked: boolean): Promise<void> {
  await db.update(users).set({ isBlocked: blocked, updatedAt: new Date() }).where(eq(users.id, userId));
  invalidateUserCache(userId);
}

export function displayName(user: Pick<User, "firstName" | "lastName" | "username">): string {
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  if (name) return name;
  if (user.username) return `@${user.username}`;
  return "Unknown";
}
