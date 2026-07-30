export function moneyToCents(value: string) {
  const normalized = value.trim();
  if (!/^-?\d+(\.\d{1,2})?$/.test(normalized)) return 0n;
  const negative = normalized.startsWith("-");
  const [whole, fraction = ""] = normalized.replace("-", "").split(".");
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  return negative ? -cents : cents;
}

export function sumMoney(values: string[]) {
  return values.reduce((sum, value) => sum + moneyToCents(value), 0n);
}

export function formatRupiahFromCents(cents: bigint) {
  const negative = cents < 0n;
  const absolute = negative ? -cents : cents;
  const rupiah = absolute / 100n;
  return `${negative ? "-" : ""}Rp${new Intl.NumberFormat("id-ID").format(rupiah)}`;
}

export function normalizeSellerLabel(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ");
}

export function selectableInvoiceItems<T extends { selectable: boolean }>(items: T[]) {
  return items.filter((item) => item.selectable);
}

export function buildInvoiceSourceItemsQuery(input: {
  startDate: string;
  endDate: string;
  customerKey: string;
  invoiceId?: string;
}) {
  const query = new URLSearchParams({
    startDate: input.startDate,
    endDate: input.endDate,
    customerKey: input.customerKey,
  });
  if (input.invoiceId) query.set("invoiceId", input.invoiceId);
  return query;
}

export function canSaveInvoiceDraft(input: {
  sellerSelected: boolean;
  detailLoading: boolean;
  saving: boolean;
  selectedCount: number;
  totalCents: bigint;
}) {
  return input.sellerSelected && !input.detailLoading && !input.saving &&
    input.selectedCount > 0 && input.totalCents > 0n;
}

const draftErrors: Record<string, string> = {
  INVOICE_ITEMS_REQUIRED: "Pilih minimal satu resi untuk membuat invoice.",
  SOURCE_ITEM_NOT_ELIGIBLE: "Sebagian resi sudah tidak tersedia. Muat ulang data.",
  INVOICE_ITEM_LOCKED: "Sebagian resi sedang digunakan pada draft atau invoice lain.",
  INVOICE_SOURCE_CHANGED: "Data pickup berubah. Muat ulang sebelum menyimpan.",
  DATABASE_MIGRATION_REQUIRED:
    "Penyimpanan invoice belum tersedia. Hubungi administrator.",
};

export function invoiceDraftErrorMessage(
  code: string | undefined,
  serverMessage?: string,
) {
  return (code && draftErrors[code]) || serverMessage ||
    "Invoice gagal disimpan. Silakan coba kembali.";
}

const pdfErrors: Record<string, string> = {
  INVOICE_NOT_FOUND: "Invoice tidak ditemukan.",
  INVOICE_PDF_NOT_ALLOWED: "Finalisasi invoice terlebih dahulu untuk membuat PDF.",
  INVOICE_PDF_DATA_INCOMPLETE: "Data invoice belum lengkap untuk membuat PDF.",
  OUTLET_SETTINGS_INCOMPLETE: "Identitas outlet belum lengkap.",
  INVOICE_PDF_GENERATION_FAILED: "PDF invoice gagal dibuat.",
};

export function invoicePdfErrorMessage(
  code: string | undefined,
  serverMessage?: string,
) {
  return (code && pdfErrors[code]) || serverMessage ||
    "PDF invoice gagal dibuat. Silakan coba kembali.";
}

export function isValidInvoiceWhatsapp(value: string | null | undefined) {
  const digits = (value ?? "").replace(/[^\d]/g, "");
  const normalized = digits.startsWith("0") ? `62${digits.slice(1)}` : digits;
  return /^628\d{8,11}$/.test(normalized);
}

export function invoiceWhatsappDisabledReason(input: {
  status: string;
  whatsapp: string | null | undefined;
}) {
  if (!["ISSUED", "SENT"].includes(input.status)) {
    return "Finalisasi invoice sebelum menyiapkan penagihan WhatsApp.";
  }
  if (!input.whatsapp?.trim()) return "Nomor WhatsApp customer belum diisi.";
  if (!isValidInvoiceWhatsapp(input.whatsapp)) {
    return "Nomor WhatsApp customer tidak valid.";
  }
  return "";
}

const whatsappErrors: Record<string, string> = {
  INVOICE_NOT_FOUND: "Invoice tidak ditemukan.",
  INVOICE_NOT_ISSUED: "Finalisasi invoice sebelum menyiapkan penagihan WhatsApp.",
  WHATSAPP_NUMBER_REQUIRED: "Nomor WhatsApp customer belum diisi.",
  WHATSAPP_NUMBER_INVALID: "Nomor WhatsApp customer tidak valid.",
};

export function invoiceWhatsappErrorMessage(
  code: string | undefined,
  serverMessage?: string,
) {
  return (code && whatsappErrors[code]) || serverMessage ||
    "Penagihan WhatsApp tidak dapat disiapkan.";
}
