import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import {
  canExportInvoice, createInvoicePdf, getActiveOutletBankAccounts, getInvoice,
  invoicePdfFilename, invoiceScope,
} from "@/modules/invoice";

type Context = { params: Promise<{ id: string }> };

export async function GET(_: Request, context: Context) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (!canExportInvoice(session)) return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  const scope = invoiceScope(session);
  if (!scope) return NextResponse.json({ error: { code: "OUTLET_REQUIRED" } }, { status: 400 });
  const invoice = await getInvoice(scope, (await context.params).id);
  if (!invoice || !["ISSUED", "SENT", "PARTIALLY_PAID", "PAID"].includes(invoice.status)) {
    return NextResponse.json({ error: { code: "INVOICE_NOT_READY" } }, { status: 409 });
  }
  try {
    const accounts = await getActiveOutletBankAccounts(scope);
    const pdf = await createInvoicePdf(invoice, accounts);
    await prisma.auditLog.create({ data: {
      ...scope, actorId: session.userId, action: "CREATE",
      entityType: "EXPORT_INVOICE_PDF", entityId: invoice.id,
      metadata: {
        invoiceNumber: invoice.invoiceNumber,
        customerKey: invoice.customerKey,
        itemCount: invoice.items.length,
        grandTotal: invoice.grandTotal.toString(),
        result: "SUCCESS",
      },
    } });
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${invoicePdfFilename(invoice)}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return NextResponse.json({
      error: { code: "PDF_FAILED", message: "PDF invoice gagal dibuat." },
    }, { status: 500 });
  }
}
