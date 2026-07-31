import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import {
  canExportInvoice, createInvoicePdf, getInvoice,
  invoicePdfFilename, invoiceScope,
} from "@/modules/invoice";

type Context = { params: Promise<{ id: string }> };
type PdfPhase =
  | "request_received"
  | "invoice_loaded"
  | "status_validated"
  | "outlet_loaded"
  | "bank_accounts_loaded"
  | "pdf_start"
  | "logo_loaded"
  | "pdf_document_created"
  | "font_loaded"
  | "header_rendered"
  | "items_rendered"
  | "table_rendered"
  | "totals_rendered"
  | "pdf_finalized"
  | "pdf_end"
  | "response_created";

const pdfError = (status: number, code: string, message: string) =>
  NextResponse.json({ success: false, code, message }, { status });

export async function GET(_: Request, context: Context) {
  const requestId = randomUUID();
  const invoiceId = (await context.params).id;
  let phase: PdfPhase = "request_received";
  let invoiceStatus: string | null = null;
  console.info("[invoice.pdf]", { requestId, invoiceId, phase });

  const session = await getSession();
  if (!session) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (!canExportInvoice(session)) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }
  const scope = invoiceScope(session);
  if (!scope) return NextResponse.json({ error: { code: "OUTLET_REQUIRED" } }, { status: 400 });

  try {
    const invoice = await getInvoice(scope, invoiceId);
    if (!invoice) {
      return pdfError(404, "INVOICE_NOT_FOUND", "Invoice tidak ditemukan.");
    }
    invoiceStatus = invoice.status;
    phase = "invoice_loaded";
    console.info("[invoice.pdf]", { requestId, invoiceId, invoiceStatus, phase });

    if (invoice.status === "CANCELLED") {
      return pdfError(
        409,
        "INVOICE_PDF_NOT_ALLOWED",
        "Finalisasi invoice terlebih dahulu untuk membuat PDF.",
      );
    }
    phase = "status_validated";
    console.info("[invoice.pdf]", { requestId, invoiceId, invoiceStatus, phase });

    if (!invoice.tenant?.name || !invoice.outlet?.name || !invoice.outlet?.code) {
      return pdfError(
        422,
        "OUTLET_SETTINGS_INCOMPLETE",
        "Identitas outlet belum lengkap.",
      );
    }
    phase = "outlet_loaded";
    console.info("[invoice.pdf]", { requestId, invoiceId, invoiceStatus, phase });

    if (
      !invoice.customerNameSnapshot ||
      !invoice.invoiceDate ||
      !invoice.dueDate ||
      !invoice.periodStart ||
      !invoice.periodEnd ||
      !invoice.items.length
    ) {
      return pdfError(
        422,
        "INVOICE_PDF_DATA_INCOMPLETE",
        "Data invoice belum lengkap untuk membuat PDF.",
      );
    }

    const accounts = (
      invoice.transferBankName &&
      invoice.transferAccountNumber &&
      invoice.transferAccountHolder
    ) ? [{
      bankName: invoice.transferBankName,
      accountNumber: invoice.transferAccountNumber,
      accountHolder: invoice.transferAccountHolder,
    }] : [];
    phase = "bank_accounts_loaded";
    console.info("[invoice.pdf]", {
      requestId,
      invoiceId,
      invoiceStatus,
      phase,
      bankAccountCount: accounts.length,
    });
    const pdf = await createInvoicePdf(invoice, accounts, {
      onPhase(nextPhase) {
        phase = nextPhase;
        console.info("[invoice.pdf]", {
          requestId, invoiceId, invoiceStatus, phase,
        });
      },
    });
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
    phase = "response_created";
    console.info("[invoice.pdf]", {
      requestId, invoiceId, invoiceStatus, phase,
    });
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${invoicePdfFilename(invoice)}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    const candidate = error as {
      name?: string;
      code?: string;
      message?: string;
      stack?: string;
    };
    console.error("[invoice.pdf.failed]", {
      requestId,
      invoiceId,
      invoiceStatus,
      phase,
      name: candidate?.name ?? "UnknownError",
      code: candidate?.code ?? null,
      message: candidate?.message ?? String(error),
      stack: candidate?.stack ?? null,
    });
    return pdfError(
      500,
      "INVOICE_PDF_GENERATION_FAILED",
      "PDF invoice gagal dibuat.",
    );
  }
}
