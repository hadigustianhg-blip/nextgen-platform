import { NextResponse } from "next/server";
import { InvoiceServiceError } from "./invoice.service";

const safeMessages: Record<string, string> = {
  INVOICE_ITEMS_REQUIRED: "Pilih minimal satu resi untuk membuat invoice.",
  SOURCE_ITEM_NOT_ELIGIBLE: "Sebagian resi sudah tidak tersedia. Muat ulang data.",
  SOURCE_ALREADY_PAID: "Sebagian resi sudah dibayar. Muat ulang data sebelum finalisasi.",
  INVOICE_ITEM_LOCKED: "Sebagian resi sedang digunakan pada draft atau invoice lain.",
  SOURCE_SELLER_MISMATCH: "Resi yang dipilih bukan milik seller yang sama.",
  INVOICE_SOURCE_CHANGED: "Data pickup berubah. Muat ulang sebelum menyimpan.",
  DATABASE_MIGRATION_REQUIRED: "Penyimpanan invoice belum tersedia. Hubungi administrator.",
  INVOICE_NOT_FOUND: "Invoice tidak ditemukan.",
  INVOICE_LOCKED: "Invoice yang sudah diterbitkan tidak dapat diubah.",
  INVOICE_WAYBILL_NOT_AVAILABLE: "Nomor resi invoice tidak tersedia.",
  INVALID_WAYBILL_NO: "Nomor resi invoice tidak valid.",
  SENDER_DETAIL_NOT_FOUND: "Detail penerima tidak ditemukan di JFS.",
  JFS_MIDDLEWARE_NOT_CONFIGURED: "Konfigurasi middleware JFS belum tersedia.",
  JFS_AUTH_NOT_CONFIGURED: "Autentikasi middleware JFS belum tersedia.",
  JFS_AUTH_EXPIRED: "Sesi JFS telah berakhir. Perbarui token middleware.",
  JFS_UPSTREAM_TIMEOUT: "JFS terlalu lama merespons. Silakan coba kembali.",
  JFS_UPSTREAM_ERROR: "Gagal mengambil detail penerima.",
  INVOICE_CONFLICT: "Invoice sedang diproses oleh pengguna lain. Silakan coba kembali.",
  INVOICE_NOT_READY: "Invoice belum siap untuk proses ini.",
  INVOICE_NOT_ISSUED: "Finalisasi invoice sebelum menyiapkan penagihan WhatsApp.",
  WHATSAPP_NUMBER_REQUIRED: "Nomor WhatsApp customer belum diisi.",
  WHATSAPP_NUMBER_INVALID: "Nomor WhatsApp customer tidak valid.",
  WHATSAPP_INVALID: "Nomor WhatsApp customer belum valid.",
  INVOICE_CREATE_FAILED: "Invoice gagal disimpan.",
  INVOICE_SAVE_FAILED: "Invoice gagal disimpan.",
  INVOICE_ISSUE_FAILED: "Invoice gagal difinalisasi.",
};

export function invoiceErrorResponse(error: unknown) {
  const known = error instanceof InvoiceServiceError
    ? error
    : new InvoiceServiceError("INVOICE_SAVE_FAILED", 500);
  if (known.code === "INVOICE_CREATE_FAILED") {
    return NextResponse.json({
      success: false,
      code: known.code,
      message: safeMessages[known.code],
    }, { status: known.status });
  }
  return NextResponse.json({
    error: {
      code: known.code,
      message: safeMessages[known.code] || "Proses invoice gagal.",
      ...(known.details?.length ? { waybills: known.details } : {}),
    },
  }, { status: known.status });
}

export function migrationRequiredResponse() {
  return NextResponse.json({
    success: false,
    code: "DATABASE_MIGRATION_REQUIRED",
    message: safeMessages.DATABASE_MIGRATION_REQUIRED,
  }, { status: 503 });
}
