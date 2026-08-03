import type { SessionContext } from "@/lib/auth/session";
import { hasAnyRole } from "@/lib/permissions/roles";
import { canReadFinance } from "@/modules/finance/finance.authorization";

export const canReadProfitLoss = canReadFinance;
export const canManageProfitLoss = (session: SessionContext) =>
  hasAnyRole(session.roles, ["OWNER", "ADMIN"]);
export const profitLossScope = (session: SessionContext) => session.outletId
  ? { tenantId: session.tenantId, outletId: session.outletId }
  : null;
