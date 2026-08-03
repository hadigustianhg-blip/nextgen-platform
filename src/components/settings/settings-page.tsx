import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { requireSession } from "@/lib/auth/session";
import { canAccessSettings } from "@/modules/settings";
import { SettingsClient } from "./settings-client";
import { SettingsShell } from "./settings-shell";

type Section = "profile" | "users" | "finance" | "integrations" | "maintenance" | "audit";
export async function SettingsPage({ section, title, description }: { section: Section; title: string; description: string }) {
  const session = await requireSession();
  if (!canAccessSettings(session)) redirect("/dashboard");
  return <AppShell session={session}><SettingsShell title={title} description={description}><SettingsClient section={section} /></SettingsShell></AppShell>;
}
