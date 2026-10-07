# 🎬 Short Video Premium Telegram Bot & Admin Platform

A production-ready Telegram subscription platform for selling access to premium short videos. Includes a complete web dashboard, automated video sequence delivery, Indian payment gateway (Razorpay UPI/Cards/Netbanking) abstraction, multi-video bulk uploader, automated background expiry/reminder jobs, rate limiting, and analytics.

---

## 🌟 Key Features

### 🤖 Telegram Bot Features
- **/start**: Modern welcome banner with quick-action inline buttons.
- **/video**:
  - Delivers the next unviewed premium video directly in Telegram using stored `telegram_file_id` (zero server bandwidth / re-upload overhead).
  - Tracks per-user delivery history table (`video_deliveries`).
  - Graceful notifications when all videos have been watched or when repeat mode is active.
  - Automatically verifies subscription status before sending.
- **/plan**: Displays subscription tiers with interactive Telegram inline buttons:
  - 🟢 **Daily Plan**: ₹7 (1 Day access)
  - 🔵 **Weekly Plan**: ₹19 (7 Days access)
  - 🟣 **Monthly Plan**: ₹39 (30 Days access)
- **/status**: Displays live subscription state (ACTIVE/EXPIRED), active plan, start date, expiry date, and total videos watched.
- **/myaccount**: Displays user profile, Telegram ID, join date, total payments, and watched count.
- **/help**: Complete user walkthrough of bot commands and subscription steps.
- **/support**: Configured admin support username contact and support ticket logging.
- **Admin In-Chat Upload**: Admins can simply forward/send 10, 50, or 100+ videos directly into the Telegram bot chat to import them automatically!

### 💳 Payment & Subscription System
- **Real Payment Gateway Integration**: Native Razorpay integration supporting UPI (Google Pay, PhonePe, Paytm, BHIM), Debit/Credit Cards, and Netbanking.
- **Strict Verification Layer**: Subscriptions are **never** activated by button clicks alone. Activation triggers only upon cryptographically verified webhook or status API check.
- **Transaction Lifecycle**: Full status state machine: `PENDING`, `SUCCESS`, `FAILED`, `EXPIRED`, `REFUNDED`.
- **Anti-Abuse & Idempotency**: Duplicate payment and duplicate webhook prevention.

### 🖥️ Modern Web Admin Panel
- **Dashboard**: Live statistics for total users, active subscribers, expired subscribers, today's revenue, total revenue, total videos, deliveries, and new users.
- **Videos Management**:
  - Bulk uploader supporting multiple files (10, 50, 100+ MP4/MOV) with progress display.
  - Edit captions, toggle active/disabled status, and bulk delete.
- **User Management**:
  - Search users by username, Telegram ID, or name.
  - View user profile, watched count, and payment ledger.
  - Manual admin controls: Activate, extend, cancel, or expire subscriptions; block/unblock users.
- **Subscription Management**: Filter by active, expired, or expiring soon (next 24 hours).
- **Payments Ledger**: Real-time view of every transaction with status badges, gateway order IDs, and revenue stats.
- **Analytics**: Beautiful visual charts powered by Recharts (7-day revenue area chart, user signups bar chart, and most-watched video rankings).
- **Broadcast System**: Send announcements to all users, active subscribers only, or expired subscribers only with background queuing.
- **Support Inbox**: Reply to user questions submitted via `/support` directly from the web panel, with responses delivered automatically via Telegram.
- **Settings & Diagnostics**: Configure bot name, support handle, caption template, maintenance mode, repeat mode, and one-click Telegram webhook registration.

### 🛡️ Security & Anti-Abuse
- Secure admin sessions using **Jose (JWT)** and **bcryptjs** password hashing.
- Token-bucket in-memory rate limiting preventing `/video` spamming.
- Maintenance mode toggle: blocks general users with a friendly message while allowing admins to test.
- Scheduled background cron jobs (`node-cron`) running every 5 minutes:
  - Auto-expires ended subscriptions.
  - Sends 24-hour expiration reminder alerts to Telegram users.
  - Cleans up stale pending payment links.

---

## 🗄️ Database Architecture (PostgreSQL)

- `users`: Telegram accounts (`id`, `telegram_id`, `username`, `first_name`, `is_blocked`, `created_at`)
- `plans`: Subscription plans (`id`, `name`, `price`, `duration_days`, `is_active`, `sort_order`)
- `subscriptions`: User subscriptions (`id`, `user_id`, `plan_id`, `status`, `started_at`, `expires_at`, `reminded_at`)
- `payments`: Transactions (`id`, `user_id`, `plan_id`, `amount`, `currency`, `gateway`, `gateway_order_id`, `status`, `short_url`, `raw_payload`)
- `videos`: Media registry (`id`, `telegram_file_id`, `file_unique_id`, `caption`, `sequence`, `status`, `delivery_count`)
- `video_deliveries`: Delivery history progress tracker (`id`, `user_id`, `video_id`, `delivered_at`, `status`)
- `admins`: Web dashboard accounts (`id`, `username`, `password_hash`, `role`)
- `settings`: System configurations key-value store (`key`, `value`)
- `support_messages`: User questions & admin responses (`id`, `user_id`, `message`, `status`, `admin_reply`)
- `broadcasts`: Mass message broadcast jobs (`id`, `audience`, `message`, `total_recipients`, `success_count`, `failed_count`, `status`)
- `audit_logs`: Admin audit trail (`id`, `admin_id`, `action`, `details`)

---

## ⚙️ Environment Configuration (`.env`)

Copy `.env.example` to `.env`:

```env
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/app_db

# Telegram Bot
BOT_TOKEN=123456789:AAExampleTelegramBotTokenHere
TELEGRAM_WEBHOOK_SECRET=your-random-webhook-secret
WEBHOOK_URL=https://your-domain.com
ADMIN_TELEGRAM_IDS=123456789
SUPPORT_USERNAME=your_support_handle

# Razorpay Payment Gateway
RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxx
RAZORPAY_KEY_SECRET=xxxxxxxxxxxxxxxxxxxxxxxx
RAZORPAY_WEBHOOK_SECRET=xxxxxxxxxxxxxxxxxxxxxxxx

# Admin Panel & Security
JWT_SECRET=super-secure-random-jwt-secret-key-at-least-32-chars
SETUP_SECRET=change-me-setup-secret
CRON_SECRET=change-me-cron-secret
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Default Admin Login (Seeded automatically on migration)
ADMIN_DEFAULT_USERNAME=admin
ADMIN_DEFAULT_PASSWORD=admin123456
```

---

## 🚀 Quick Start & Local Development (Windows PowerShell)

### Step 1: Install Dependencies
Ensure you have Node.js 20+ installed.
```powershell
npm install
```

### Step 2: Configure Telegram Bot
1. Open Telegram and search for [@BotFather](https://t.me/BotFather).
2. Send `/newbot`, name your bot, and get your `BOT_TOKEN`.
3. Put the token into your `.env` file under `BOT_TOKEN`.
4. Get your Telegram numeric ID using [@userinfobot](https://t.me/userinfobot) and set it in `ADMIN_TELEGRAM_IDS`.

### Step 3: Run Database Migrations & Seed Default Data
Create your PostgreSQL database (e.g. `app_db`), set `DATABASE_URL` in `.env`, and run:
```powershell
npm run db:migrate
```
*This automatically creates all 11 tables, indexes, default plans (₹7 Daily, ₹19 Weekly, ₹39 Monthly), and the default admin account (`admin` / `admin123456`).*

### Step 4: Run Tests
Verify all system components, keyboards, auth, and logic:
```powershell
npm test
```

### Step 5: Start Local Development Servers

You have two choices for receiving Telegram updates:

#### Mode A: Polling Mode (Easiest for local development — No ngrok required!)
Start the Next.js web application and admin panel in Terminal 1:
```powershell
npm run dev
```
Start the Telegram Bot polling worker in Terminal 2:
```powershell
npm run bot:poll
```

#### Mode B: Webhook Mode (For production or with ngrok / local tunnel)
```powershell
ngrok http 3000
```
Set `WEBHOOK_URL=https://xxxx.ngrok-free.app` in `.env`, then start:
```powershell
npm run dev
```
Navigate to Admin Panel -> **Settings** -> Click **"⚡ Sync / Set Telegram Webhook"**.

---

## 🔐 Accessing the Admin Panel
1. Open `http://localhost:3000/admin`
2. Log in with:
   - **Username**: `admin`
   - **Password**: `admin123456`
3. (Optional) You can customize the credentials anytime in your database or `.env`.

---

## 🐳 Docker & Production Deployment

### Option 1: Docker Compose (All-in-one with PostgreSQL)
```bash
docker compose up -d --build
```
Run migrations inside container:
```bash
docker compose exec app npm run db:migrate
```

### Option 2: VPS / Ubuntu Server
1. Clone repository on your VPS.
2. Setup PostgreSQL: `sudo apt install postgresql`
3. Configure `.env` with your domain and production secrets.
4. Build and start with PM2:
```bash
npm ci
npm run build
npm run db:migrate
pm2 start npm --name "video-bot" -- start
```
5. Setup Nginx reverse proxy with SSL (Certbot) pointing to port 3000.
6. Register the webhook from the Admin Panel Settings page or via `/api/admin/telegram/webhook`.

### Option 3: Railway / Render
1. Connect GitHub repository.
2. Attach PostgreSQL service.
3. Add environment variables from `.env.example`.
4. Build command: `npm run build`
5. Start command: `npm run db:migrate && npm run start`

---

## 📂 Project Structure

```
telegram-video-subscription-bot/
├── scripts/
│   ├── migrate.ts                # DDL migration & initial database seeder
│   └── poll.ts                   # Telegram long-polling worker for local dev
├── tests/
│   └── run-tests.ts              # Automated tests (rate-limit, auth, keyboards, formatters)
├── src/
│   ├── app/
│   │   ├── admin/
│   │   │   ├── (dashboard)/
│   │   │   │   ├── page.tsx           # Dashboard with real-time stats
│   │   │   │   ├── videos/page.tsx    # Bulk upload & video management
│   │   │   │   ├── users/page.tsx     # User lookup & profiles
│   │   │   │   ├── users/[id]/page.tsx# User detail & admin actions
│   │   │   │   ├── payments/page.tsx  # Transaction history
│   │   │   │   ├── subscriptions/page.tsx # Subscriptions list & filters
│   │   │   │   ├── analytics/page.tsx # Revenue & user growth charts
│   │   │   │   ├── broadcast/page.tsx # Push notification broadcaster
│   │   │   │   ├── support/page.tsx   # Support ticket management
│   │   │   │   └── settings/page.tsx  # System & plan configuration
│   │   │   ├── _components/           # Reusable UI cards, tables, toast
│   │   │   └── login/page.tsx         # Secure admin login
│   │   ├── api/
│   │   │   ├── admin/                 # Admin REST API endpoints
│   │   │   ├── cron/tick/             # External cron trigger endpoint
│   │   │   ├── payments/webhook/      # Payment gateway webhook receiver
│   │   │   └── telegram/webhook/      # Telegram bot update webhook receiver
│   │   └── payments/callback/         # User payment redirect callback page
│   ├── db/
│   │   ├── index.ts                   # PostgreSQL connection pool
│   │   └── schema.ts                  # Drizzle ORM PostgreSQL schema
│   ├── instrumentation.ts             # Boot scheduler (node-cron every 5m)
│   └── lib/
│       ├── auth/                      # JWT & bcrypt utilities
│       ├── bot/                       # Telegram command handlers, router, messages
│       ├── cron/                      # Subscription expiry & reminder jobs
│       ├── payments/                  # Payment gateway abstraction (Razorpay)
│       ├── services/                  # Database business logic services
│       └── telegram/                  # Telegram Bot API client & keyboards
├── Dockerfile                         # Production multi-stage Docker build
├── docker-compose.yml                 # PostgreSQL + Web App container stack
├── package.json
└── README.md
```

