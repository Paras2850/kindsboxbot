"use client";

import { useEffect, useState } from "react";
import { Badge, Button, Card, EmptyRow, LoadingRow, Select, Textarea } from "@/app/admin/_components/ui";
import { useToast } from "@/app/admin/_components/Toast";
import { formatDateTime } from "@/lib/format";

interface BroadcastRow {
  id: number;
  audience: "all" | "active" | "expired";
  message: string;
  totalRecipients: number;
  successCount: number;
  failedCount: number;
  status: "pending" | "processing" | "completed";
  createdAt: string;
  completedAt: string | null;
}

export default function BroadcastPage() {
  const toast = useToast();
  const [rows, setRows] = useState<BroadcastRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [audience, setAudience] = useState<"all" | "active" | "expired">("all");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/broadcast");
      const data = await res.json();
      if (data.ok) {
        setRows(data.rows);
      }
    } catch {
      toast.show("Failed to load broadcast history", "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, []);

  async function handleSend() {
    if (!message.trim()) {
      toast.show("Please enter a message to broadcast.", "error");
      return;
    }

    if (!confirm(`Broadcast this message to ${audience} users?`)) return;

    setSending(true);
    try {
      const res = await fetch("/api/admin/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audience, message }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        toast.show(`Broadcast queued for ${data.recipients} user(s).`, "success");
        setMessage("");
        load();
      } else {
        toast.show(data.error ?? "Broadcast failed", "error");
      }
    } catch {
      toast.show("Network error while sending broadcast", "error");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">Broadcast</h1>
        <p className="text-sm text-slate-400">Send announcements or updates directly to Telegram users.</p>
      </div>

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-white">Create new broadcast</h2>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">Target Audience</label>
            <Select value={audience} onChange={(e) => setAudience(e.target.value as "all" | "active" | "expired")} className="w-full sm:w-64">
              <option value="all">All Users</option>
              <option value="active">Active Subscribers Only</option>
              <option value="expired">Expired Subscribers Only</option>
            </Select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">Broadcast Message</label>
            <Textarea
              rows={4}
              placeholder="Type your announcement or update here... (HTML tags supported, e.g. <b>bold</b>)"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>

          <div className="flex justify-end">
            <Button onClick={handleSend} disabled={sending || !message.trim()}>
              {sending ? "Queuing Broadcast..." : "📢 Send Broadcast"}
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">Broadcast history</h2>
          <Button variant="ghost" onClick={load}>Refresh</Button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-xs uppercase tracking-wide text-slate-500">
                <th className="py-2">ID</th>
                <th className="py-2">Audience</th>
                <th className="py-2">Message</th>
                <th className="py-2">Recipients</th>
                <th className="py-2">Delivered</th>
                <th className="py-2">Failed</th>
                <th className="py-2">Status</th>
                <th className="py-2">Date</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <LoadingRow colSpan={8} />
              ) : rows.length === 0 ? (
                <EmptyRow colSpan={8} label="No broadcast history yet." />
              ) : (
                rows.map((b) => (
                  <tr key={b.id} className="border-b border-slate-800/60">
                    <td className="py-2.5 text-slate-400">#{b.id}</td>
                    <td className="py-2.5">
                      <Badge color={b.audience === "active" ? "emerald" : b.audience === "expired" ? "rose" : "slate"}>
                        {b.audience}
                      </Badge>
                    </td>
                    <td className="max-w-[280px] py-2.5">
                      <p className="truncate text-slate-200" title={b.message}>{b.message}</p>
                    </td>
                    <td className="py-2.5 text-slate-200">{b.totalRecipients.toLocaleString()}</td>
                    <td className="py-2.5 text-emerald-400 font-medium">{b.successCount.toLocaleString()}</td>
                    <td className="py-2.5 text-rose-400 font-medium">{b.failedCount.toLocaleString()}</td>
                    <td className="py-2.5">
                      <Badge color={b.status === "completed" ? "emerald" : b.status === "processing" ? "amber" : "slate"}>
                        {b.status}
                      </Badge>
                    </td>
                    <td className="py-2.5 text-slate-400">{formatDateTime(b.createdAt)}</td>
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

