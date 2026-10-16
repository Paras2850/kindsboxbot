import "dotenv/config";
import { pool } from "../src/db";

async function main() {
  console.log("==================================================");
  console.log("🔍 Connecting to Database via DATABASE_URL...");
  console.log("==================================================");

  let client;
  try {
    client = await pool.connect();
    const result = await client.query(`
      SELECT 
        id,
        username,
        role,
        telegram_id,
        SUBSTRING(password_hash, 1, 10) AS password_hash_prefix,
        created_at
      FROM admins
      ORDER BY id ASC;
    `);

    console.log(`\n📋 Admins Found: ${result.rows.length}\n`);

    if (result.rows.length === 0) {
      console.log("⚠️ No admin accounts found in the admins table.");
    } else {
      console.table(
        result.rows.map((row) => ({
          ID: row.id,
          Username: row.username,
          Role: row.role,
          "Telegram ID": row.telegram_id ?? "N/A",
          "Password Hash (First 10)": row.password_hash_prefix + "...",
          "Created At": row.created_at ? new Date(row.created_at).toISOString() : "N/A",
        }))
      );
    }
    console.log("\n✅ Verification complete.");
  } catch (err: any) {
    console.error("❌ Error querying admins table:", err?.message || err);
  } finally {
    if (client) client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});

