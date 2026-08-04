import { TeamLeaveClient } from "@/components/team/team-leave-client";
import { requireTeamContext } from "@/lib/auth/session";

export const metadata = { title: "Pengajuan" };

export default async function TeamLeavePage() {
  await requireTeamContext();
  return <TeamLeaveClient />;
}
