import type { SessionContext } from "@/lib/auth/session";
import { hasAnyRole } from "@/lib/permissions/roles";

export function deliveryScope(session: SessionContext) {
  return session.outletId ? { tenantId: session.tenantId, outletId: session.outletId } : null;
}

export function canReadDelivery(session: SessionContext) {
  return hasAnyRole(session.roles, ["OWNER", "ADMIN", "OPERATIONAL", "VIEWER"]);
}

export function canSyncDelivery(session: SessionContext) {
  return hasAnyRole(session.roles, ["OWNER", "ADMIN", "OPERATIONAL"]);
}

export function canAdjustDelivery(session: SessionContext) {
  return hasAnyRole(session.roles, ["OWNER", "ADMIN"]);
}
