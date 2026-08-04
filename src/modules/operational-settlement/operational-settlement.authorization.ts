import type { SessionContext } from "@/lib/auth/session";
import { canAccessResource } from "@/lib/permissions";

export function operationalScope(session: SessionContext) {
  return session.outletId ? { tenantId: session.tenantId, outletId: session.outletId } : null;
}

export function canReadOperational(session: SessionContext) {
  return canAccessResource(session.roles, "OPERATIONAL_SETTLEMENT", "READ");
}

export function canMutateExpense(session: SessionContext) {
  return canAccessResource(session.roles, "OPERATIONAL_SETTLEMENT", "CREATE");
}

export function canCloseOperational(session: SessionContext) {
  return canAccessResource(session.roles, "OPERATIONAL_SETTLEMENT", "FINALIZE");
}

export function canReopenOperational(session: SessionContext) {
  return canAccessResource(session.roles, "OPERATIONAL_SETTLEMENT", "UPDATE");
}
