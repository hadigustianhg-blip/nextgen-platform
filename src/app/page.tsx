import { redirect } from "next/navigation";
import { getAnySession, isTeamSession } from "@/lib/auth/session";

export default async function Home() {
  const session = await getAnySession();
  redirect(session ? isTeamSession(session) ? "/team" : "/dashboard" : "/login");
}
