import type { SessionContext } from "@/lib/auth/session";
import { canAccessResource } from "@/lib/permissions";

export const paymentSettlementScope = (session: SessionContext) =>
  session.outletId ? { tenantId: session.tenantId, outletId: session.outletId } : null;

export const canReadPaymentSettlement = (session: SessionContext) =>
  canAccessResource(session.roles, "PAYMENT_SETTLEMENT", "READ");
