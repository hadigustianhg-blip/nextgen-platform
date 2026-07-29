import type { SessionContext } from "@/lib/auth/session";
import { hasAnyRole } from "@/lib/permissions/roles";

export function operationalScope(session: SessionContext) {
  return session.outletId ? { tenantId: session.tenantId, outletId: session.outletId } : null;
}

export function canReadOperational(session: SessionContext) {
  return hasAnyRole(session.roles, ["OWNER", "ADMIN", "OPERATIONAL", "FINANCE", "VIEWER"]);
}

export function canMutateExpense(session: SessionContext) {
  return hasAnyRole(session.roles, ["OWNER", "ADMIN", "OPERATIONAL"]);
}

export function canCloseOperational(session: SessionContext) {
  return hasAnyRole(session.roles, ["OWNER", "ADMIN"]);
}

export function canReopenOperational(session: SessionContext) {
  return hasAnyRole(session.roles, ["OWNER", "ADMIN"]);
}
