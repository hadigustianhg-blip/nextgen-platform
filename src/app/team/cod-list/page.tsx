import { TeamCodListClient } from "@/components/team/team-cod-list-client";
import { requireTeamContext } from "@/lib/auth/session";
import { todayInJakarta } from "@/modules/team/team-cod-list.service";

export const metadata = { title: "COD List" };

export default async function TeamCodListPage() {
  const team = await requireTeamContext();
  return <TeamCodListClient employeeName={team.employeeName} outletCode={team.outletCode} initialDate={todayInJakarta()} />;
}
