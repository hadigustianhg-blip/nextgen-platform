import type { SessionContext } from "@/lib/auth/session";
import { canAccessResource } from "@/lib/permissions";

export const canReadFinance = (session: SessionContext) =>
  canAccessResource(session.roles, "OPERATIONAL_DETAIL", "READ");
export const canExportFinance = (session: SessionContext) =>
  canAccessResource(session.roles, "OPERATIONAL_DETAIL", "EXPORT");
export const canManageFinance = (session: SessionContext) =>
  canAccessResource(session.roles, "OPERATIONAL_DETAIL", "MANAGE");
