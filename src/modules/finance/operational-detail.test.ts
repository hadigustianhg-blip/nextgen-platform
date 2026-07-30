import { readFile } from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const db = vi.hoisted(() => ({
  operationalExpense: {
    groupBy: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
  },
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));

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
  db.operationalExpense.groupBy.mockResolvedValue([
    { category: "BBM", _count: { _all: 2 }, _sum: { amount: 500000 } },
    { category: "ATK", _count: { _all: 1 }, _sum: { amount: 100000 } },
  ]);
  db.operationalExpense.findMany.mockResolvedValue([{
    id: "expense-1", operationalDate: new Date("2026-07-30T00:00:00.000Z"),
    category: "BBM", description: "Bensin", amount: 250000,
    vehiclePlate: "B1234CD", createdBy: { name: "Admin" },
  }]);
  db.operationalExpense.count.mockResolvedValue(1);
});

describe("Operational detail finance", () => {
  it("aggregates only valid operational expenses in the inclusive scoped range", async () => {
    const result = await getOperationalDetailSummary({
      ...scope, startDate: "2026-07-01", endDate: "2026-07-30",
    });
    expect(result.summary).toEqual({
      totalAmount: 600000, totalTransactions: 3, totalCategories: 2,
    });
    expect(result.categories.map((row) => row.category)).toEqual(["BBM", "ATK"]);
    expect(db.operationalExpense.groupBy.mock.calls[0][0].where).toMatchObject({
      ...scope, status: "VALID",
      operationalDate: {
        gte: new Date("2026-07-01T00:00:00.000Z"),
        lte: new Date("2026-07-30T00:00:00.000Z"),
      },
    });
  });

  it("returns category details newest first with PIC and safe reference", async () => {
    const result = await getOperationalDetailRows({
      ...scope, startDate: "2026-07-01", endDate: "2026-07-30",
      category: "BBM", page: 1, pageSize: 25,
    });
    expect(result.data[0]).toMatchObject({
      category: "BBM", pic: "Admin", referenceNumber: "B1234CD",
    });
    expect(db.operationalExpense.findMany.mock.calls[0][0]).toMatchObject({
      skip: 0, take: 25,
      orderBy: [{ operationalDate: "desc" }, { createdAt: "desc" }, { id: "desc" }],
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

  it("uses existing cards, direct export, and records safe export audit metadata", async () => {
    const [ui, route] = await Promise.all([
      readFile(new URL("../../components/finance/operational-detail-client.tsx", import.meta.url), "utf8"),
      readFile(new URL("../../app/api/finance/operational-detail/export/route.ts", import.meta.url), "utf8"),
    ]);
    for (const component of ["PageHeader", "MetricCard", "FilterCard", "TableCard", "ModalCard"]) {
      expect(ui).toContain(component);
    }
    expect(route).toContain("Rincian_Operasional");
    expect(route).toContain('entityType: "EXPORT_OPERATIONAL_DETAIL"');
    expect(route).not.toMatch(/password|authtoken|cookie/i);
  });
});
