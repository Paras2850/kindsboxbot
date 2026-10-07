import "dotenv/config";
import { pool } from "../src/db";
import { hashPassword } from "../src/lib/auth/password";
import { DEFAULT_PLANS } from "../src/lib/services/planService";
import { SETTINGS_DEFAULTS } from "../src/lib/services/settingsService";

async function migrate() {
  console.log("=========================================");
  console.log("📦 Initializing Database Tables & Indexes");
  console.log("=========================================");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. Admins
    await client.query(`
      CREATE TABLE IF NOT EXISTS admins (
        id SERIAL PRIMARY KEY,
        username VARCHAR(64) NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        telegram_id BIGINT,
        role VARCHAR(32) NOT NULL DEFAULT 'admin',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // 2. Settings
    await client.query(`
      CREATE TABLE IF NOT EXISTS settings (
        key VARCHAR(128) PRIMARY KEY,
        value TEXT NOT NULL DEFAULT '',
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // 3. Plans
    await client.query(`
      CREATE TABLE IF NOT EXISTS plans (
        id SERIAL PRIMARY KEY,
        name VARCHAR(64) NOT NULL,
        price NUMERIC(10, 2) NOT NULL,
        duration_days INTEGER NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // 4. Users
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        telegram_id BIGINT NOT NULL UNIQUE,
        username VARCHAR(128),
        first_name VARCHAR(128),
        last_name VARCHAR(128),
        is_blocked BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // 5. Subscriptions
    await client.query(`
      CREATE TABLE IF NOT EXISTS subscriptions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        plan_id INTEGER REFERENCES plans(id) ON DELETE SET NULL,
        status VARCHAR(16) NOT NULL DEFAULT 'active',
        started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at TIMESTAMPTZ NOT NULL,
        reminded_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS subscriptions_user_idx ON subscriptions(user_id);
      CREATE INDEX IF NOT EXISTS subscriptions_status_idx ON subscriptions(status);
      CREATE INDEX IF NOT EXISTS subscriptions_expires_idx ON subscriptions(expires_at);
    `);

    // 6. Payments
    await client.query(`
      CREATE TABLE IF NOT EXISTS payments (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        plan_id INTEGER REFERENCES plans(id) ON DELETE SET NULL,
        amount NUMERIC(10, 2) NOT NULL,
        currency VARCHAR(8) NOT NULL DEFAULT 'INR',
        gateway VARCHAR(32) NOT NULL DEFAULT 'razorpay',
        gateway_order_id VARCHAR(128) UNIQUE,
        gateway_payment_id VARCHAR(128),
        short_url TEXT,
        status VARCHAR(16) NOT NULL DEFAULT 'PENDING',
        raw_payload JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS payments_user_idx ON payments(user_id);
      CREATE INDEX IF NOT EXISTS payments_status_idx ON payments(status);
    `);

    // 7. Videos
    await client.query(`
      CREATE TABLE IF NOT EXISTS videos (
        id SERIAL PRIMARY KEY,
        telegram_file_id TEXT NOT NULL,
        file_unique_id TEXT,
        caption TEXT,
        sequence INTEGER NOT NULL DEFAULT 0,
        status VARCHAR(16) NOT NULL DEFAULT 'active',
        uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        delivery_count INTEGER NOT NULL DEFAULT 0,
        file_size BIGINT,
        duration_seconds INTEGER,
        added_by VARCHAR(128)
      );
      CREATE INDEX IF NOT EXISTS videos_sequence_idx ON videos(sequence);
      CREATE INDEX IF NOT EXISTS videos_status_idx ON videos(status);
    `);

    // 8. Video Deliveries
    await client.query(`
      CREATE TABLE IF NOT EXISTS video_deliveries (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        video_id INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
        delivered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        status VARCHAR(16) NOT NULL DEFAULT 'delivered'
      );
      CREATE INDEX IF NOT EXISTS video_deliveries_user_idx ON video_deliveries(user_id);
      CREATE INDEX IF NOT EXISTS video_deliveries_video_idx ON video_deliveries(video_id);
    `);

    // 9. Support Messages
    await client.query(`
      CREATE TABLE IF NOT EXISTS support_messages (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        message TEXT NOT NULL,
        status VARCHAR(16) NOT NULL DEFAULT 'open',
        admin_reply TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        replied_at TIMESTAMPTZ
      );
      CREATE INDEX IF NOT EXISTS support_messages_user_idx ON support_messages(user_id);
      CREATE INDEX IF NOT EXISTS support_messages_status_idx ON support_messages(status);
    `);

    // 10. Audit Logs
    await client.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id SERIAL PRIMARY KEY,
        admin_id INTEGER REFERENCES admins(id) ON DELETE SET NULL,
        action VARCHAR(64) NOT NULL,
        details JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS audit_logs_admin_idx ON audit_logs(admin_id);
    `);

    // 11. Broadcasts
    await client.query(`
      CREATE TABLE IF NOT EXISTS broadcasts (
        id SERIAL PRIMARY KEY,
        admin_id INTEGER REFERENCES admins(id) ON DELETE SET NULL,
        audience VARCHAR(16) NOT NULL,
        message TEXT NOT NULL,
        total_recipients INTEGER NOT NULL DEFAULT 0,
        success_count INTEGER NOT NULL DEFAULT 0,
        failed_count INTEGER NOT NULL DEFAULT 0,
        status VARCHAR(16) NOT NULL DEFAULT 'pending',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        completed_at TIMESTAMPTZ
      );
    `);

    // Seed default plans if none exist
    const planCount = await client.query("SELECT COUNT(*) FROM plans;");
    if (parseInt(planCount.rows[0].count, 10) === 0) {
      console.log("🌱 Seeding default plans (Daily ₹7, Weekly ₹19, Monthly ₹39)...");
      for (const p of DEFAULT_PLANS) {
        await client.query(
          "INSERT INTO plans (name, price, duration_days, is_active, sort_order) VALUES ($1, $2, $3, $4, $5);",
          [p.name, p.price, p.durationDays, true, p.sortOrder]
        );
      }
    }

    // Seed settings defaults
    for (const [key, value] of Object.entries(SETTINGS_DEFAULTS)) {
      await client.query(
        "INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING;",
        [key, value]
      );
    }

    // Seed default admin account if none exists
    const adminCount = await client.query("SELECT COUNT(*) FROM admins;");
    if (parseInt(adminCount.rows[0].count, 10) === 0) {
      const defaultUser = process.env.ADMIN_DEFAULT_USERNAME || "admin";
      const defaultPass = process.env.ADMIN_DEFAULT_PASSWORD || "admin123456";
      const hash = await hashPassword(defaultPass);
      await client.query(
        "INSERT INTO admins (username, password_hash, role) VALUES ($1, $2, 'owner');",
        [defaultUser, hash]
      );
      console.log(`👤 Created default admin account: ${defaultUser} / ${defaultPass}`);
    }

    await client.query("COMMIT");
    console.log("✅ Database tables and defaults successfully configured!");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Migration failed:", err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(() => process.exit(1));

