import { db } from "@/db";
import { settings } from "@/db/schema";
import { eq } from "drizzle-orm";

export const SETTINGS_DEFAULTS = {
  BOT_NAME: "Premium Video Bot",
  SUPPORT_USERNAME: "support",
  WELCOME_MESSAGE:
    "🎬 <b>Welcome to Premium Video Bot</b>\n\nGet access to exclusive short videos.\n\nUse /video to watch videos.",
  EXPIRED_MESSAGE: "❌ Your subscription has expired.\n\nChoose a new plan:",
  VIDEO_CAPTION_TEMPLATE: "🎬 Premium Video #{sequence}",
  MAINTENANCE_MODE: "false",
  REPEAT_MODE: "false",
  STORAGE_CHAT_ID: "",
  NOTIFY_NEW_VIDEO: "true",
  FREE_MODE: "false",
} as const;

export type SettingsKey = keyof typeof SETTINGS_DEFAULTS;

let cache: Record<string, string> | null = null;
let cacheExpiry = 0;
const CACHE_TTL_MS = 60_000; // Cache in memory for 1 minute to avoid repeated remote DB queries

export function clearSettingsCache(): void {
  cache = null;
  cacheExpiry = 0;
}

export async function getAllSettings(forceRefresh = false): Promise<Record<string, string>> {
  const now = Date.now();
  if (!forceRefresh && cache && now < cacheExpiry) {
    return cache;
  }
  const rows = await db.select().from(settings);
  const map: Record<string, string> = { ...SETTINGS_DEFAULTS };
  for (const row of rows) {
    map[row.key] = row.value;
  }
  cache = map;
  cacheExpiry = now + CACHE_TTL_MS;
  return map;
}

export async function getSetting(key: SettingsKey): Promise<string> {
  const all = await getAllSettings();
  return all[key] ?? SETTINGS_DEFAULTS[key] ?? "";
}

export async function setSetting(key: string, value: string): Promise<void> {
  await db
    .insert(settings)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date() } });
  cache = null;
}

export async function setSettings(values: Record<string, string>): Promise<void> {
  for (const [key, value] of Object.entries(values)) {
    await db
      .insert(settings)
      .values({ key, value, updatedAt: new Date() })
      .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date() } });
  }
  cache = null;
}

export async function isMaintenanceMode(): Promise<boolean> {
  return (await getSetting("MAINTENANCE_MODE")) === "true";
}

export async function isRepeatMode(): Promise<boolean> {
  return (await getSetting("REPEAT_MODE")) === "true";
}

export async function isFreeMode(): Promise<boolean> {
  return (await getSetting("FREE_MODE")) === "true";
}
