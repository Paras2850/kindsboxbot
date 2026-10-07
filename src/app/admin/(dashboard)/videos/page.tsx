"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Badge, Button, Card, EmptyRow, Input, LoadingRow, Pagination, Select } from "@/app/admin/_components/ui";
import { useToast } from "@/app/admin/_components/Toast";
import { formatDateTime } from "@/lib/format";

interface VideoRow {
  id: number;
  caption: string | null;
  sequence: number;
  status: "active" | "disabled";
  uploadedAt: string;
  deliveryCount: number;
  fileSize: number | null;
}

interface UploadResult {
  fileName: string;
  success: boolean;
  videoId?: number;
  error?: string;
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 MB";
  const mb = bytes / (1024 * 1024);
  if (mb < 0.1) {
    const kb = bytes / 1024;
    return `${kb.toFixed(1)} KB`;
  }
  return `${mb.toFixed(1)} MB`;
}

function uploadSingleVideo(
  file: File,
  caption: string,
  onProgress: (percent: number, loaded: number, total: number) => void
): Promise<{ ok: boolean; status: number; data: any }> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    const form = new FormData();
    form.append("files", file);
    if (caption) form.append("caption", caption);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) {
        const pct = Math.min(100, Math.round((e.loaded / e.total) * 100));
        onProgress(pct, e.loaded, e.total);
      }
    };

    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText);
        resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, data });
      } catch {
        resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, data: null });
      }
    };

    xhr.onerror = () => {
      resolve({
        ok: false,
        status: 0,
        data: { ok: false, error: "Network error during upload" },
      });
    };

    xhr.open("POST", "/api/admin/videos/upload");
    xhr.send(form);
  });
}

export default function VideosPage() {
  const toast = useToast();
  const [rows, setRows] = useState<VideoRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<number[]>([]);
  const [editId, setEditId] = useState<number | null>(null);
  const [editCaption, setEditCaption] = useState("");

  const [files, setFiles] = useState<File[]>([]);
  const [caption, setCaption] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadResults, setUploadResults] = useState<UploadResult[] | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Seek bar & percentage state
  const [currentPercent, setCurrentPercent] = useState(0);
  const [currentFileName, setCurrentFileName] = useState("");
  const [currentFileIndex, setCurrentFileIndex] = useState(0);
  const [bytesLoaded, setBytesLoaded] = useState(0);
  const [bytesTotal, setBytesTotal] = useState(0);
  const [isProcessingTelegram, setIsProcessingTelegram] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize), status });
    if (search) params.set("search", search);
    const res = await fetch(`/api/admin/videos?${params}`);
    const data = await res.json();
    if (data.ok) {
      setRows(data.rows);
      setTotal(data.total);
    }
    setLoading(false);
  }, [page, pageSize, search, status]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleUpload() {
    if (files.length === 0) return;
    setUploading(true);
    setUploadResults([]);
    const allResults: UploadResult[] = [];
    let successCount = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setCurrentFileIndex(i);
      setCurrentFileName(file.name);
      setCurrentPercent(0);
      setBytesLoaded(0);
      setBytesTotal(file.size);
      setIsProcessingTelegram(false);

      const res = await uploadSingleVideo(file, caption, (pct, loaded, total) => {
        setCurrentPercent(pct);
        setBytesLoaded(loaded);
        setBytesTotal(total);
        if (pct >= 100) {
          setIsProcessingTelegram(true);
        }
      });

      if (res.ok && res.data?.ok && res.data.results?.[0]) {
        const r = res.data.results[0];
        allResults.push(r);
        if (r.success) successCount++;
      } else {
        allResults.push({
          fileName: file.name,
          success: false,
          error: res.data?.error || `Upload failed (HTTP ${res.status})`,
        });
      }
      setUploadResults([...allResults]);
    }

    toast.show(`${successCount}/${files.length} videos uploaded successfully.`, successCount === files.length ? "success" : "info");
    setFiles([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
    load();
    setUploading(false);
    setCurrentPercent(0);
    setCurrentFileName("");
    setIsProcessingTelegram(false);
  }

  async function toggleStatus(video: VideoRow) {
    const next = video.status === "active" ? "disabled" : "active";
    const res = await fetch(`/api/admin/videos/${video.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    if (res.ok) {
      toast.show(`Video #${video.id} ${next === "active" ? "enabled" : "disabled"}.`, "success");
      load();
    }
  }

  async function saveCaption(id: number) {
    const res = await fetch(`/api/admin/videos/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ caption: editCaption }),
    });
    if (res.ok) {
      toast.show("Caption updated.", "success");
      setEditId(null);
      load();
    }
  }

  async function deleteOne(id: number) {
    if (!confirm("Delete this video permanently?")) return;
    const res = await fetch(`/api/admin/videos/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.show("Video deleted.", "success");
      load();
    }
  }

  async function bulkAction(action: "enable" | "disable" | "delete") {
    if (selected.length === 0) return;
    if (action === "delete" && !confirm(`Delete ${selected.length} selected videos?`)) return;
    const res = await fetch(`/api/admin/videos/bulk`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: selected, action }),
    });
    if (res.ok) {
      toast.show(`Bulk ${action} applied to ${selected.length} videos.`, "success");
      setSelected([]);
      load();
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">Videos</h1>
        <p className="text-sm text-slate-400">Upload, organize and manage premium short videos.</p>
      </div>

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-white">Bulk upload</h2>
        <p className="mb-3 text-xs text-slate-400">
          Select multiple MP4/MOV files (10, 50, 100+) and click Upload All. Each file is sent to Telegram once and
          its file_id is stored for instant, re-upload-free delivery. You can also just send videos directly to the
          bot from an admin Telegram account.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            ref={fileInputRef}
            type="file"
            accept="video/mp4,video/quicktime,.mp4,.mov"
            multiple
            disabled={uploading}
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            className="flex-1 text-sm text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-800 file:px-3 file:py-2 file:text-sm file:text-slate-200 hover:file:bg-slate-700 disabled:opacity-50"
          />
          <Input
            placeholder="Optional caption for all"
            value={caption}
            disabled={uploading}
            onChange={(e) => setCaption(e.target.value)}
            className="sm:w-64"
          />
          <Button onClick={handleUpload} disabled={uploading || files.length === 0}>
            {uploading ? `Uploading (${currentPercent}%)...` : `Upload All (${files.length})`}
          </Button>
        </div>

        {uploading && (
          <div className="mt-4 rounded-xl border border-indigo-500/30 bg-slate-950/70 p-4 shadow-lg backdrop-blur space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-indigo-500"></span>
                </span>
                <span className="font-medium text-slate-200 truncate">
                  {files.length > 1 ? `[Video ${currentFileIndex + 1}/${files.length}] ` : ""}
                  {currentFileName || "Uploading video..."}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="font-mono text-sm font-bold text-indigo-400">
                  {currentPercent}%
                </span>
              </div>
            </div>

            {/* Seek Bar (Progress Track & Fill) */}
            <div className="relative h-3 w-full overflow-hidden rounded-full bg-slate-800 ring-1 ring-inset ring-slate-700/60">
              <div
                className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-sky-500 to-emerald-400 transition-all duration-150 ease-out shadow-sm"
                style={{ width: `${currentPercent}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span>
                {formatBytes(bytesLoaded)} / {formatBytes(bytesTotal)}
              </span>
              <span className="flex items-center gap-1.5 font-medium text-slate-300">
                {isProcessingTelegram ? (
                  <>
                    <svg className="h-3.5 w-3.5 animate-spin text-emerald-400" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    <span className="text-emerald-300">Saving & syncing with Telegram...</span>
                  </>
                ) : (
                  <span>Uploading to server ({currentPercent}%)...</span>
                )}
              </span>
            </div>
          </div>
        )}

        {uploadResults && (
          <div className="mt-4 max-h-48 overflow-y-auto rounded-lg border border-slate-800">
            <table className="w-full text-xs">
              <tbody>
                {uploadResults.map((r, i) => (
                  <tr key={i} className="border-b border-slate-800/60 last:border-0">
                    <td className="px-3 py-1.5 text-slate-300">{r.fileName}</td>
                    <td className="px-3 py-1.5">
                      {r.success ? <Badge color="emerald">Uploaded</Badge> : <Badge color="rose">{r.error ?? "Failed"}</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-1 gap-2">
            <Input
              placeholder="Search by caption..."
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
              <option value="all">All status</option>
              <option value="active">Active</option>
              <option value="disabled">Disabled</option>
            </Select>
          </div>
          {selected.length > 0 && (
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => bulkAction("enable")}>
                Enable ({selected.length})
              </Button>
              <Button variant="secondary" onClick={() => bulkAction("disable")}>
                Disable
              </Button>
              <Button variant="danger" onClick={() => bulkAction("delete")}>
                Delete
              </Button>
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-xs uppercase tracking-wide text-slate-500">
                <th className="w-8 py-2">
                  <input
                    type="checkbox"
                    checked={rows.length > 0 && selected.length === rows.length}
                    onChange={(e) => setSelected(e.target.checked ? rows.map((r) => r.id) : [])}
                  />
                </th>
                <th className="py-2">#</th>
                <th className="py-2">Caption</th>
                <th className="py-2">Status</th>
                <th className="py-2">Uploaded</th>
                <th className="py-2">Delivered</th>
                <th className="py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <LoadingRow colSpan={7} />
              ) : rows.length === 0 ? (
                <EmptyRow colSpan={7} label="No videos yet. Upload some above." />
              ) : (
                rows.map((v) => (
                  <tr key={v.id} className="border-b border-slate-800/60">
                    <td className="py-2.5">
                      <input
                        type="checkbox"
                        checked={selected.includes(v.id)}
                        onChange={(e) =>
                          setSelected((prev) => (e.target.checked ? [...prev, v.id] : prev.filter((id) => id !== v.id)))
                        }
                      />
                    </td>
                    <td className="py-2.5 text-slate-400">#{String(v.sequence).padStart(3, "0")}</td>
                    <td className="max-w-[260px] py-2.5">
                      {editId === v.id ? (
                        <div className="flex gap-2">
                          <Input value={editCaption} onChange={(e) => setEditCaption(e.target.value)} />
                          <Button onClick={() => saveCaption(v.id)}>Save</Button>
                          <Button variant="ghost" onClick={() => setEditId(null)}>
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <span className="truncate text-slate-200">{v.caption || <span className="text-slate-500">(no caption)</span>}</span>
                      )}
                    </td>
                    <td className="py-2.5">
                      <Badge color={v.status === "active" ? "emerald" : "slate"}>{v.status}</Badge>
                    </td>
                    <td className="py-2.5 text-slate-400">{formatDateTime(v.uploadedAt)}</td>
                    <td className="py-2.5 text-slate-200">{v.deliveryCount.toLocaleString()}</td>
                    <td className="py-2.5">
                      <div className="flex justify-end gap-1.5">
                        <Button
                          variant="ghost"
                          onClick={() => {
                            setEditId(v.id);
                            setEditCaption(v.caption ?? "");
                          }}
                        >
                          Edit
                        </Button>
                        <Button variant="secondary" onClick={() => toggleStatus(v)}>
                          {v.status === "active" ? "Disable" : "Enable"}
                        </Button>
                        <Button variant="danger" onClick={() => deleteOne(v.id)}>
                          Delete
                        </Button>
                      </div>
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
