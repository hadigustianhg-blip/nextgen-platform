import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import {
  salaryClosingVoidSchema,
  salaryKasbonAllocationSchema,
} from ".";

describe("Salary Sprint 2 schema, migration and UI contracts", () => {
  it("adds only additive calculation, alias, source and Kasbon structures", async () => {
    const migration = await readFile(
      new URL(
        "../../../prisma/migrations/20260731000300_add_salary_calculation_review/migration.sql",
        import.meta.url,
      ),
      "utf8",
    );
    for (const table of [
      "SalaryEmployeeAlias",
      "SalaryClosingSourceRecord",
      "SalaryKasbonAllocation",
    ]) expect(migration).toContain(`CREATE TABLE "${table}"`);
    expect(migration).toContain("SalaryClosingSourceRecord_active_source_key");
    expect(migration).toContain('WHERE "isActive" = true');
    expect(migration).toContain("SalaryKasbonAllocation_amount_check");
    expect(migration).not.toMatch(/\b(DROP|TRUNCATE|DELETE FROM)\b/i);
  });

  it("validates void reasons and positive Kasbon allocation amounts", () => {
    expect(salaryClosingVoidSchema.safeParse({ reason: "x" }).success)
      .toBe(false);
    expect(salaryClosingVoidSchema.safeParse({
      reason: "Closing salah periode",
    }).success).toBe(true);
    expect(salaryKasbonAllocationSchema.safeParse({
      operationalExpenseId: "11111111-1111-4111-8111-111111111111",
      amount: 0,
    }).success).toBe(false);
  });

  it("provides responsive review, custom confirmation and safe recap UI", async () => {
    const [detail, list, recap] = await Promise.all([
      readFile(
        new URL(
          "../../components/finance/salary-closing-detail-client.tsx",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL(
          "../../components/finance/salary-closing-client.tsx",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL(
          "../../components/finance/salary-recap-empty.tsx",
          import.meta.url,
        ),
        "utf8",
      ),
    ]);
    for (const text of [
      "Generate Salary",
      "Hitung Ulang",
      "Proses ke Salary Recap",
      "Data tidak terpetakan",
      "Tambah Penghasilan",
      "Tambah Potongan",
      "Atur Kasbon",
      "Rincian Perhitungan",
      "Salary sudah diproses dan dikunci.",
    ]) expect([detail, recap].join("\n")).toContain(text);
    expect(list).toContain("Dalam Review");
    expect(list).toContain("Masuk Rekap");
    expect(detail).toContain("overflow-x-auto");
    expect(detail).toContain("max-h-[92vh]");
    expect(recap).toContain("PROCESSED");
    expect(recap).toContain("PAID");
    const visibleUi = [detail, list, recap].join("\n");
    expect(visibleUi).not.toMatch(
      /\b(RawPickup|RawDispatch|staffNameRaw|courierNameRaw|deliveryStatusRaw)\b/,
    );
    expect(visibleUi).not.toMatch(
      /\bwindow\.(alert|prompt|confirm)\s*\(/,
    );
  });

  it("keeps calculation constants out of production UI defaults", async () => {
    const detail = await readFile(
      new URL(
        "../../components/finance/salary-closing-detail-client.tsx",
        import.meta.url,
      ),
      "utf8",
    );
    for (const amount of ["1800", "20000", "50000", "80000", "75000"]) {
      expect(detail).not.toContain(amount);
    }
  });
});
