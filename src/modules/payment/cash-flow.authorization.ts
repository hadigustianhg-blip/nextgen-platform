import type { SessionContext } from "@/lib/auth/session";
import { hasAnyRole } from "@/lib/permissions/roles";

export const cashFlowScope = (session: SessionContext) =>
  session.outletId ? { tenantId: session.tenantId, outletId: session.outletId } : null;

export const canReadCashFlow = (session: SessionContext) =>
  hasAnyRole(session.roles, ["OWNER", "ADMIN", "OPERATIONAL", "FINANCE", "VIEWER"]);

export const canCreateManualCashFlow = (session: SessionContext) =>
  hasAnyRole(session.roles, ["OWNER", "ADMIN", "OPERATIONAL"]);

export const canManageManualCashFlow = (session: SessionContext) =>
  hasAnyRole(session.roles, ["OWNER", "ADMIN"]);

