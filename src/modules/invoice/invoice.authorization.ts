import type { SessionContext } from "@/lib/auth/session";
import { canAccessResource } from "@/lib/permissions";

export const invoiceScope = (session: SessionContext) =>
  session.outletId
    ? { tenantId: session.tenantId, outletId: session.outletId }
    : null;

export const canReadInvoice = (session: SessionContext) =>
  canAccessResource(session.roles, "INVOICE", "READ");
export const canMutateInvoice = (session: SessionContext) =>
  canAccessResource(session.roles, "INVOICE", "UPDATE");
export const canIssueInvoice = (session: SessionContext) =>
  canAccessResource(session.roles, "INVOICE", "FINALIZE");
export const canExportInvoice = (session: SessionContext) =>
  canAccessResource(session.roles, "INVOICE", "EXPORT");
export const canPrepareInvoiceWhatsapp = canMutateInvoice;
export const canVoidInvoice = canIssueInvoice;
