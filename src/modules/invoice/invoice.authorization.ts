import type { SessionContext } from "@/lib/auth/session";
import { hasAnyRole } from "@/lib/permissions/roles";

export const invoiceScope = (session: SessionContext) =>
  session.outletId
    ? { tenantId: session.tenantId, outletId: session.outletId }
    : null;

export const canReadInvoice = (session: SessionContext) =>
  hasAnyRole(session.roles, ["OWNER", "ADMIN", "OPERATIONAL", "VIEWER"]);
export const canMutateInvoice = (session: SessionContext) =>
  hasAnyRole(session.roles, ["OWNER", "ADMIN", "OPERATIONAL"]);
export const canIssueInvoice = (session: SessionContext) =>
  hasAnyRole(session.roles, ["OWNER", "ADMIN"]);
export const canExportInvoice = canReadInvoice;
export const canPrepareInvoiceWhatsapp = canMutateInvoice;
export const canVoidInvoice = canIssueInvoice;
