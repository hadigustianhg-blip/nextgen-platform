import { NextResponse } from "next/server";
import { InvoiceServiceError } from "./invoice.service";

const safeMessages: Record<string, string> = {
  SOURCE_ITEM_INVALID: "Sebagian resi tidak lagi tersedia.",
  SOURCE_ALREADY_PAID: "Sebagian resi sudah dibayar. Muat ulang data sebelum finalisasi.",
  SOURCE_ALREADY_IN_INVOICE: "Sebagian resi sudah digunakan pada invoice lain.",
  SOURCE_SELLER_MISMATCH: "Resi yang dipilih bukan milik seller yang sama.",
  SOURCE_CHANGED: "Data settlement berubah. Tinjau ulang draft sebelum finalisasi.",
  INVOICE_NOT_FOUND: "Invoice tidak ditemukan.",
  INVOICE_LOCKED: "Invoice yang sudah diterbitkan tidak dapat diubah.",
  INVOICE_CONFLICT: "Invoice sedang diproses oleh pengguna lain. Silakan coba kembali.",
  INVOICE_NOT_READY: "Invoice belum siap untuk proses ini.",
  WHATSAPP_INVALID: "Nomor WhatsApp customer belum valid.",
  INVOICE_SAVE_FAILED: "Invoice gagal disimpan.",
  INVOICE_ISSUE_FAILED: "Invoice gagal difinalisasi.",
};

export function invoiceErrorResponse(error: unknown) {
  const known = error instanceof InvoiceServiceError
    ? error
    : new InvoiceServiceError("INVOICE_SAVE_FAILED", 500);
  return NextResponse.json({
    error: {
      code: known.code,
      message: safeMessages[known.code] || "Proses invoice gagal.",
      ...(known.details?.length ? { waybills: known.details } : {}),
    },
  }, { status: known.status });
}
