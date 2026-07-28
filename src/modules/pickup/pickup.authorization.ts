import type { SessionContext } from "@/lib/auth/session";
import { hasAnyRole } from "@/lib/permissions/roles";

const PICKUP_READ_ROLES = ["OWNER", "ADMIN", "OPERATIONAL", "VIEWER"] as const;
const PICKUP_SYNC_ROLES = ["OWNER", "ADMIN", "OPERATIONAL"] as const;
const PICKUP_PII_ROLES = ["OWNER", "ADMIN"] as const;

export function canReadPickup(session: SessionContext) {
  return hasAnyRole(session.roles, PICKUP_READ_ROLES);
}

export function canSyncPickup(session: SessionContext) {
  return hasAnyRole(session.roles, PICKUP_SYNC_ROLES);
}

export function canViewPickupPii(session: SessionContext) {
  return hasAnyRole(session.roles, PICKUP_PII_ROLES);
}

export function pickupScope(session: SessionContext) {
  if (!session.outletId) return null;
  return {
    tenantId: session.tenantId,
    outletId: session.outletId,
  };
}
