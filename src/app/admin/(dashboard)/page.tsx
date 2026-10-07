"use client";

import { useEffect, useState } from "react";
import { Card, StatCard } from "@/app/admin/_components/ui";
import { useToast } from "@/app/admin/_components/Toast";
import { formatCurrency } from "@/lib/format";

interface Stats {
  totalUsers: number;
  activeSubscribers: number;
  expiredSubscribers: number;
  todayRevenue: number;
  totalRevenue: number;
  totalVideos: number;
  videosDelivered: number;
  newUsersToday: number;
}

export default function AdminDashboardPage() {
  const toast = useToast();
  const [stats, setStats] = useState<Stats | null>(null);
  const [freeMode, setFreeMode] = useState<boolean>(false);
  const [togglingMode, setTogglingMode] = useState<boolean>(false);

  useEffect(() => {
    let active = true;
    const load = () => {
      fetch("/api/admin/stats")
        .then((r) => r.json())
        .then((data) => active && setStats(data.stats));

      fetch("/api/admin/settings")
        .then((r) => r.json())
        .then((data) => {
          if (active && data?.ok && data.settings) {
            setFreeMode(data.settings.FREE_MODE === "true");
          }
        })
        .catch(() => {});
    };

    load();
    const id = setInterval(load, 15000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  async function handleToggleMode(targetFree: boolean) {
    if (togglingMode) return;
    setTogglingMode(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ FREE_MODE: targetFree ? "true" : "false" }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.ok) {
        setFreeMode(targetFree);
        toast.show(
          targetFree
            ? "🎁 Bot is now FREE TO USE! Users can watch videos without subscribing."
            : "🔒 Subscription Mode ON! Users must purchase a plan to watch videos.",
          "success",
        );
      } else {
        toast.show(data?.error || "Failed to update bot mode", "error");
      }
    } catch {
      toast.show("Network error while updating bot mode", "error");
    } finally {
      setTogglingMode(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">Dashboard</h1>
        <p className="text-sm text-slate-400">Live overview of your premium video bot.</p>
      </div>

      {/* Bot Access Mode Switcher */}
      <div
        className={`rounded-2xl border p-5 transition-all shadow-md backdrop-blur ${
          freeMode
            ? "border-emerald-500/40 bg-gradient-to-r from-emerald-950/40 via-slate-900/80 to-emerald-950/20"
            : "border-indigo-500/40 bg-gradient-to-r from-indigo-950/40 via-slate-900/80 to-indigo-950/20"
        }`}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <span className="text-2xl">{freeMode ? "🎁" : "🔒"}</span>
              <h2 className="text-base font-semibold text-white">Bot Access Mode</h2>
              <span
                className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                  freeMode
                    ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
                    : "bg-indigo-500/10 text-indigo-300 border-indigo-500/30"
                }`}
              >
                {freeMode ? "FREE TO USE (NO SUBSCRIPTION)" : "SUBSCRIPTION REQUIRED (PAID)"}
              </span>
            </div>
            <p className="text-xs text-slate-300">
              {freeMode
                ? "Bot is currently FREE for all users. Anyone can watch videos without buying a subscription."
                : "Subscription is currently ON. Users must purchase an active subscription plan to watch videos."}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => handleToggleMode(false)}
              disabled={togglingMode || !freeMode}
              className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-xs font-semibold transition ${
                !freeMode
                  ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 ring-2 ring-indigo-400"
                  : "bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white"
              } disabled:cursor-not-allowed`}
            >
              <span>🔒</span>
              <span>Subscription Mode ON</span>
            </button>
            <button
              onClick={() => handleToggleMode(true)}
              disabled={togglingMode || freeMode}
              className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-xs font-semibold transition ${
                freeMode
                  ? "bg-emerald-600 text-white shadow-lg shadow-emerald-600/30 ring-2 ring-emerald-400"
                  : "bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white"
              } disabled:cursor-not-allowed`}
            >
              <span>🎁</span>
              <span>Free to Use Bot</span>
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Users" value={stats?.totalUsers ?? "-"} icon="👥" accent="indigo" />
        <StatCard label="Active Subscribers" value={stats?.activeSubscribers ?? "-"} icon="✅" accent="emerald" />
        <StatCard label="Expired Subscribers" value={stats?.expiredSubscribers ?? "-"} icon="⌛" accent="rose" />
        <StatCard label="Today's New Users" value={stats?.newUsersToday ?? "-"} icon="🆕" accent="sky" />
        <StatCard label="Today's Revenue" value={stats ? formatCurrency(stats.todayRevenue) : "-"} icon="💰" accent="amber" />
        <StatCard label="Total Revenue" value={stats ? formatCurrency(stats.totalRevenue) : "-"} icon="🏦" accent="violet" />
        <StatCard label="Total Videos" value={stats?.totalVideos ?? "-"} icon="🎬" accent="indigo" />
        <StatCard label="Videos Delivered" value={stats?.videosDelivered ?? "-"} icon="📤" accent="emerald" />
      </div>

      <Card>
        <h2 className="mb-2 text-sm font-semibold text-white">Quick guide</h2>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-400">
          <li>Configure your bot token and webhook, then open Settings to set your storage chat and messages.</li>
          <li>Upload videos in bulk from the Videos tab, or send them directly to the bot as an admin.</li>
          <li>Users subscribe via /plan in Telegram, pay through Razorpay, and get instant access.</li>
          <li>Monitor payments, subscriptions and analytics here in real time.</li>
        </ol>
      </Card>
    </div>
  );
}
