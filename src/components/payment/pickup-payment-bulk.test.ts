import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./pickup-payment-client.tsx", import.meta.url), "utf8");

describe("Pickup Payment bulk adjustment UI", () => {
  it("shows permission-gated selection controls with first-column checkboxes", () => {
    expect(source).toContain("{canManage && (");
    expect(source).toContain("Penyesuaian Massal");
    expect(source).toContain("Batal Penyesuaian");
    expect(source).toContain("bulkMode && <th");
    expect(source.indexOf("bulkMode && <th")).toBeLessThan(source.indexOf('"Tanggal Pickup"'));
    expect(source).toContain("element.indeterminate");
    expect(source).toContain("disabled={!eligible(row)}");
    expect(source).toContain("eligiblePageRows.forEach");
  });

  it("opens a responsive preview and submits exactly once while loading", () => {
    expect(source).toContain("Penyesuaian Massal Pickup Payment");
    expect(source).toContain("Setiap data akan dibayar penuh sesuai outstanding masing-masing.");
    expect(source).toContain("Outstanding Lama");
    expect(source).toContain("Belum Dibayar Baru");
    expect(source).toContain("if (bulkSaving || bulkSelected.size === 0) return");
    expect(source).toContain('disabled={bulkSaving}');
    expect(source).toContain("overflow-x-auto");
  });

  it("cleans selection and refetches table plus summary without resetting filters", () => {
    expect(source).toContain('fetch("/api/pickup-payment/bulk-adjustment"');
    expect(source).toContain("setBulkModalOpen(false)");
    expect(source).toContain("setBulkMode(false)");
    expect(source).toContain("setBulkSelected(new Map())");
    expect(source).toContain("await load()");
    expect(source).toContain("Penyesuaian massal berhasil diterapkan pada");
    expect(source).not.toContain("setFilters({ pickupDate:");
  });
});
