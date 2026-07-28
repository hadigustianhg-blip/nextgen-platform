import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("Pickup Settlement UI", () => {
  it("puts updated time first and provides the adjustment modal trigger", async () => {
    const source = await readFile(new URL("./pickup-settlement-client.tsx", import.meta.url), "utf8");
    const headers = source.match(/\["Waktu Diperbarui"[\s\S]*?"Aksi"\]/)?.[0] ?? "";
    expect(headers.indexOf("Waktu Diperbarui")).toBeLessThan(headers.indexOf("Waybill"));
    expect(source).toContain(">Penyesuaian</button>");
    expect(source).toContain('role="dialog"');
    expect(source).toContain("Simpan Penyesuaian");
  });

  it("renders three filter-aware summary cards", async () => {
    const source = await readFile(new URL("./pickup-settlement-client.tsx", import.meta.url), "utf8");
    expect(source).toContain("Nominal Total Pickup");
    expect(source).toContain("Total Tunai");
    expect(source).toContain("Total Transfer");
    expect(source).toContain("listBody.data.summary");
    expect(source.indexOf("Ringkasan Pickup Settlement")).toBeLessThan(
      source.indexOf('placeholder="Cari waybill'),
    );
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
});
