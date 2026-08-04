import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { SettingsShell } from "@/components/settings/settings-shell";
import { SettingsTargetKpi } from "@/components/settings/settings-target-kpi";
import { requireSession } from "@/lib/auth/session";
import { canAccessSettings } from "@/modules/settings";

export const metadata = { title: "Target & KPI" };

export default async function Page() {
  const session = await requireSession();
  if (!canAccessSettings(session)) redirect("/dashboard");

  return <AppShell session={session}>
    <SettingsShell
      title="Target & KPI"
      description="Atur target operasional sebagai referensi monitoring outlet."
    >
      <SettingsTargetKpi />
    </SettingsShell>
  </AppShell>;
}
