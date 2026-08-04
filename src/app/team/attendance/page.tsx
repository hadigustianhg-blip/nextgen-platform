import { TeamAttendanceClient } from "@/components/attendance/team-attendance-client";
import { requireTeamContext } from "@/lib/auth/session";

export const metadata = { title: "Absensi Team" };

export default async function TeamAttendancePage() {
  const team = await requireTeamContext();
  return <TeamAttendanceClient employeeName={team.employeeName} outletCode={team.outletCode} />;
}
