"use client";

import { useEffect, useState } from "react";
import { Badge, Button, Card, Input, LoadingRow, Select, Textarea } from "@/app/admin/_components/ui";
import { useToast } from "@/app/admin/_components/Toast";

interface SettingsData {
  settings: Record<string, string>;
  env: {
    botConfigured: boolean;
    razorpayConfigured: boolean;
    webhookUrl?: string;
    supportUsername?: string;
  };
  botInfo: { id: number; username: string; first_name: string } | null;
}

interface PlanRow {
  id: number;
  name: string;
  price: string;
  durationDays: number;
  isActive: boolean;
  sortOrder: number;
}

export default function SettingsPage() {
  const toast = useToast();
  const [data, setData] = useState<SettingsData | null>(null);
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [webhookInfo, setWebhookInfo] = useState<any>(null);
  const [settingWebhook, setSettingWebhook] = useState(false);

  // Form states
  const [botName, setBotName] = useState("");
  const [supportUsername, setSupportUsername] = useState("");
  const [storageChatId, setStorageChatId] = useState("");
  const [welcomeMessage, setWelcomeMessage] = useState("");
  const [expiredMessage, setExpiredMessage] = useState("");
  const [captionTemplate, setCaptionTemplate] = useState("");
  const [maintenanceMode, setMaintenanceMode] = useState("false");
  const [repeatMode, setRepeatMode] = useState("false");
  const [notifyNewVideo, setNotifyNewVideo] = useState("false");
  const [freeMode, setFreeMode] = useState("false");

  // Plan modal/form states
  const [newPlanName, setNewPlanName] = useState("");
  const [newPlanPrice, setNewPlanPrice] = useState("");
  const [newPlanDays, setNewPlanDays] = useState("30");
  const [creatingPlan, setCreatingPlan] = useState(false);

  // Admin credentials state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [savingCredentials, setSavingCredentials] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [settingsRes, plansRes, webhookRes] = await Promise.all([
        fetch("/api/admin/settings").then((r) => r.json()),
        fetch("/api/admin/plans").then((r) => r.json()),
        fetch("/api/admin/telegram/webhook").then((r) => r.json()).catch(() => ({ ok: false })),
      ]);

      if (settingsRes.ok) {
        setData(settingsRes);
        const s = settingsRes.settings;
        setBotName(s.BOT_NAME ?? "");
        setSupportUsername(s.SUPPORT_USERNAME ?? "");
        setStorageChatId(s.STORAGE_CHAT_ID ?? "");
        setWelcomeMessage(s.WELCOME_MESSAGE ?? "");
        setExpiredMessage(s.EXPIRED_MESSAGE ?? "");
        setCaptionTemplate(s.VIDEO_CAPTION_TEMPLATE ?? "");
        setMaintenanceMode(s.MAINTENANCE_MODE ?? "false");
        setRepeatMode(s.REPEAT_MODE ?? "false");
        setNotifyNewVideo(s.NOTIFY_NEW_VIDEO ?? "false");
        setFreeMode(s.FREE_MODE ?? "false");
      }

      if (plansRes.ok) {
        setPlans(plansRes.rows);
      }

      if (webhookRes.ok) {
        setWebhookInfo(webhookRes.info);
      }
    } catch {
      toast.show("Failed to load settings data", "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    setSavingSettings(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          BOT_NAME: botName,
          SUPPORT_USERNAME: supportUsername,
          STORAGE_CHAT_ID: storageChatId,
          WELCOME_MESSAGE: welcomeMessage,
          EXPIRED_MESSAGE: expiredMessage,
          VIDEO_CAPTION_TEMPLATE: captionTemplate,
          MAINTENANCE_MODE: maintenanceMode,
          REPEAT_MODE: repeatMode,
          NOTIFY_NEW_VIDEO: notifyNewVideo,
          FREE_MODE: freeMode,
        }),
      });
      const resJson = await res.json();
      if (res.ok && resJson.ok) {
        toast.show("Settings saved successfully.", "success");
      } else {
        toast.show(resJson.error ?? "Failed to save settings", "error");
      }
    } catch {
      toast.show("Network error while saving settings", "error");
    } finally {
      setSavingSettings(false);
    }
  }

  async function handleSetWebhook() {
    setSettingWebhook(true);
    try {
      const res = await fetch("/api/admin/telegram/webhook", { method: "POST" });
      const resJson = await res.json();
      if (res.ok && resJson.ok) {
        toast.show("Telegram webhook successfully registered!", "success");
        load();
      } else {
        toast.show(resJson.error ?? "Failed to register webhook", "error");
      }
    } catch {
      toast.show("Network error while registering webhook", "error");
    } finally {
      setSettingWebhook(false);
    }
  }

  async function handleQuickToggleFreeMode(targetFree: boolean) {
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ FREE_MODE: targetFree ? "true" : "false" }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.ok) {
        setFreeMode(targetFree ? "true" : "false");
        toast.show(
          targetFree
            ? "🎁 Bot is now FREE TO USE for all users!"
            : "🔒 Subscription Mode ON! Users must subscribe to watch videos.",
          "success",
        );
      } else {
        toast.show(data?.error || "Failed to update bot mode", "error");
      }
    } catch {
      toast.show("Network error while updating bot mode", "error");
    }
  }

  async function handleTogglePlan(plan: PlanRow) {
    try {
      const res = await fetch("/api/admin/plans", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: plan.id, isActive: !plan.isActive }),
      });
      if (res.ok) {
        toast.show(`Plan ${plan.name} ${!plan.isActive ? "activated" : "deactivated"}.`, "success");
        load();
      }
    } catch {
      toast.show("Failed to update plan", "error");
    }
  }

  async function handleCreatePlan(e: React.FormEvent) {
    e.preventDefault();
    if (!newPlanName || !newPlanPrice || !newPlanDays) return;
    setCreatingPlan(true);
    try {
      const res = await fetch("/api/admin/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newPlanName,
          price: parseFloat(newPlanPrice),
          durationDays: parseInt(newPlanDays, 10),
        }),
      });
      if (res.ok) {
        toast.show("Plan created successfully.", "success");
        setNewPlanName("");
        setNewPlanPrice("");
        setNewPlanDays("30");
        load();
      } else {
        toast.show("Failed to create plan", "error");
      }
    } catch {
      toast.show("Error creating plan", "error");
    } finally {
      setCreatingPlan(false);
    }
  }

  async function handleChangeCredentials(e: React.FormEvent) {
    e.preventDefault();
    if (!currentPassword) {
      toast.show("Please enter your current password to authorize changes.", "error");
      return;
    }

    const trimmedUsername = newUsername.trim();
    if (!trimmedUsername && !newPassword) {
      toast.show("Please enter a new username or new password to update.", "error");
      return;
    }

    if (newPassword) {
      if (newPassword.length < 12) {
        toast.show("New password must be at least 12 characters long.", "error");
        return;
      }
      if (newPassword !== confirmNewPassword) {
        toast.show("New password and confirmation do not match.", "error");
        return;
      }
    }

    setSavingCredentials(true);
    try {
      const res = await fetch("/api/admin/auth/change-credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword,
          newUsername: trimmedUsername || undefined,
          newPassword: newPassword || undefined,
          confirmNewPassword: confirmNewPassword || undefined,
        }),
      });

      const resJson = await res.json().catch(() => null);
      if (res.ok && resJson?.ok) {
        if (resJson.reloginRequired) {
          toast.show("Password updated! Redirecting to login...", "success");
          setTimeout(() => {
            window.location.href = "/admin/login";
          }, 1500);
        } else {
          toast.show(resJson.message || "Admin credentials updated successfully.", "success");
          setCurrentPassword("");
          setNewUsername("");
          setNewPassword("");
          setConfirmNewPassword("");
          setTimeout(() => {
            window.location.reload();
          }, 1000);
        }
      } else {
        toast.show(resJson?.error || "Failed to update credentials", "error");
      }
    } catch {
      toast.show("Network error while updating credentials", "error");
    } finally {
      setSavingCredentials(false);
    }
  }

  if (loading) {
    return <div className="py-12 text-center text-slate-400">Loading settings...</div>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-white">⚙️ System & Bot Settings</h1>
        <p className="text-sm text-slate-400">Configure bot behavior, Telegram webhook, messages, and plans.</p>
      </div>

      {/* Integration Status Card */}
      <Card>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">Integration Diagnostics</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
            <p className="text-xs text-slate-500">Telegram Bot</p>
            <div className="mt-1 flex items-center gap-2">
              <Badge color={data?.env.botConfigured ? "emerald" : "rose"}>
                {data?.env.botConfigured ? "Configured" : "Missing Token"}
              </Badge>
              {data?.botInfo && <span className="text-xs text-slate-300">@{data.botInfo.username}</span>}
            </div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
            <p className="text-xs text-slate-500">Razorpay Gateway</p>
            <div className="mt-1">
              <Badge color={data?.env.razorpayConfigured ? "emerald" : "amber"}>
                {data?.env.razorpayConfigured ? "Configured" : "Test / Keys Missing"}
              </Badge>
            </div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
            <p className="text-xs text-slate-500">Webhook Base URL</p>
            <p className="mt-1 truncate text-xs text-slate-300 font-mono">
              {data?.env.webhookUrl || "Not set (polling mode)"}
            </p>
          </div>
        </div>

        {data?.env.webhookUrl && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800/80 bg-slate-950/60 p-3">
            <div>
              <p className="text-xs font-medium text-slate-300">Current Webhook Status</p>
              <p className="text-xs text-slate-500">
                {webhookInfo?.url ? `Registered: ${webhookInfo.url}` : "No webhook registered in Telegram yet."}
              </p>
            </div>
            <Button variant="secondary" onClick={handleSetWebhook} disabled={settingWebhook}>
              {settingWebhook ? "Registering..." : "⚡ Sync / Set Telegram Webhook"}
            </Button>
          </div>
        )}
      </Card>

      {/* Bot Access Mode Quick Switcher Card */}
      <div
        className={`rounded-2xl border p-5 transition-all shadow-md backdrop-blur ${
          freeMode === "true"
            ? "border-emerald-500/40 bg-gradient-to-r from-emerald-950/40 via-slate-900/80 to-emerald-950/20"
            : "border-indigo-500/40 bg-gradient-to-r from-indigo-950/40 via-slate-900/80 to-indigo-950/20"
        }`}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <span className="text-2xl">{freeMode === "true" ? "🎁" : "🔒"}</span>
              <h2 className="text-base font-semibold text-white">Bot Access Mode</h2>
              <span
                className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                  freeMode === "true"
                    ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
                    : "bg-indigo-500/10 text-indigo-300 border-indigo-500/30"
                }`}
              >
                {freeMode === "true" ? "FREE TO USE (NO SUBSCRIPTION)" : "SUBSCRIPTION REQUIRED (PAID)"}
              </span>
            </div>
            <p className="text-xs text-slate-300">
              {freeMode === "true"
                ? "Bot is currently FREE for all users. Anyone can watch videos without buying a subscription."
                : "Subscription is currently ON. Users must purchase an active subscription plan to watch videos."}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => handleQuickToggleFreeMode(false)}
              disabled={freeMode !== "true"}
              className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-xs font-semibold transition ${
                freeMode !== "true"
                  ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 ring-2 ring-indigo-400"
                  : "bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white"
              } disabled:cursor-not-allowed`}
            >
              <span>🔒</span>
              <span>Subscription Mode ON</span>
            </button>
            <button
              type="button"
              onClick={() => handleQuickToggleFreeMode(true)}
              disabled={freeMode === "true"}
              className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-xs font-semibold transition ${
                freeMode === "true"
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

      {/* Main Bot Settings */}
      <form onSubmit={handleSaveSettings} className="space-y-6">
        <Card>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">Core Configuration</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
                Bot Access Mode (Free vs Subscription)
              </label>
              <Select value={freeMode} onChange={(e) => setFreeMode(e.target.value)} className="w-full">
                <option value="false">🔒 Subscription Required (Users must buy a plan)</option>
                <option value="true">🎁 Free to Use (All users can watch videos free)</option>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">Bot Name</label>
              <Input value={botName} onChange={(e) => setBotName(e.target.value)} placeholder="Short Video Premium Bot" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">Support Username (@)</label>
              <Input value={supportUsername} onChange={(e) => setSupportUsername(e.target.value)} placeholder="your_telegram_handle" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">Storage Channel/Chat ID (optional)</label>
              <Input value={storageChatId} onChange={(e) => setStorageChatId(e.target.value)} placeholder="-1001234567890" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">Maintenance Mode</label>
              <Select value={maintenanceMode} onChange={(e) => setMaintenanceMode(e.target.value)} className="w-full">
                <option value="false">Disabled (Bot Active for all)</option>
                <option value="true">Enabled (Users blocked, Admins allowed)</option>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">Video Repeat Mode</label>
              <Select value={repeatMode} onChange={(e) => setRepeatMode(e.target.value)} className="w-full">
                <option value="false">Disabled (Stop when all watched)</option>
                <option value="true">Enabled (Loop videos after all watched)</option>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">Notify Active Users on New Video</label>
              <Select value={notifyNewVideo} onChange={(e) => setNotifyNewVideo(e.target.value)} className="w-full">
                <option value="false">Disabled</option>
                <option value="true">Enabled (Broadcast to active users on upload)</option>
              </Select>
            </div>
          </div>
        </Card>

        {/* Message Templates */}
        <Card>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">Bot Message Templates</h2>
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">Welcome Message (/start)</label>
              <Textarea rows={4} value={welcomeMessage} onChange={(e) => setWelcomeMessage(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">Expired Subscription Message</label>
              <Textarea rows={3} value={expiredMessage} onChange={(e) => setExpiredMessage(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">Default Video Caption Template</label>
              <Input value={captionTemplate} onChange={(e) => setCaptionTemplate(e.target.value)} placeholder="🎬 Video #{sequence}" />
            </div>
          </div>

          <div className="mt-5 flex justify-end">
            <Button type="submit" disabled={savingSettings}>
              {savingSettings ? "Saving Settings..." : "Save Settings"}
            </Button>
          </div>
        </Card>
      </form>

      {/* Admin Account Security Section */}
      <Card>
        <div className="mb-4">
          <div className="flex items-center gap-2">
            <span className="text-lg">🔐</span>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
              Admin Account Security
            </h2>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Change your administrator login username or password. Current password is required to verify your identity.
          </p>
        </div>

        <form onSubmit={handleChangeCredentials} className="space-y-4">
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3.5 text-xs text-amber-300">
            <span className="font-semibold">Security Note:</span> If you change your password, your active session will be signed out and you will be redirected to log in with your new credentials. New passwords must be at least 12 characters.
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Current Password */}
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
                Current Password <span className="text-rose-400">*</span>
              </label>
              <div className="relative">
                <Input
                  type={showCurrentPassword ? "text" : "password"}
                  placeholder="Enter your current password to authorize changes"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-400 hover:text-slate-200"
                >
                  {showCurrentPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            {/* New Username (Optional) */}
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
                New Username <span className="text-slate-500 font-normal normal-case">(optional - leave blank to keep current)</span>
              </label>
              <Input
                type="text"
                placeholder="Leave blank to keep current username"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                autoComplete="username"
              />
              <p className="mt-1 text-[11px] text-slate-500">
                Allowed: 3–64 characters (letters, numbers, underscores, hyphens).
              </p>
            </div>

            {/* New Password (Optional) */}
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
                New Password <span className="text-slate-500 font-normal normal-case">(optional - min 12 characters)</span>
              </label>
              <div className="relative">
                <Input
                  type={showNewPassword ? "text" : "password"}
                  placeholder="At least 12 characters"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-400 hover:text-slate-200"
                >
                  {showNewPassword ? "Hide" : "Show"}
                </button>
              </div>
              <p className="mt-1 text-[11px] text-slate-500">
                Must include both letters and numbers/symbols.
              </p>
            </div>

            {/* Confirm New Password */}
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
                Confirm New Password
              </label>
              <Input
                type={showNewPassword ? "text" : "password"}
                placeholder="Re-enter new password"
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
                autoComplete="new-password"
                disabled={!newPassword}
              />
              {newPassword && confirmNewPassword && newPassword !== confirmNewPassword && (
                <p className="mt-1 text-[11px] text-rose-400">Passwords do not match.</p>
              )}
            </div>
          </div>

          <div className="mt-4 flex justify-end">
            <Button
              type="submit"
              disabled={savingCredentials || !currentPassword || (!newUsername.trim() && !newPassword)}
            >
              {savingCredentials ? "Updating Credentials..." : "Update Admin Credentials"}
            </Button>
          </div>
        </form>
      </Card>

      {/* Subscription Plans Section */}
      <Card>
        <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Subscription Plans</h2>
            <p className="text-xs text-slate-500">Configure prices and durations presented in the /plan keyboard.</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-xs uppercase tracking-wide text-slate-500">
                <th className="py-2">Plan Name</th>
                <th className="py-2">Price</th>
                <th className="py-2">Duration</th>
                <th className="py-2">Status</th>
                <th className="py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {plans.map((p) => (
                <tr key={p.id} className="border-b border-slate-800/60">
                  <td className="py-2.5 font-medium text-slate-200">{p.name}</td>
                  <td className="py-2.5 text-slate-300">₹{parseFloat(p.price).toFixed(2)}</td>
                  <td className="py-2.5 text-slate-400">{p.durationDays} day(s)</td>
                  <td className="py-2.5">
                    <Badge color={p.isActive ? "emerald" : "slate"}>
                      {p.isActive ? "Active" : "Disabled"}
                    </Badge>
                  </td>
                  <td className="py-2.5 text-right">
                    <Button variant="secondary" onClick={() => handleTogglePlan(p)}>
                      {p.isActive ? "Disable" : "Enable"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Add Plan Form */}
        <form onSubmit={handleCreatePlan} className="mt-5 rounded-xl border border-slate-800 bg-slate-950 p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Add New Plan</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <Input
              placeholder="Plan name (e.g. VIP Yearly)"
              value={newPlanName}
              onChange={(e) => setNewPlanName(e.target.value)}
              required
            />
            <Input
              type="number"
              step="0.01"
              placeholder="Price in ₹"
              value={newPlanPrice}
              onChange={(e) => setNewPlanPrice(e.target.value)}
              required
            />
            <Input
              type="number"
              placeholder="Duration in days"
              value={newPlanDays}
              onChange={(e) => setNewPlanDays(e.target.value)}
              required
            />
            <Button type="submit" disabled={creatingPlan}>
              {creatingPlan ? "Adding..." : "+ Create Plan"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

