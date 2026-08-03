import type { SessionContext } from "@/lib/auth/session";

export function canAccessSettings(session: Pick<SessionContext, "roles">) {
  return session.roles.some((role) => role === "OWNER" || role === "ADMIN");
}
