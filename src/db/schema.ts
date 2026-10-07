import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Admins (web admin-panel accounts)
// ---------------------------------------------------------------------------
export const admins = pgTable("admins", {
  id: serial("id").primaryKey(),
  username: varchar("username", { length: 64 }).notNull(),
  passwordHash: text("password_hash").notNull(),
  telegramId: bigint("telegram_id", { mode: "number" }),
  role: varchar("role", { length: 32 }).notNull().default("admin"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("admins_username_idx").on(table.username),
]);

// ---------------------------------------------------------------------------
// Settings - simple key/value configuration store
// ---------------------------------------------------------------------------
export const settings = pgTable("settings", {
  key: varchar("key", { length: 128 }).primaryKey(),
  value: text("value").notNull().default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------------
export const plans = pgTable("plans", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 64 }).notNull(),
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
  durationDays: integer("duration_days").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Users (Telegram end users)
// ---------------------------------------------------------------------------
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  telegramId: bigint("telegram_id", { mode: "number" }).notNull(),
  username: varchar("username", { length: 128 }),
  firstName: varchar("first_name", { length: 128 }),
  lastName: varchar("last_name", { length: 128 }),
  isBlocked: boolean("is_blocked").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("users_telegram_id_idx").on(table.telegramId),
]);

// ---------------------------------------------------------------------------
// Subscriptions
// ---------------------------------------------------------------------------
export const subscriptions = pgTable("subscriptions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  planId: integer("plan_id").references(() => plans.id, { onDelete: "set null" }),
  status: varchar("status", { length: 16 }).notNull().default("active"), // active | expired | cancelled
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  remindedAt: timestamp("reminded_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("subscriptions_user_idx").on(table.userId),
  index("subscriptions_status_idx").on(table.status),
  index("subscriptions_expires_idx").on(table.expiresAt),
]);

// ---------------------------------------------------------------------------
// Payments / Transactions
// ---------------------------------------------------------------------------
export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  planId: integer("plan_id").references(() => plans.id, { onDelete: "set null" }),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 8 }).notNull().default("INR"),
  gateway: varchar("gateway", { length: 32 }).notNull().default("razorpay"),
  gatewayOrderId: varchar("gateway_order_id", { length: 128 }),
  gatewayPaymentId: varchar("gateway_payment_id", { length: 128 }),
  shortUrl: text("short_url"),
  status: varchar("status", { length: 16 }).notNull().default("PENDING"), // PENDING | SUCCESS | FAILED | EXPIRED | REFUNDED
  rawPayload: jsonb("raw_payload"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("payments_user_idx").on(table.userId),
  index("payments_status_idx").on(table.status),
  uniqueIndex("payments_gateway_order_idx").on(table.gatewayOrderId),
]);

// ---------------------------------------------------------------------------
// Videos
// ---------------------------------------------------------------------------
export const videos = pgTable("videos", {
  id: serial("id").primaryKey(),
  telegramFileId: text("telegram_file_id").notNull(),
  fileUniqueId: text("file_unique_id"),
  caption: text("caption"),
  sequence: integer("sequence").notNull().default(0),
  status: varchar("status", { length: 16 }).notNull().default("active"), // active | disabled
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
  deliveryCount: integer("delivery_count").notNull().default(0),
  fileSize: bigint("file_size", { mode: "number" }),
  durationSeconds: integer("duration_seconds"),
  addedBy: varchar("added_by", { length: 128 }),
}, (table) => [
  index("videos_sequence_idx").on(table.sequence),
  index("videos_status_idx").on(table.status),
]);

// ---------------------------------------------------------------------------
// Video deliveries (per-user delivery history / progress)
// ---------------------------------------------------------------------------
export const videoDeliveries = pgTable("video_deliveries", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  videoId: integer("video_id").notNull().references(() => videos.id, { onDelete: "cascade" }),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }).notNull().defaultNow(),
  status: varchar("status", { length: 16 }).notNull().default("delivered"),
}, (table) => [
  index("video_deliveries_user_idx").on(table.userId),
  index("video_deliveries_video_idx").on(table.videoId),
]);

// ---------------------------------------------------------------------------
// Support messages
// ---------------------------------------------------------------------------
export const supportMessages = pgTable("support_messages", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  message: text("message").notNull(),
  status: varchar("status", { length: 16 }).notNull().default("open"), // open | closed
  adminReply: text("admin_reply"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  repliedAt: timestamp("replied_at", { withTimezone: true }),
}, (table) => [
  index("support_messages_user_idx").on(table.userId),
  index("support_messages_status_idx").on(table.status),
]);

// ---------------------------------------------------------------------------
// Audit logs (admin actions)
// ---------------------------------------------------------------------------
export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  adminId: integer("admin_id").references(() => admins.id, { onDelete: "set null" }),
  action: varchar("action", { length: 64 }).notNull(),
  details: jsonb("details"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("audit_logs_admin_idx").on(table.adminId),
]);

// ---------------------------------------------------------------------------
// Broadcasts
// ---------------------------------------------------------------------------
export const broadcasts = pgTable("broadcasts", {
  id: serial("id").primaryKey(),
  adminId: integer("admin_id").references(() => admins.id, { onDelete: "set null" }),
  audience: varchar("audience", { length: 16 }).notNull(), // all | active | expired
  message: text("message").notNull(),
  totalRecipients: integer("total_recipients").notNull().default(0),
  successCount: integer("success_count").notNull().default(0),
  failedCount: integer("failed_count").notNull().default(0),
  status: varchar("status", { length: 16 }).notNull().default("pending"), // pending | processing | completed
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});
