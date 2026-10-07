import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth/session";
import { Sidebar } from "@/app/admin/_components/Sidebar";
import { ToastProvider } from "@/app/admin/_components/Toast";

export default async function AdminDashboardLayout({ children }: { children: ReactNode }) {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");

  return (
    <ToastProvider>
      <div className="flex min-h-screen bg-slate-950 text-slate-100">
        <Sidebar username={session.username} />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-7xl px-6 py-8">{children}</div>
        </main>
      </div>
    </ToastProvider>
  );
}
