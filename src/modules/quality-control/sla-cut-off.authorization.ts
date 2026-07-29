import type { SessionContext } from "@/lib/auth/session";
import { hasAnyRole } from "@/lib/permissions/roles";
export const canReadSlaCutOff = (session: SessionContext) =>
  hasAnyRole(session.roles, ["OWNER", "ADMIN", "OPERATIONAL", "VIEWER"]);
export const canSyncSlaCutOff = (session: SessionContext) =>
  hasAnyRole(session.roles, ["OWNER", "ADMIN", "OPERATIONAL"]);
