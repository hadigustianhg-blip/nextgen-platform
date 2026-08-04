import { AttendanceAdminClient } from "@/components/attendance/attendance-admin-client";
import { AppShell } from "@/components/layout/app-shell";
import { requireSession } from "@/lib/auth/session";
import { canAccessResource } from "@/lib/permissions";
import { redirect } from "next/navigation";

export const metadata = { title: "Absensi" };

export default async function AttendancePage() {
  const session = await requireSession();
  if (!canAccessResource(session.roles, "ATTENDANCE", "READ")) redirect("/dashboard");
  const canCorrect = canAccessResource(session.roles, "ATTENDANCE", "UPDATE");
  return <AppShell session={session}><AttendanceAdminClient canCorrect={canCorrect} /></AppShell>;
}
