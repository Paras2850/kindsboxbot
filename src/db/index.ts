import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

function getDatabaseUrl(): string {
  const raw = process.env.DATABASE_URL || "";
  return raw.replace(/^["']|["']$/g, "").trim();
}

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
  __arenaNextJsDatabaseUrl?: string;
};

const currentUrl = getDatabaseUrl();

export const pool =
  globalForDb.__arenaNextJsPostgresqlPool && globalForDb.__arenaNextJsDatabaseUrl === currentUrl
    ? globalForDb.__arenaNextJsPostgresqlPool
    : new Pool({
        connectionString: currentUrl,
      });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__arenaNextJsPostgresqlPool = pool;
  globalForDb.__arenaNextJsDatabaseUrl = currentUrl;
}

export const db = drizzle(pool);
