import type { SessionContext } from "@/lib/auth/session";
import { canAccessResource } from "@/lib/permissions";

export const canReadProfitLoss = (session: SessionContext) =>
  canAccessResource(session.roles, "PROFIT_LOSS", "READ");
export const canManageProfitLoss = (session: SessionContext) =>
  canAccessResource(session.roles, "PROFIT_LOSS", "MANAGE");
export const canExportProfitLoss = (session: SessionContext) =>
  canAccessResource(session.roles, "PROFIT_LOSS", "EXPORT");
export const profitLossScope = (session: SessionContext) => session.outletId
  ? { tenantId: session.tenantId, outletId: session.outletId }
  : null;
