import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const sourcePromise = readFile(
  new URL("./profit-loss-client.tsx", import.meta.url),
  "utf8",
);

describe("Profit Loss split transaction presentation", () => {
  it("renders separate income and expense sections without the redundant type column", async () => {
    const source = await sourcePromise;
    expect(source).toContain('direction="INCOME"');
    expect(source).toContain('direction="EXPENSE"');
    expect(source).toContain("Rincian ${label}");
    expect(source).not.toContain('>Jenis</th>');
    expect(source).not.toContain("Semua Jenis");
  });

  it("uses independent filters and pagination for both tables", async () => {
    const source = await sourcePromise;
    expect(source).toContain("incomeFilters");
    expect(source).toContain("expenseFilters");
    expect(source).toContain("setIncomeFilters");
    expect(source).toContain("setExpenseFilters");
    expect(source).toContain('buildTableQuery(\n    startDate, endDate, "INCOME"');
    expect(source).toContain('buildTableQuery(\n    startDate, endDate, "EXPENSE"');
  });

  it("preselects the correct direction for manual and adjustment actions", async () => {
    const source = await sourcePromise;
    for (const action of [
      'openCreate("manual", "INCOME")',
      'openCreate("adjustment", "INCOME")',
      'openCreate("manual", "EXPENSE")',
      'openCreate("adjustment", "EXPENSE")',
    ]) expect(source).toContain(action);
  });

  it("shows period-aggregated rows without a per-date column", async () => {
    const source = await sourcePromise;
    expect(source).toContain("row.isEditable && canManage");
    expect(source).toContain("TOTAL {label.toUpperCase()} PERIODE TAMPIL");
    expect(source).toContain("Tidak ada data {label.toLowerCase()} pada periode dan filter ini.");
    expect(source).toContain("visibleTotal");
    expect(source).not.toContain('>Tanggal</th>');
    expect(source).toContain('pageSize: "100"');
    expect(source).toContain("Nominal Terbesar");
    expect(source).toContain("Nominal Terkecil");
  });

  it("keeps metrics, chart, and period-only Excel export unchanged", async () => {
    const source = await sourcePromise;
    for (const label of [
      "Total Pemasukan", "Total Pengeluaran", "Margin Profit",
      "Pemasukan JFS", "Pengeluaran JFS", "Salary Setelah Kasbon",
    ]) expect(source).toContain(label);
    expect(source).toContain("<ProfitLossChart rows={result.daily}/>");
    expect(source).toContain("/api/finance/profit-loss/export?");
    expect(source).toContain("const exportQuery");
  });
});
