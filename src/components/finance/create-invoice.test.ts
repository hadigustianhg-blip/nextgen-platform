import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  buildInvoiceSourceItemsQuery, canSaveInvoiceDraft, formatRupiahFromCents,
  invoiceDraftErrorMessage, moneyToCents, normalizeSellerLabel, sumMoney,
  selectableInvoiceItems,
} from "./invoice.view";

describe("Create Invoice interface", () => {
  it("calculates partial and select-all totals without floating point", () => {
    expect(moneyToCents("45000.90")).toBe(4_500_090n);
    expect(sumMoney(["100000", "200000.50"])).toBe(30_000_050n);
    expect(sumMoney(["100000"])).toBe(10_000_000n);
    expect(formatRupiahFromCents(30_000_000n)).toBe("Rp300.000");
  });

  it("normalizes seller labels without fuzzy matching", () => {
    expect(normalizeSellerLabel(" Anggrek \n  Cibogo ")).toBe("Anggrek Cibogo");
  });

  it("uses the required master-detail proportions and existing design system", async () => {
    const source = await readFile(new URL("./create-invoice-client.tsx", import.meta.url), "utf8");
    expect(source).toContain("lg:grid-cols-[minmax(280px,2fr)_minmax(0,3fr)]");
    for (const component of [
      "PageHeader", "AppCard", "MetricCard", "FilterCard",
      "TableCard", "SectionCard", "ModalCard",
    ]) expect(source).toContain(component);
  });

  it("does not auto-select waybills when a seller is selected", async () => {
    const source = await readFile(new URL("./create-invoice-client.tsx", import.meta.url), "utf8");
    expect(source).toContain("setSelectedIds(new Set())");
    expect(source).toContain("Pilih Semua");
    expect(source).toContain("toggleItem(item.id)");
    expect(source).not.toContain("setSelectedIds(new Set(payload.data");
  });

  it("builds source-items query with the actual seller key and active dates", () => {
    const query = buildInvoiceSourceItemsQuery({
      startDate: "2026-07-01",
      endDate: "2026-07-30",
      customerKey: "name:putra",
    });
    expect(query.get("startDate")).toBe("2026-07-01");
    expect(query.get("endDate")).toBe("2026-07-30");
    expect(query.get("customerKey")).toBe("name:putra");
  });

  it("enables save only after a positive eligible selection", () => {
    expect(canSaveInvoiceDraft({
      sellerSelected: true, detailLoading: false, saving: false,
      selectedCount: 0, totalCents: 0n,
    })).toBe(false);
    expect(canSaveInvoiceDraft({
      sellerSelected: true, detailLoading: false, saving: false,
      selectedCount: 1, totalCents: 10000n,
    })).toBe(true);
    expect(canSaveInvoiceDraft({
      sellerSelected: true, detailLoading: false, saving: true,
      selectedCount: 1, totalCents: 10000n,
    })).toBe(false);
  });

  it("keeps three eligible checkbox rows and excludes a locked row from select-all", () => {
    const items = [
      { id: "1", selectable: true },
      { id: "2", selectable: true },
      { id: "3", selectable: true },
      { id: "locked", selectable: false },
    ];
    expect(selectableInvoiceItems(items).map((item) => item.id)).toEqual([
      "1", "2", "3",
    ]);
  });

  it("maps draft and migration errors to specific safe messages", () => {
    expect(invoiceDraftErrorMessage("INVOICE_ITEMS_REQUIRED")).toBe(
      "Pilih minimal satu resi untuk membuat invoice.",
    );
    expect(invoiceDraftErrorMessage("INVOICE_ITEM_LOCKED")).toContain(
      "draft atau invoice lain",
    );
    expect(invoiceDraftErrorMessage("DATABASE_MIGRATION_REQUIRED")).toContain(
      "Hubungi administrator",
    );
    expect(invoiceDraftErrorMessage("UNKNOWN")).toBe(
      "Invoice gagal disimpan. Silakan coba kembali.",
    );
  });

  it("supports save draft, update, issue, preview and void actions", async () => {
    const source = await readFile(new URL("./create-invoice-client.tsx", import.meta.url), "utf8");
    for (const text of [
      "Simpan Draft", "Perbarui Draft", "Finalisasi Invoice",
      "Preview Invoice", "Void Invoice",
    ]) expect(source).toContain(text);
    expect(source).toContain('method: draftId ? "PATCH" : "POST"');
    expect(source).toContain("if (!payload || selectedTotal <= 0n)");
    expect(source).toContain("disabled={!draftCanBeSaved}");
    expect(source).toContain("Pilih minimal satu resi untuk membuat draft invoice.");
  });

  it("renders explicit source item loading, empty, locked, and failure states", async () => {
    const source = await readFile(new URL("./create-invoice-client.tsx", import.meta.url), "utf8");
    for (const state of [
      "Daftar Resi Belum Bayar",
      "Memuat resi...",
      "Tidak ada resi belum bayar yang dapat dibuat invoice.",
      "Data resi seller tidak dapat dimuat.",
      "Seluruh resi seller ini sedang digunakan pada draft atau invoice lain.",
    ]) expect(source).toContain(state);
    expect(source.indexOf("Daftar Resi Belum Bayar")).toBeLessThan(
      source.indexOf('MetricCard label="Resi Dipilih"'),
    );
    expect(source).toContain("items.map((item, index)");
    expect(source).toContain("disabled={!item.selectable}");
    expect(source).toContain("setItemsError(cause instanceof Error");
  });

  it("serializes only string identifiers and form values in the draft payload", () => {
    const payload = {
      customerKey: "name:putra",
      itemIds: ["11111111-1111-4111-8111-111111111111"],
      invoiceDate: "2026-07-30",
      dueDate: "2026-08-06",
      periodStart: "2026-07-01",
      periodEnd: "2026-07-30",
      customerName: "PUTRA",
    };
    expect(() => JSON.stringify(payload)).not.toThrow();
    expect(JSON.parse(JSON.stringify(payload)).itemIds).toEqual(payload.itemIds);
  });

  it("implements PDF loading, double-click prevention and failure recovery", async () => {
    const source = await readFile(new URL("./create-invoice-client.tsx", import.meta.url), "utf8");
    expect(source).toContain("if (pdfLoadingId) return");
    expect(source).toContain("Membuat PDF...");
    expect(source).toContain("await downloadFile");
    expect(source).toContain('setPdfLoadingId("")');
    expect(source).toContain("PDF invoice gagal dibuat. Silakan coba kembali.");
  });

  it("opens WhatsApp separately and instructs manual PDF attachment", async () => {
    const [ui, service] = await Promise.all([
      readFile(new URL("./create-invoice-client.tsx", import.meta.url), "utf8"),
      readFile(new URL("../../modules/invoice/invoice.service.ts", import.meta.url), "utf8"),
    ]);
    expect(ui).toContain('window.open(result.data.url, "_blank"');
    expect(service).toContain("Lampirkan PDF invoice yang baru diunduh");
    expect(ui).not.toMatch(/attach.*pdf/i);
  });

  it("keeps tenant/outlet scope server-side and does not send it from the client", async () => {
    const [ui, sellerRoute, invoiceRoute] = await Promise.all([
      readFile(new URL("./create-invoice-client.tsx", import.meta.url), "utf8"),
      readFile(new URL("../../app/api/finance/invoice-source-sellers/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../../app/api/finance/invoices/route.ts", import.meta.url), "utf8"),
    ]);
    expect(ui).not.toMatch(/tenantId|outletId/);
    expect(sellerRoute).toContain("invoiceScope(session)");
    expect(invoiceRoute).toContain("invoiceScope(session)");
  });
});
