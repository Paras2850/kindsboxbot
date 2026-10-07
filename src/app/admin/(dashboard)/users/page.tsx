"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Badge, Card, EmptyRow, Input, LoadingRow, Pagination } from "@/app/admin/_components/ui";
import { formatDate } from "@/lib/format";

interface UserRow {
  id: number;
  telegramId: number;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  isBlocked: boolean;
  createdAt: string;
  subscription: { status: string; planName: string | null; expiresAt: string } | null;
  totalPaid: number;
  videosWatched: number;
}

export default function UsersPage() {
  const [rows, setRows] = useState<UserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (search) params.set("search", search);
    const res = await fetch(`/api/admin/users?${params}`);
    const data = await res.json();
    if (data.ok) {
      setRows(data.rows);
      setTotal(data.total);
    }
    setLoading(false);
  }, [page, pageSize, search]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">Users</h1>
        <p className="text-sm text-slate-400">Search, inspect and manage subscriber accounts.</p>
      </div>

      <Card>
        <div className="mb-4">
          <Input
            placeholder="Search by username, name, or Telegram ID..."
            value={search}
            onChange={(e) => {
              setPage(1);
              setSearch(e.target.value);
            }}
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-xs uppercase tracking-wide text-slate-500">
                <th className="py-2">User</th>
                <th className="py-2">Telegram ID</th>
                <th className="py-2">Subscription</th>
                <th className="py-2">Expires</th>
                <th className="py-2">Watched</th>
                <th className="py-2">Paid</th>
                <th className="py-2">Joined</th>
                <th className="py-2"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <LoadingRow colSpan={8} />
              ) : rows.length === 0 ? (
                <EmptyRow colSpan={8} />
              ) : (
                rows.map((u) => (
                  <tr key={u.id} className="border-b border-slate-800/60">
                    <td className="py-2.5">
                      <p className="text-slate-100">{[u.firstName, u.lastName].filter(Boolean).join(" ") || "-"}</p>
                      <p className="text-xs text-slate-500">{u.username ? `@${u.username}` : "no username"}</p>
                    </td>
                    <td className="py-2.5 text-slate-400">{u.telegramId}</td>
                    <td className="py-2.5">
                      {u.isBlocked ? (
                        <Badge color="rose">Blocked</Badge>
                      ) : u.subscription?.status === "active" ? (
                        <Badge color="emerald">{u.subscription.planName ?? "Active"}</Badge>
                      ) : (
                        <Badge>{u.subscription?.status ?? "None"}</Badge>
                      )}
                    </td>
                    <td className="py-2.5 text-slate-400">{u.subscription ? formatDate(u.subscription.expiresAt) : "-"}</td>
                    <td className="py-2.5 text-slate-200">{u.videosWatched}</td>
                    <td className="py-2.5 text-slate-200">₹{u.totalPaid}</td>
                    <td className="py-2.5 text-slate-400">{formatDate(u.createdAt)}</td>
                    <td className="py-2.5 text-right">
                      <Link href={`/admin/users/${u.id}`} className="text-indigo-400 hover:text-indigo-300">
                        View →
                      </Link>
                    </td>
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
