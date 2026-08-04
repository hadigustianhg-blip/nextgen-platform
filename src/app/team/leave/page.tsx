import { CalendarDays } from "lucide-react";
import { TeamPlaceholderPage } from "@/components/team/team-placeholder-page";
import { requireTeamContext } from "@/lib/auth/session";

export const metadata = { title: "Pengajuan" };

export default async function TeamLeavePage() {
  await requireTeamContext();
  return <TeamPlaceholderPage eyebrow="Pengajuan Team" title="Cuti, Izin, dan Sakit" description="Fitur pengajuan sedang dipersiapkan." options={["Cuti", "Izin", "Sakit"]} icon={CalendarDays} />;
}
