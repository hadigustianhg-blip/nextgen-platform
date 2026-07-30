import type { SessionContext } from "@/lib/auth/session";
import { hasAnyRole } from "@/lib/permissions/roles";

export const canReadFinance = (session: SessionContext) =>
  hasAnyRole(session.roles, ["OWNER", "ADMIN", "OPERATIONAL", "VIEWER"]);
export const canExportFinance = (session: SessionContext) =>
  hasAnyRole(session.roles, ["OWNER", "ADMIN", "OPERATIONAL"]);
