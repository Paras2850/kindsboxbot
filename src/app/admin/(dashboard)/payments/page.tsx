"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Card, EmptyRow, Input, LoadingRow, Pagination, Select } from "@/app/admin/_components/ui";
import { formatCurrency, formatDateTime } from "@/lib/format";

interface PaymentRow {
  id: number;
  amount: string;
  currency: string;
  gateway: string;
  gatewayOrderId: string | null;
  status: string;
  planName: string | null;
  createdAt: string;
  user: { id: number; telegramId: number; username: string | null; firstName: string | null };
}

export default function PaymentsPage() {
  const [rows, setRows] = useState<PaymentRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [status, setStatus] = useState("ALL");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [revenue, setRevenue] = useState<{ today: number; total: number } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize), status });
    if (search) params.set("search", search);
    const [paymentsRes, statsRes] = await Promise.all([
      fetch(`/api/admin/payments?${params}`).then((r) => r.json()),
      fetch(`/api/admin/stats`).then((r) => r.json()),
    ]);
    if (paymentsRes.ok) {
      setRows(paymentsRes.rows);
      setTotal(paymentsRes.total);
    }
    if (statsRes.ok) {
      setRevenue({ today: statsRes.stats.todayRevenue, total: statsRes.stats.totalRevenue });
    }
    setLoading(false);
  }, [page, pageSize, status, search]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">Payments</h1>
        <p className="text-sm text-slate-400">Every transaction processed through the payment gateway.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <p className="text-xs uppercase tracking-wide text-slate-400">Today&apos;s Revenue</p>
          <p className="mt-1 text-2xl font-semibold text-emerald-400">{revenue ? formatCurrency(revenue.today) : "-"}</p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wide text-slate-400">Total Revenue</p>
          <p className="mt-1 text-2xl font-semibold text-indigo-400">{revenue ? formatCurrency(revenue.total) : "-"}</p>
        </Card>
      </div>

      <Card>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row">
          <Input
            placeholder="Search by user, Telegram ID or order ID..."
            value={search}
            onChange={(e) => {
              setPage(1);
              setSearch(e.target.value);
            }}
          />
          <Select
            value={status}
            onChange={(e) => {
              setPage(1);
              setStatus(e.target.value);
            }}
          >
            <option value="ALL">All statuses</option>
            <option value="SUCCESS">Success</option>
            <option value="PENDING">Pending</option>
            <option value="FAILED">Failed</option>
            <option value="EXPIRED">Expired</option>
            <option value="REFUNDED">Refunded</option>
          </Select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-xs uppercase tracking-wide text-slate-500">
                <th className="py-2">Txn ID</th>
                <th className="py-2">User</th>
                <th className="py-2">Telegram ID</th>
                <th className="py-2">Plan</th>
                <th className="py-2">Amount</th>
                <th className="py-2">Gateway</th>
                <th className="py-2">Status</th>
                <th className="py-2">Date / Time</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <LoadingRow colSpan={8} />
              ) : rows.length === 0 ? (
                <EmptyRow colSpan={8} />
              ) : (
                rows.map((p) => (
                  <tr key={p.id} className="border-b border-slate-800/60">
                    <td className="py-2.5 text-slate-400">#{p.id}</td>
                    <td className="py-2.5 text-slate-200">{p.user.firstName ?? p.user.username ?? "-"}</td>
                    <td className="py-2.5 text-slate-400">{p.user.telegramId}</td>
                    <td className="py-2.5 text-slate-200">{p.planName ?? "-"}</td>
                    <td className="py-2.5 text-slate-200">{formatCurrency(p.amount)}</td>
                    <td className="py-2.5 text-slate-400">{p.gateway}</td>
                    <td className="py-2.5">
                      <Badge color={p.status === "SUCCESS" ? "emerald" : p.status === "PENDING" ? "amber" : "rose"}>{p.status}</Badge>
                    </td>
                    <td className="py-2.5 text-slate-400">{formatDateTime(p.createdAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} />
      </Card>
    </div>
  );
}
