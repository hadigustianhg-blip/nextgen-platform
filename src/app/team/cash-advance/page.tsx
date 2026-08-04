import { HandCoins } from "lucide-react";
import { TeamPlaceholderPage } from "@/components/team/team-placeholder-page";
import { requireTeamContext } from "@/lib/auth/session";

export const metadata = { title: "Kasbon Saya" };

export default async function TeamCashAdvancePage() {
  await requireTeamContext();
  return <TeamPlaceholderPage eyebrow="Keuangan Pribadi" title="Kasbon Saya" description="Data kasbon pribadi sedang dipersiapkan. Hanya catatan kasbon pribadi yang terverifikasi yang nantinya akan tampil." icon={HandCoins} />;
}
