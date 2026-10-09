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
        max: 10,
        idleTimeoutMillis: 10_000, // close idle connections after 10s to avoid stale sockets across serverless pauses
        connectionTimeoutMillis: 5_000, // 5s connection timeout
      });

pool.on("error", (err) => {
  // Prevent unhandled error on idle client when Neon drops idle connections
  console.error("[db-pool] unexpected error on idle client:", err.message);
});

globalForDb.__arenaNextJsPostgresqlPool = pool;
globalForDb.__arenaNextJsDatabaseUrl = currentUrl;

export const db = drizzle(pool);
