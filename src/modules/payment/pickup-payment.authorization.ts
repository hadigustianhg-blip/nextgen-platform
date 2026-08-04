import type { SessionContext } from "@/lib/auth/session";
import { canAccessResource } from "@/lib/permissions";

export const pickupPaymentScope = (session: SessionContext) =>
  session.outletId ? { tenantId: session.tenantId, outletId: session.outletId } : null;

export const canReadPickupPayment = (session: SessionContext) =>
  canAccessResource(session.roles, "PICKUP_PAYMENT", "READ");
export const canCreatePickupPayment = (session: SessionContext) =>
  canAccessResource(session.roles, "PICKUP_PAYMENT", "CREATE");
export const canManagePickupPayment = (session: SessionContext) =>
  canAccessResource(session.roles, "PICKUP_PAYMENT", "UPDATE");
