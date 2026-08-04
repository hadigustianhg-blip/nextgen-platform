import type { SessionContext } from "@/lib/auth/session";
import { canAccessResource } from "@/lib/permissions";

export function canReadPickup(session: SessionContext) {
  return canAccessResource(session.roles, "PICKUP_SETTLEMENT", "READ");
}

export function canSyncPickup(session: SessionContext) {
  return canAccessResource(session.roles, "PICKUP_SETTLEMENT", "MANAGE");
}

export function canViewPickupPii(session: SessionContext) {
  return canAccessResource(session.roles, "PICKUP_SETTLEMENT", "UPDATE");
}

export function pickupScope(session: SessionContext) {
  if (!session.outletId) return null;
  return {
    tenantId: session.tenantId,
    outletId: session.outletId,
  };
}
