import type { SessionContext } from "@/lib/auth/session";
import { hasAnyRole } from "@/lib/permissions/roles";

export const pickupPaymentScope = (session: SessionContext) =>
  session.outletId ? { tenantId: session.tenantId, outletId: session.outletId } : null;

export const canReadPickupPayment = (session: SessionContext) =>
  hasAnyRole(session.roles, ["OWNER", "ADMIN", "OPERATIONAL", "FINANCE", "VIEWER"]);
export const canCreatePickupPayment = (session: SessionContext) =>
  hasAnyRole(session.roles, ["OWNER", "ADMIN", "OPERATIONAL"]);
export const canManagePickupPayment = (session: SessionContext) =>
  hasAnyRole(session.roles, ["OWNER", "ADMIN"]);

