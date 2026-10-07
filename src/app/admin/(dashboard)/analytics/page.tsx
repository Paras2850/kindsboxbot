"use client";

import { useEffect, useState } from "react";
import { Card, StatCard } from "@/app/admin/_components/ui";
import { formatCurrency } from "@/lib/format";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend,
} from "recharts";

interface Analytics {
  totalUsers: number;
  newUsersToday: number;
  newUsersWeek: number;
  activeSubscribers: number;
  expiredSubscribers: number;
  revenueToday: number;
  revenueWeek: number;
  revenueMonth: number;
  mostWatched: { id: number; caption: string | null; sequence: number; deliveryCount: number }[];
  totalDeliveries: number;
  conversionRate: number;
  revenueSeries: { day: string; total: number }[];
  userSeries: { day: string; total: number }[];
}

export default function AnalyticsPage() {
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/analytics")
      .then((r) => r.json())
      .then((j) => {
        if (j.ok) setData(j.analytics);
        else setError("Failed to load analytics");
      })
      .catch(() => setError("Network error"))
      .finally(() => setLoading(false));
  }, []);

  if (loading)
    return (
      <div className="flex h-64 items-center justify-center text-slate-400">
        Loading analytics…
      </div>
    );
  if (error || !data)
    return (
      <div className="flex h-64 items-center justify-center text-rose-400">
        {error ?? "Unknown error"}
      </div>
    );

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-slate-50">📈 Analytics</h1>

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Users" value={data.totalUsers.toLocaleString()} icon="👥" accent="indigo" />
        <StatCard label="New Today" value={data.newUsersToday.toLocaleString()} icon="🆕" accent="sky" />
        <StatCard label="New This Week" value={data.newUsersWeek.toLocaleString()} icon="📅" accent="violet" />
        <StatCard label="Active Subscribers" value={data.activeSubscribers.toLocaleString()} icon="✅" accent="emerald" />
        <StatCard label="Expired Subscribers" value={data.expiredSubscribers.toLocaleString()} icon="⏰" accent="rose" />
        <StatCard label="Conversion Rate" value={`${data.conversionRate.toFixed(1)}%`} icon="📊" accent="amber" />
        <StatCard label="Total Deliveries" value={data.totalDeliveries.toLocaleString()} icon="🎬" accent="sky" />
        <StatCard label="Revenue (Month)" value={formatCurrency(data.revenueMonth)} icon="💰" accent="emerald" />
      </div>

      {/* Revenue cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Today&apos;s Revenue</p>
          <p className="mt-1 text-3xl font-bold text-emerald-400">{formatCurrency(data.revenueToday)}</p>
        </Card>
        <Card>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">This Week</p>
          <p className="mt-1 text-3xl font-bold text-sky-400">{formatCurrency(data.revenueWeek)}</p>
        </Card>
        <Card>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">This Month</p>
          <p className="mt-1 text-3xl font-bold text-violet-400">{formatCurrency(data.revenueMonth)}</p>
        </Card>
      </div>

      {/* Revenue chart */}
      <Card>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">
          Revenue – Last 7 Days
        </h2>
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={data.revenueSeries} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis dataKey="day" stroke="#475569" tick={{ fontSize: 11 }} />
            <YAxis stroke="#475569" tick={{ fontSize: 11 }} tickFormatter={(v) => `₹${v}`} />
            <Tooltip
              contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #334155", borderRadius: 8 }}
              labelStyle={{ color: "#94a3b8" }}
              formatter={(v: any) => [`₹${Number(v ?? 0).toFixed(2)}`, "Revenue"]}
            />
            <Area type="monotone" dataKey="total" stroke="#10b981" fill="url(#revGrad)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </Card>

      {/* User signups chart */}
      <Card>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">
          New Users – Last 7 Days
        </h2>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data.userSeries} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis dataKey="day" stroke="#475569" tick={{ fontSize: 11 }} />
            <YAxis stroke="#475569" tick={{ fontSize: 11 }} allowDecimals={false} />
            <Tooltip
              contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #334155", borderRadius: 8 }}
              labelStyle={{ color: "#94a3b8" }}
            />
            <Legend />
            <Bar dataKey="total" name="New Users" fill="#6366f1" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {/* Most watched videos */}
      <Card>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">
          🔥 Most Watched Videos
        </h2>
        {data.mostWatched.length === 0 ? (
          <p className="text-sm text-slate-500">No delivery data yet.</p>
        ) : (
          <div className="divide-y divide-slate-800">
            {data.mostWatched.map((v, i) => (
              <div key={v.id} className="flex items-center gap-3 py-2.5">
                <span className="w-6 shrink-0 text-right text-xs font-bold text-slate-500">
                  #{i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm text-slate-200">
                    {v.caption ?? `Video #${String(v.sequence).padStart(3, "0")}`}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-indigo-500/10 px-2.5 py-0.5 text-xs font-medium text-indigo-300">
                  {v.deliveryCount.toLocaleString()} views
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
