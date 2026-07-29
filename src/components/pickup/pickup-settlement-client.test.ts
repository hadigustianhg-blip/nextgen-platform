import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("Pickup Settlement UI", () => {
  it("puts updated time first and provides the adjustment modal trigger", async () => {
    const source = await readFile(new URL("./pickup-settlement-client.tsx", import.meta.url), "utf8");
    expect(source.indexOf('"Waktu Diperbarui"')).toBeLessThan(source.indexOf('"Waybill"'));
    expect(source).toMatch(/>\s*Penyesuaian\s*<\/button>/);
    expect(source).toContain('role="dialog"');
    expect(source).toContain("Simpan Penyesuaian");
  });

  it("renders three filter-aware summary cards", async () => {
    const source = await readFile(new URL("./pickup-settlement-client.tsx", import.meta.url), "utf8");
    expect(source).toContain("Nominal Total Pickup");
    expect(source).toContain("Total Tunai");
    expect(source).toContain("Total Transfer");
    expect(source).toContain("listBody.data.summary");
    expect(source.indexOf("Ringkasan Pickup Settlement")).toBeLessThan(source.indexOf('placeholder="Cari waybill'));
  });

  it("supports page-scoped select-all, persistent IDs, filter reset and cancel", async () => {
    const source = await readFile(new URL("./pickup-settlement-client.tsx", import.meta.url), "utf8");
    expect(source).toContain("Penyesuaian Massal");
    expect(source).toContain("Pilih semua data halaman ini");
    expect(source).toContain("bulkSelected.has(row.id)");
    expect(source).toContain("rows.every((row) => next.has(row.id))");
    expect(source).toContain("Pilihan massal direset karena filter berubah.");
    expect(source).toContain("cancelBulkMode");
    expect(source).toContain("Sesuaikan (${bulkSelected.size})");
  });

  it("submits an idempotent bulk modal and refreshes table plus cards", async () => {
    const source = await readFile(new URL("./pickup-settlement-client.tsx", import.meta.url), "utf8");
    expect(source).toContain("/api/pickup/settlement/bulk-adjustment");
    expect(source).toContain("batchRequestId: bulkRequestId");
    expect(source).toContain("masterPickupIds: [...bulkSelected.keys()]");
    expect(source).toContain("Simpan Penyesuaian Massal");
    expect(source).toContain("disabled={saving}");
    expect(source).toContain("await loadData()");
  });

  it("validates transfer accounts in individual and bulk adjustments", async () => {
    const source = await readFile(new URL("./pickup-settlement-client.tsx", import.meta.url), "utf8");
    expect(source).toContain("/api/pickup/transfer-accounts");
    expect(source).toContain('<option value="">Pilih rekening</option>');
    expect(source).toContain('setAccountError("Pilih rekening transfer terlebih dahulu.")');
    expect(source).toContain('setBulkAccountError("Pilih rekening transfer terlebih dahulu.")');
    expect(source).toContain('role="alert"');
    expect(source).toContain('setAccountId(row.transferAccountId ?? "")');
    expect(source).toContain('if (method !== "TRANSFER") {');
    expect(source).toContain('setAccountId("");');
    expect(source).toContain('setBulkAccountId("");');
    expect(source).toContain("await loadData()");
  });

  it("places an operational date picker before waybill search", async () => {
    const source = await readFile(new URL("./pickup-settlement-client.tsx", import.meta.url), "utf8");
    expect(source.indexOf('aria-label="Tanggal operasional"')).toBeLessThan(source.indexOf('placeholder="Cari waybill'));
    expect(source).toContain("operationalDate,");
    expect(source).toMatch(/useState\(\s*jakartaOperationalDate\s*,?\s*\)/);
  });

  it("resets pagination, bulk selection and bulk modal when date changes", async () => {
    const source = await readFile(new URL("./pickup-settlement-client.tsx", import.meta.url), "utf8");
    expect(source).toContain("setOperationalDate(event.target.value)");
    expect(source).toContain("resetBulkSelectionForFilter();");
    expect(source).toContain("setPage(1);");
    expect(source).toContain("setBulkSelected(new Map())");
    expect(source).toContain("setBulkModalOpen(false)");
  });
});
