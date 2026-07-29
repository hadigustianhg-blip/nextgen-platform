import type { SessionContext } from "@/lib/auth/session";
import { hasAnyRole } from "@/lib/permissions/roles";

export const paymentSettlementScope = (session: SessionContext) =>
  session.outletId ? { tenantId: session.tenantId, outletId: session.outletId } : null;

export const canReadPaymentSettlement = (session: SessionContext) =>
  hasAnyRole(session.roles, ["OWNER", "ADMIN", "OPERATIONAL", "FINANCE", "VIEWER"]);

