import type { ReactNode } from "react";
import type { SessionContext } from "@/lib/auth/session";
import { AppHeader } from "./app-header";
import { Sidebar } from "./sidebar";

export function AppShell({ session, children }: { session: SessionContext; children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-[var(--nextgen-background)]">
      <Sidebar roles={session.roles} />
      <div className="relative min-w-0 flex-1 overflow-x-clip bg-[var(--nextgen-background)] lg:rounded-tl-[var(--nextgen-radius-workspace)]">
        <AppHeader session={session} />
        <main className="relative p-4 sm:p-5 lg:p-6 xl:p-7">
          <div className="pointer-events-none absolute inset-x-0 top-0 -z-0 h-64 bg-gradient-to-b from-blue-50/55 to-transparent" aria-hidden="true" />
          <div className="relative z-[1]">{children}</div>
        </main>
      </div>
    </div>
  );
}
