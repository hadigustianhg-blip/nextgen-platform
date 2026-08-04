import { AppShell } from "@/components/layout/app-shell";
import { ProfileClient } from "@/components/profile/profile-client";
import { requireSession } from "@/lib/auth/session";
import { getOwnProfile } from "@/modules/profile";

export const metadata = { title: "Profil Saya" };

export default async function ProfilePage() {
  const session = await requireSession();
  const profile = await getOwnProfile(session);
  return <AppShell session={session}><ProfileClient initialProfile={profile} /></AppShell>;
}
