import { TeamProfileClient } from "@/components/team/team-profile-client";
import { requireTeamContext } from "@/lib/auth/session";

export const metadata = { title: "Profil" };

export default async function TeamProfilePage() {
  await requireTeamContext();
  return <TeamProfileClient />;
}
