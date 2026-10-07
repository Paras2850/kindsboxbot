"use client";

import { useEffect, useState } from "react";
import { Badge, Button, Card, EmptyRow, LoadingRow, Select, Textarea } from "@/app/admin/_components/ui";
import { useToast } from "@/app/admin/_components/Toast";
import { formatDateTime } from "@/lib/format";

interface SupportMessageRow {
  id: number;
  message: string;
  status: "open" | "closed";
  adminReply: string | null;
  createdAt: string;
  repliedAt: string | null;
  user: {
    id: number;
    telegramId: number;
    username: string | null;
    firstName: string | null;
  };
}

export default function SupportPage() {
  const toast = useToast();
  const [rows, setRows] = useState<SupportMessageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [replyingId, setReplyingId] = useState<number | null>(null);
  const [replyText, setReplyText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/support?status=${statusFilter}`);
      const data = await res.json();
      if (data.ok) {
        setRows(data.rows);
      }
    } catch {
      toast.show("Failed to load support inquiries", "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [statusFilter]);

  async function handleSendReply(id: number) {
    if (!replyText.trim()) {
      toast.show("Please enter your reply.", "error");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, reply: replyText }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        toast.show("Reply sent to user via Telegram.", "success");
        setReplyingId(null);
        setReplyText("");
        load();
      } else {
        toast.show(data.error ?? "Failed to send reply", "error");
      }
    } catch {
      toast.show("Network error while sending reply", "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">Support Inquiries</h1>
        <p className="text-sm text-slate-400">View and respond to support questions submitted by users via /support.</p>
      </div>

      <Card>
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xs uppercase tracking-wide text-slate-400 font-medium">Filter Status:</span>
            <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">All Inquiries</option>
              <option value="open">Open</option>
              <option value="closed">Closed / Answered</option>
            </Select>
          </div>
          <Button variant="ghost" onClick={load}>Refresh</Button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-xs uppercase tracking-wide text-slate-500">
                <th className="py-2">User</th>
                <th className="py-2">Telegram ID</th>
                <th className="py-2">Message</th>
                <th className="py-2">Status</th>
                <th className="py-2">Received</th>
                <th className="py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <LoadingRow colSpan={6} />
              ) : rows.length === 0 ? (
                <EmptyRow colSpan={6} label="No support messages found." />
              ) : (
                rows.map((m) => (
                  <tr key={m.id} className="border-b border-slate-800/60 align-top">
                    <td className="py-3 text-slate-200">
                      <p className="font-medium">{m.user.firstName || "User"}</p>
                      <p className="text-xs text-slate-500">{m.user.username ? `@${m.user.username}` : "no username"}</p>
                    </td>
                    <td className="py-3 text-slate-400">{m.user.telegramId}</td>
                    <td className="max-w-[320px] py-3 text-slate-200">
                      <p className="whitespace-pre-wrap">{m.message}</p>
                      {m.adminReply && (
                        <div className="mt-2 rounded bg-slate-950/80 p-2 text-xs border border-slate-800">
                          <span className="font-semibold text-emerald-400">Admin reply: </span>
                          <span className="text-slate-300">{m.adminReply}</span>
                        </div>
                      )}
                      {replyingId === m.id && (
                        <div className="mt-3 space-y-2">
                          <Textarea
                            rows={3}
                            placeholder="Type reply to send to user..."
                            value={replyText}
                            onChange={(e) => setReplyText(e.target.value)}
                          />
                          <div className="flex gap-2">
                            <Button onClick={() => handleSendReply(m.id)} disabled={submitting}>
                              {submitting ? "Sending..." : "Send Reply"}
                            </Button>
                            <Button variant="ghost" onClick={() => setReplyingId(null)}>
                              Cancel
                            </Button>
                          </div>
                        </div>
                      )}
                    </td>
                    <td className="py-3">
                      <Badge color={m.status === "open" ? "amber" : "emerald"}>
                        {m.status}
                      </Badge>
                    </td>
                    <td className="py-3 text-slate-400">{formatDateTime(m.createdAt)}</td>
                    <td className="py-3 text-right">
                      {replyingId !== m.id && (
                        <Button
                          variant="secondary"
                          onClick={() => {
                            setReplyingId(m.id);
                            setReplyText(m.adminReply ?? "");
                          }}
                        >
                          {m.status === "open" ? "Reply" : "Edit Reply"}
                        </Button>
                      )}
                    </td>
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

