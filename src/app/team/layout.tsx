import type { Metadata, Viewport } from "next";
import { TeamShell } from "@/components/team/team-shell";
import { requireTeamContext } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: { default: "NEXTGEN Team", template: "%s | NEXTGEN Team" },
  description: "Aplikasi operasional Team NEXTGEN",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "NEXTGEN Team" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#0f2b5b",
};

function greeting() {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone: "Asia/Jakarta" }).format(new Date()));
  if (hour < 11) return "Selamat Pagi";
  if (hour < 15) return "Selamat Siang";
  if (hour < 18) return "Selamat Sore";
  return "Selamat Malam";
}
export default async function TeamLayout({ children }: { children: React.ReactNode }) {
  const team = await requireTeamContext();
  return <TeamShell employeeName={team.employeeName} outletCode={team.outletCode} greeting={greeting()}>{children}</TeamShell>;
}
