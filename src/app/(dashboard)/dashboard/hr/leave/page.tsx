import { redirect } from "next/navigation";
import { LeaveAdminClient } from "@/components/leave/leave-admin-client";
import { AppShell } from "@/components/layout/app-shell";
import { requireSession } from "@/lib/auth/session";
import { canAccessResource } from "@/lib/permissions";

export const metadata = { title: "Pengajuan Team" };

export default async function LeavePage() {
  const session = await requireSession();
  if (!canAccessResource(session.roles, "LEAVE_MANAGEMENT", "READ")) redirect("/dashboard");
  return <AppShell session={session}><LeaveAdminClient canReview={canAccessResource(session.roles, "LEAVE_MANAGEMENT", "APPROVE")} /></AppShell>;
}
