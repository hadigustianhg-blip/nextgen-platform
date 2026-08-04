import { redirectToLogin } from "@/lib/auth/redirect";
import { getAnySession } from "@/lib/auth/session";
import { logout } from "@/modules/auth/auth.service";

export async function POST() {
  const session = await getAnySession();
  if (session) await logout(session);
  return redirectToLogin({ status: 303 });
}
