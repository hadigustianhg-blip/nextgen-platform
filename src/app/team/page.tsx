import { TeamHomeClient } from "@/components/team/team-home-client";
import { requireTeamContext } from "@/lib/auth/session";

export const metadata = { title: "Home" };

export default async function TeamHomePage() {
  const team = await requireTeamContext();
  return <TeamHomeClient employeeName={team.employeeName} outletCode={team.outletCode} />;
}
