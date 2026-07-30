import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  formatRupiahFromCents, moneyToCents, normalizeSellerLabel, sumMoney,
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

  it("supports save draft, update, issue, preview and void actions", async () => {
    const source = await readFile(new URL("./create-invoice-client.tsx", import.meta.url), "utf8");
    for (const text of [
      "Simpan Draft", "Perbarui Draft", "Finalisasi Invoice",
      "Preview Invoice", "Void Invoice",
    ]) expect(source).toContain(text);
    expect(source).toContain('method: draftId ? "PATCH" : "POST"');
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
