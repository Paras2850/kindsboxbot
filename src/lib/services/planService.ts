import { db } from "@/db";
import { plans } from "@/db/schema";
import { asc, eq } from "drizzle-orm";

export type Plan = typeof plans.$inferSelect;

export async function getActivePlans(): Promise<Plan[]> {
  return db.select().from(plans).where(eq(plans.isActive, true)).orderBy(asc(plans.sortOrder), asc(plans.price));
}

export async function getAllPlans(): Promise<Plan[]> {
  return db.select().from(plans).orderBy(asc(plans.sortOrder), asc(plans.price));
}

export async function getPlanById(id: number): Promise<Plan | undefined> {
  const [plan] = await db.select().from(plans).where(eq(plans.id, id)).limit(1);
  return plan;
}

export const DEFAULT_PLANS = [
  { name: "Daily Plan", price: "7.00", durationDays: 1, sortOrder: 1 },
  { name: "Weekly Plan", price: "19.00", durationDays: 7, sortOrder: 2 },
  { name: "Monthly Plan", price: "39.00", durationDays: 30, sortOrder: 3 },
];
