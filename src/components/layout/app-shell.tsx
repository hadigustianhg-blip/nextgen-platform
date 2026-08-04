import type { ReactNode } from "react";
import type { SessionContext } from "@/lib/auth/session";
import { UserAvatar } from "@/components/ui";
import { Sidebar } from "./sidebar";

export function AppShell({ session, children }: { session: SessionContext; children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-[#f4f7fb]">
      <Sidebar outletCode={session.outletCode} />
      <div className="min-w-0 flex-1">
        <header className="flex h-20 items-center justify-end border-b border-slate-200/80 bg-white px-5 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold text-slate-800">{session.userName}</p>
              <p className="text-xs text-slate-500">{session.roles.join(" · ")}</p>
            </div>
            <UserAvatar name={session.userName} />
          </div>
        </header>
        <main className="p-5 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
