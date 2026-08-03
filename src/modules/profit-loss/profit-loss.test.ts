import { readFile } from "node:fs/promises";
import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  jfs: vi.fn(), pickups: vi.fn(), expenses: vi.fn(), manual: vi.fn(),
  adjustments: vi.fn(), outlet: vi.fn(), salary: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: {
  jfsCashflowRecord: { findMany: mocks.jfs },
  masterPickup: { findMany: mocks.pickups },
  operationalExpense: { findMany: mocks.expenses },
  profitLossManualEntry: { findMany: mocks.manual },
  profitLossAdjustment: { findMany: mocks.adjustments },
  outlet: { findFirst: mocks.outlet },
} }));
vi.mock("@/modules/salary/salary.preview.service", () => ({
  getSalaryMonthlyPreview: mocks.salary,
}));

import { getProfitLoss } from "./profit-loss.service";
import { canManageProfitLoss, canReadProfitLoss } from "./profit-loss.authorization";

const d = (value: number | string) => new Prisma.Decimal(value);
const day = (value: string) => new Date(`${value}T00:00:00.000Z`);
const query = { startDate: "2026-08-01", endDate: "2026-08-02", search: "", category: "", sort: "newest" as const, page: 1, pageSize: 25 };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.jfs.mockResolvedValue([
    { id: "j1", businessDate: day("2026-08-01"), direction: "income", transactionType: "Income JFS", category: "Main", amount: d(100), sourceReference: "SUM001A" },
    { id: "j2", businessDate: day("2026-08-01"), direction: "expense", transactionType: "Expense JFS", category: "Main", amount: d(20), sourceReference: "SUM001A" },
  ]);
  mocks.pickups.mockResolvedValue([
    { id: "p1", operationalDate: day("2026-08-01"), waybillNo: "WB-1", freightAmount: d(50), rawPickup: { settlementRaw: " DFOD " } },
    { id: "p2", operationalDate: day("2026-08-01"), waybillNo: "wb-1", freightAmount: d(50), rawPickup: { settlementRaw: "DFOD" } },
    { id: "p3", operationalDate: day("2026-08-01"), waybillNo: "WB-2", freightAmount: d(30), rawPickup: { settlementRaw: "Tunai" } },
    { id: "p4", operationalDate: day("2026-08-01"), waybillNo: "WB-3", freightAmount: d(100), rawPickup: { settlementRaw: "Bulanan" } },
  ]);
  mocks.expenses.mockResolvedValue([
    { operationalDate: day("2026-08-01"), category: "BBM", amount: d(40) },
    { operationalDate: day("2026-08-01"), category: "Kasbon", amount: d(10) },
  ]);
  mocks.manual.mockResolvedValue([
    { id: "m1", entryDate: day("2026-08-01"), entryType: "INCOME", category: "Manual", description: "Income manual", amount: d(5), reference: null },
    { id: "m2", entryDate: day("2026-08-01"), entryType: "EXPENSE", category: "Manual", description: "Expense manual", amount: d(6), reference: null },
  ]);
  mocks.adjustments.mockResolvedValue([
    { id: "a1", adjustmentDate: day("2026-08-01"), direction: "INCOME", category: "Koreksi", description: "Income adjustment", amount: d(2), reason: "Audit" },
    { id: "a2", adjustmentDate: day("2026-08-01"), direction: "EXPENSE", category: "Koreksi", description: "Expense adjustment", amount: d(3), reason: "Audit" },
  ]);
  mocks.salary.mockResolvedValue({
    summary: { estimatedNetTotal: "100", kasbonDeductionTotal: "0" },
    data: [{ name: "MUST NOT LEAK" }],
  });
  mocks.outlet.mockResolvedValue({ code: "SUM001A" });
});

describe("Profit Loss canonical aggregator", () => {
  it("combines read-only sources without duplicate pickup, Bulanan, or employee details", async () => {
    const result = await getProfitLoss({ tenantId: "tenant-1", outletId: "outlet-1" }, query);
    expect(result.summary).toMatchObject({
      jfsIncome: "100", jfsExpense: "20", pickupDfod: "50",
      pickupCash: "30", operational: "50", grossSalary: "100",
      kasbon: "10", salaryNet: "90", totalIncome: "187",
      totalExpense: "169", profitLoss: "18",
    });
    expect(result.transactions.filter((row) => row.description === "Total Operasional Harian")).toHaveLength(1);
    expect(result.transactions.some((row) => row.description.includes("BBM"))).toBe(false);
    expect(result.transactions.some((row) => row.category.includes("Bulanan"))).toBe(false);
    expect(JSON.stringify(result)).not.toContain("MUST NOT LEAK");
    expect(result.daily).toHaveLength(2);
    expect(result.daily[1]).toMatchObject({ date: "2026-08-02", grossSalary: "100", kasbon: "10", salaryNet: "90" });
    expect(mocks.salary).toHaveBeenCalledTimes(1);
    expect(mocks.outlet).toHaveBeenCalledWith({
      where: { tenantId: "tenant-1", id: "outlet-1" },
      select: { code: true },
    });
  });

  it("keeps source rows read-only and exposes only manual/adjustment as editable", async () => {
    const result = await getProfitLoss({ tenantId: "tenant-1", outletId: "outlet-1" }, query);
    expect(result.transactions.filter((row) => ["JFS", "NEXTGEN_SYSTEM"].includes(row.source)).every((row) => !row.isEditable)).toBe(true);
    expect(result.transactions.filter((row) => ["MANUAL", "ADJUSTMENT"].includes(row.source)).every((row) => row.isEditable)).toBe(true);
  });

  it("uses Finance read permission and Owner/Admin write permission", () => {
    const session = (roles: string[]) => ({
      sessionId: "s", tenantId: "t", tenantName: "Tenant", outletId: "o",
      outletCode: "OUT", userId: "u", userName: "User", email: "u@test.dev",
      roles,
    });
    expect(canReadProfitLoss(session(["VIEWER"]))).toBe(true);
    expect(canManageProfitLoss(session(["OWNER"]))).toBe(true);
    expect(canManageProfitLoss(session(["ADMIN"]))).toBe(true);
    expect(canManageProfitLoss(session(["OPERATIONAL"]))).toBe(false);
  });

  it("keeps source modules unchanged and exports four sheets", async () => {
    const [service, exportRoute] = await Promise.all([
      readFile(new URL("./profit-loss.service.ts", import.meta.url), "utf8"),
      readFile(new URL("../../app/api/finance/profit-loss/export/route.ts", import.meta.url), "utf8"),
    ]);
    expect(service).not.toMatch(/masterPickup\.(update|create|upsert|delete)/);
    expect(service).not.toMatch(/operationalExpense\.(update|create|upsert|delete)/);
    expect(service).not.toMatch(/salary(Closing|Snapshot).*\.(update|create|upsert|delete)/);
    for (const sheet of ["SUMMARY", "DAILY PROFIT LOSS", "TRANSACTIONS", "SOURCE SUMMARY"]) {
      expect(exportRoute).toContain(`name: "${sheet}"`);
    }
    expect(exportRoute).not.toContain("employeeName");
  });
});
