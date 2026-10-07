"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const NAV_ITEMS = [
  { href: "/admin", label: "Dashboard", icon: "📊" },
  { href: "/admin/videos", label: "Videos", icon: "🎬" },
  { href: "/admin/users", label: "Users", icon: "👥" },
  { href: "/admin/payments", label: "Payments", icon: "💳" },
  { href: "/admin/subscriptions", label: "Subscriptions", icon: "📅" },
  { href: "/admin/analytics", label: "Analytics", icon: "📈" },
  { href: "/admin/broadcast", label: "Broadcast", icon: "📢" },
  { href: "/admin/support", label: "Support", icon: "🛠" },
  { href: "/admin/settings", label: "Settings", icon: "⚙️" },
];

export function Sidebar({ username }: { username: string }) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch("/api/admin/auth/logout", { method: "POST" });
    router.push("/admin/login");
    router.refresh();
  }

  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col border-r border-slate-800 bg-slate-950 text-slate-300">
      <div className="flex items-center gap-2 border-b border-slate-800 px-5 py-5">
        <span className="text-2xl">🎬</span>
        <div>
          <p className="text-sm font-semibold text-white">Premium Video Bot</p>
          <p className="text-xs text-slate-500">Admin Panel</p>
        </div>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {NAV_ITEMS.map((item) => {
          const active = item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                active ? "bg-indigo-600 text-white" : "hover:bg-slate-900 hover:text-white"
              }`}
            >
              <span>{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-slate-800 p-4">
        <p className="truncate text-xs text-slate-500">Signed in as</p>
        <p className="truncate text-sm font-medium text-white">{username}</p>
        <button
          onClick={logout}
          className="mt-3 w-full rounded-lg border border-slate-700 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-900"
        >
          Log out
        </button>
      </div>
    </aside>
  );
}
