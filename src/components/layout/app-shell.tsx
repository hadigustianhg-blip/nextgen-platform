import type { ReactNode } from "react";
import type { SessionContext } from "@/lib/auth/session";
import { AppHeader } from "./app-header";
import { Sidebar } from "./sidebar";

export function AppShell({ session, children }: { session: SessionContext; children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-[var(--nextgen-background)]">
      <Sidebar outletCode={session.outletCode} />
      <div className="min-w-0 flex-1">
        <AppHeader session={session} />
        <main className="p-5 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
