"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Card, EmptyRow, LoadingRow, Pagination, Select } from "@/app/admin/_components/ui";
import { formatDateTime } from "@/lib/format";

interface SubRow {
  id: number;
  status: string;
  planName: string | null;
  startedAt: string;
  expiresAt: string;
  user: { id: number; telegramId: number; username: string | null; firstName: string | null };
}

export default function SubscriptionsPage() {
  const [rows, setRows] = useState<SubRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize), filter });
    const res = await fetch(`/api/admin/subscriptions?${params}`);
    const data = await res.json();
    if (data.ok) {
      setRows(data.rows);
      setTotal(data.total);
    }
    setLoading(false);
  }, [page, pageSize, filter]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">Subscriptions</h1>
        <p className="text-sm text-slate-400">Track active, expired, and soon-to-expire subscriptions.</p>
      </div>

      <Card>
        <div className="mb-4 flex gap-3">
          <Select
            value={filter}
            onChange={(e) => {
              setPage(1);
              setFilter(e.target.value);
            }}
          >
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="expired">Expired</option>
            <option value="expiring_soon">Expiring soon (24h)</option>
          </Select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-xs uppercase tracking-wide text-slate-500">
                <th className="py-2">User</th>
                <th className="py-2">Telegram ID</th>
                <th className="py-2">Plan</th>
                <th className="py-2">Status</th>
                <th className="py-2">Started</th>
                <th className="py-2">Expires</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <LoadingRow colSpan={6} />
              ) : rows.length === 0 ? (
                <EmptyRow colSpan={6} />
              ) : (
                rows.map((s) => {
                  const isActive = s.status === "active" && new Date(s.expiresAt).getTime() > Date.now();
                  return (
                    <tr key={s.id} className="border-b border-slate-800/60">
                      <td className="py-2.5 text-slate-200">{s.user.firstName ?? s.user.username ?? "-"}</td>
                      <td className="py-2.5 text-slate-400">{s.user.telegramId}</td>
                      <td className="py-2.5 text-slate-200">{s.planName ?? "-"}</td>
                      <td className="py-2.5">
                        <Badge color={isActive ? "emerald" : s.status === "expired" ? "rose" : "slate"}>
                          {isActive ? "active" : s.status}
                        </Badge>
                      </td>
                      <td className="py-2.5 text-slate-400">{formatDateTime(s.startedAt)}</td>
                      <td className="py-2.5 text-slate-400">{formatDateTime(s.expiresAt)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} />
      </Card>
    </div>
  );
}
