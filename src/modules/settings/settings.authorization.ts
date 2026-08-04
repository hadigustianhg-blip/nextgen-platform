import type { SessionContext } from "@/lib/auth/session";
import { canAccessResource } from "@/lib/permissions";

export function canAccessSettings(session: Pick<SessionContext, "roles">) {
  return canAccessResource(session.roles, "SETTINGS_PROFILE", "READ");
}
