import type { SessionContext } from "@/lib/auth/session";
import { canAccessResource } from "@/lib/permissions";

export const cashFlowScope = (session: SessionContext) =>
  session.outletId ? { tenantId: session.tenantId, outletId: session.outletId } : null;

export const canReadCashFlow = (session: SessionContext) =>
  canAccessResource(session.roles, "PAYMENT_SETTLEMENT", "READ");

export const canCreateManualCashFlow = (session: SessionContext) =>
  canAccessResource(session.roles, "PAYMENT_SETTLEMENT", "CREATE");

export const canManageManualCashFlow = (session: SessionContext) =>
  canAccessResource(session.roles, "PAYMENT_SETTLEMENT", "UPDATE");
