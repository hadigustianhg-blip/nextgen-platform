import { readFile } from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const settlement = vi.hoisted(() => ({
  listOperationalSettlement: vi.fn(),
}));
vi.mock("@/modules/operational-settlement", () => settlement);

import { canExportFinance, canReadFinance } from "./finance.authorization";
import { createWorkbook } from "./excel";
import {
  getOperationalDetailRows,
  getOperationalDetailSummary,
} from "./operational-detail.service";

const scope = { tenantId: "tenant-1", outletId: "outlet-1" };
const session = (roles: string[]) => ({
  sessionId: "s", tenantId: "tenant-1", tenantName: "Tenant",
  userId: "user-1", userName: "User", email: "user@example.test",
  outletId: "outlet-1", outletCode: "OUT001", roles,
});

beforeEach(() => {
  vi.clearAllMocks();
  settlement.listOperationalSettlement.mockResolvedValue({
    data: [
      {
        id: "expense-1", operationalDate: new Date("2026-07-30T00:00:00.000Z"),
        createdAt: new Date("2026-07-30T10:00:00.000Z"),
        category: "BBM", description: "Bensin", amount: "500000",
        vehiclePlate: "B1234CD", createdBy: "Admin", status: "VALID",
      },
      {
        id: "expense-2", operationalDate: new Date("2026-07-30T00:00:00.000Z"),
        createdAt: new Date("2026-07-30T09:00:00.000Z"),
        category: "ATK", description: "Kertas", amount: "100000",
        vehiclePlate: null, createdBy: "Admin", status: "VALID",
      },
      {
        id: "expense-void", operationalDate: new Date("2026-07-30T00:00:00.000Z"),
        createdAt: new Date("2026-07-30T08:00:00.000Z"),
        category: "BBM", description: "Void", amount: "999999",
        vehiclePlate: null, createdBy: "Admin", status: "VOID",
      },
    ],
    pagination: { page: 1, pageSize: 100, total: 3, totalPages: 1 },
  });
});

describe("Operational detail finance", () => {
  it("aggregates valid manual transactions from Operational Settlement", async () => {
    const result = await getOperationalDetailSummary({
      ...scope, startDate: "2026-07-30", endDate: "2026-07-30",
    });
    expect(result.summary).toEqual({
      totalAmount: 600000, totalTransactions: 2, totalCategories: 2,
    });
    expect(result.categories.map((row) => row.category)).toEqual(["BBM", "ATK"]);
    expect(settlement.listOperationalSettlement).toHaveBeenCalledWith({
      ...scope, operationalDate: "2026-07-30", category: undefined,
      page: 1, pageSize: 100,
    });
  });

  it("returns category details newest first with PIC and safe reference", async () => {
    const result = await getOperationalDetailRows({
      ...scope, startDate: "2026-07-30", endDate: "2026-07-30",
      category: "BBM", page: 1, pageSize: 25,
    });
    expect(result.data[0]).toMatchObject({
      category: "BBM", pic: "Admin", referenceNumber: "B1234CD",
    });
    expect(settlement.listOperationalSettlement).toHaveBeenCalledWith({
      ...scope, operationalDate: "2026-07-30", category: "BBM",
      page: 1, pageSize: 100,
    });
  });

  it("allows VIEWER read but restricts export", () => {
    expect(canReadFinance(session(["VIEWER"]))).toBe(true);
    expect(canExportFinance(session(["VIEWER"]))).toBe(false);
    for (const role of ["OWNER", "ADMIN", "OPERATIONAL"]) {
      expect(canExportFinance(session([role]))).toBe(true);
    }
  });

  it("creates a real multi-sheet XLSX buffer", async () => {
    const buffer = await createWorkbook([
      { name: "SUMMARY", headers: ["Kategori"], rows: [["BBM"]] },
      { name: "DETAIL", headers: ["Tanggal"], rows: [["2026-07-30"]] },
    ]);
    expect(buffer.subarray(0, 2).toString()).toBe("PK");
  });

  it("uses existing cards, asynchronous export UX, and safe audit metadata", async () => {
    const [ui, cashflowUi, route] = await Promise.all([
      readFile(new URL("../../components/finance/operational-detail-client.tsx", import.meta.url), "utf8"),
      readFile(new URL("../../components/finance/jfs-cashflow-client.tsx", import.meta.url), "utf8"),
      readFile(new URL("../../app/api/finance/operational-detail/export/route.ts", import.meta.url), "utf8"),
    ]);
    for (const component of ["PageHeader", "MetricCard", "FilterCard", "TableCard", "ModalCard"]) {
      expect(ui).toContain(component);
    }
    for (const client of [ui, cashflowUi]) {
      expect(client).toContain("downloadFile");
      expect(client).toContain('"Mengekspor..."');
      expect(client).toContain('"Export gagal. Silakan coba kembali."');
      expect(client).toContain("disabled={exporting}");
    }
    expect(route).toContain("Rincian_Operasional");
    expect(route).toContain('entityType: "EXPORT_OPERATIONAL_DETAIL"');
    expect(route).not.toMatch(/password|authtoken|cookie/i);
  });
});
