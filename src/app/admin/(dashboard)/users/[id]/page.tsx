"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Badge, Button, Card } from "@/app/admin/_components/ui";
import { useToast } from "@/app/admin/_components/Toast";
import { formatCurrency, formatDateTime } from "@/lib/format";

interface Detail {
  user: {
    id: number;
    telegramId: number;
    username: string | null;
    firstName: string | null;
    lastName: string | null;
    isBlocked: boolean;
    createdAt: string;
  };
  subscription: { status: string; planName: string | null; startedAt: string; expiresAt: string } | null;
  videosWatched: number;
  totalPaid: number;
  payments: Array<{
    id: number;
    planName: string | null;
    amount: string;
    status: string;
    gateway: string;
    gatewayOrderId: string | null;
    createdAt: string;
  }>;
}

export default function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const toast = useToast();
  const [data, setData] = useState<Detail | null>(null);
  const [days, setDays] = useState(30);

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/users/${id}`);
    const json = await res.json();
    if (json.ok) setData(json);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function act(action: string, extra: Record<string, unknown> = {}) {
    const res = await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...extra }),
    });
    const json = await res.json();
    if (res.ok && json.ok) {
      toast.show(`Action "${action}" applied.`, "success");
      load();
    } else {
      toast.show(json.error ?? "Action failed", "error");
    }
  }

  if (!data) return <p className="text-slate-400">Loading...</p>;

  const { user, subscription, videosWatched, totalPaid, payments } = data;
  const isActive = subscription?.status === "active" && new Date(subscription.expiresAt).getTime() > Date.now();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/admin/users" className="text-sm text-indigo-400 hover:text-indigo-300">
            ← Back to Users
          </Link>
          <h1 className="mt-1 text-2xl font-semibold text-white">
            {[user.firstName, user.lastName].filter(Boolean).join(" ") || "Unnamed user"}
          </h1>
          <p className="text-sm text-slate-400">@{user.username ?? "no-username"} · Telegram ID {user.telegramId}</p>
        </div>
        {user.isBlocked ? <Badge color="rose">Blocked</Badge> : <Badge color="emerald">Active account</Badge>}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <h2 className="mb-3 text-sm font-semibold text-white">Subscription</h2>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-slate-500">Status</dt>
              <dd>{isActive ? <Badge color="emerald">Active</Badge> : <Badge>{subscription?.status ?? "None"}</Badge>}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Plan</dt>
              <dd className="text-slate-200">{subscription?.planName ?? "-"}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Started</dt>
              <dd className="text-slate-200">{subscription ? formatDateTime(subscription.startedAt) : "-"}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Expires</dt>
              <dd className="text-slate-200">{subscription ? formatDateTime(subscription.expiresAt) : "-"}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Videos Watched</dt>
              <dd className="text-slate-200">{videosWatched}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Total Paid</dt>
              <dd className="text-slate-200">{formatCurrency(totalPaid)}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Joined</dt>
              <dd className="text-slate-200">{formatDateTime(user.createdAt)}</dd>
            </div>
          </dl>
        </Card>

        <Card>
          <h2 className="mb-3 text-sm font-semibold text-white">Admin actions</h2>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
                className="w-20 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm"
              />
              <span className="text-xs text-slate-500">days</span>
            </div>
            <Button className="w-full" onClick={() => act("activate", { days })}>
              Activate ({days}d)
            </Button>
            <Button className="w-full" variant="secondary" onClick={() => act("extend", { days })}>
              Extend (+{days}d)
            </Button>
            <Button className="w-full" variant="secondary" onClick={() => act("expire")}>
              Force Expire
            </Button>
            <Button className="w-full" variant="secondary" onClick={() => act("cancel")}>
              Cancel Subscription
            </Button>
            <Button
              className="w-full"
              variant={user.isBlocked ? "secondary" : "danger"}
              onClick={() => act(user.isBlocked ? "unblock" : "block")}
            >
              {user.isBlocked ? "Unblock User" : "Block User"}
            </Button>
          </div>
        </Card>
      </div>

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-white">Payment history</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-xs uppercase tracking-wide text-slate-500">
                <th className="py-2">Txn ID</th>
                <th className="py-2">Plan</th>
                <th className="py-2">Amount</th>
                <th className="py-2">Gateway</th>
                <th className="py-2">Status</th>
                <th className="py-2">Date</th>
              </tr>
            </thead>
            <tbody>
              {payments.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-slate-500">
                    No payments yet.
                  </td>
                </tr>
              ) : (
                payments.map((p) => (
                  <tr key={p.id} className="border-b border-slate-800/60">
                    <td className="py-2.5 text-slate-400">#{p.id}</td>
                    <td className="py-2.5 text-slate-200">{p.planName ?? "-"}</td>
                    <td className="py-2.5 text-slate-200">{formatCurrency(p.amount)}</td>
                    <td className="py-2.5 text-slate-400">{p.gateway}</td>
                    <td className="py-2.5">
                      <Badge
                        color={p.status === "SUCCESS" ? "emerald" : p.status === "PENDING" ? "amber" : "rose"}
                      >
                        {p.status}
                      </Badge>
                    </td>
                    <td className="py-2.5 text-slate-400">{formatDateTime(p.createdAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
