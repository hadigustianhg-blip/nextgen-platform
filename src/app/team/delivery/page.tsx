import { PackageSearch } from "lucide-react";
import { TeamPlaceholderPage } from "@/components/team/team-placeholder-page";
import { requireTeamContext } from "@/lib/auth/session";

export const metadata = { title: "Delivery Saya" };

export default async function TeamDeliveryPage() {
  await requireTeamContext();
  return <TeamPlaceholderPage eyebrow="Operasional Pribadi" title="Delivery Saya" description="Data delivery pribadi akan tersedia setelah mapping kurir selesai." icon={PackageSearch} />;
}
