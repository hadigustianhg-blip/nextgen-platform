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
