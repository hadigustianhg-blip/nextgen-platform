import type { SessionContext } from "@/lib/auth/session";
import { canAccessResource } from "@/lib/permissions";

export function deliveryScope(session: SessionContext) {
  return session.outletId ? { tenantId: session.tenantId, outletId: session.outletId } : null;
}

export function canReadDelivery(session: SessionContext) {
  return canAccessResource(session.roles, "DELIVERY_SETTLEMENT", "READ");
}

export function canSyncDelivery(session: SessionContext) {
  return canAccessResource(session.roles, "DELIVERY_SETTLEMENT", "MANAGE");
}

export function canAdjustDelivery(session: SessionContext) {
  return canAccessResource(session.roles, "DELIVERY_SETTLEMENT", "UPDATE");
}
