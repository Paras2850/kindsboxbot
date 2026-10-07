import { db } from "@/db";
import { supportMessages } from "@/db/schema";

export async function saveSupportMessage(userId: number, message: string) {
  const [row] = await db.insert(supportMessages).values({ userId, message }).returning();
  return row;
}
