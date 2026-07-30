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
import {
  groupCashAdvanceDetails,
  isCashAdvanceCategory,
  sortOperationalDetails,
  type OperationalDetailRow,
} from "@/components/finance/operational-detail.view";

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
      recipientName: undefined,
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

  it("groups Kasbon by normalized teamName and preserves unnamed transactions", () => {
    const rows: OperationalDetailRow[] = [
      detail("1", "2026-07-20", 150000, "Ridwan"),
      detail("2", "2026-07-21", 150000, " ridwan  "),
      detail("3", "2026-07-29", 200000, "RIDWAN"),
      detail("4", "2026-07-22", 50000, null),
    ];
    const groups = groupCashAdvanceDetails(rows);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({
      name: "Ridwan", totalAmount: 500000, transactionCount: 3,
    });
    expect(groups[0].transactions.map((row) => row.date)).toEqual([
      "2026-07-29", "2026-07-21", "2026-07-20",
    ]);
    expect(groups[1]).toMatchObject({
      name: "Tanpa Nama", totalAmount: 50000, transactionCount: 1,
    });
    expect(groups.reduce((sum, group) => sum + group.totalAmount, 0)).toBe(550000);
    expect(groups.reduce((sum, group) => sum + group.transactionCount, 0)).toBe(4);
  });

  it("recognizes Kasbon case-insensitively and leaves other categories ungrouped", () => {
    expect(isCashAdvanceCategory("  kAsBoN ")).toBe(true);
    expect(isCashAdvanceCategory("BBM")).toBe(false);
    const rows = [
      detail("old", "2026-07-20", 100000, "A"),
      detail("new", "2026-07-29", 200000, "A"),
    ];
    expect(sortOperationalDetails(rows).map((row) => row.id)).toEqual(["new", "old"]);
  });

  it("uses a responsive master-detail layout without the old desktop modal", async () => {
    const [ui, cashflowUi, route] = await Promise.all([
      readFile(new URL("../../components/finance/operational-detail-client.tsx", import.meta.url), "utf8"),
      readFile(new URL("../../components/finance/jfs-cashflow-client.tsx", import.meta.url), "utf8"),
      readFile(new URL("../../app/api/finance/operational-detail/export/route.ts", import.meta.url), "utf8"),
    ]);
    for (const component of ["PageHeader", "MetricCard", "FilterCard", "TableCard", "SectionCard"]) {
      expect(ui).toContain(component);
    }
    expect(ui).toContain("lg:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]");
    expect(ui).toContain("md:grid-cols-[minmax(0,3fr)_minmax(280px,2fr)]");
    expect(ui).toContain('data-testid="operational-master-detail"');
    expect(ui).toContain("md:sticky md:top-24");
    expect(ui).not.toContain("ModalCard");
    expect(ui).not.toContain(">Rincian</button>");
    expect(ui).toContain('aria-current={active ? "true" : undefined}');
    expect(ui).toContain("border-l-blue-600");
    expect(ui).toContain("setSelected(category)");
    expect(ui).toContain("payload.categories[0]?.category");
    expect(ui).toContain("await loadDetail(firstCategory");
    expect(ui).toContain("detailCache.current.clear()");
    expect(ui).toContain("inFlight.current.has(cacheKey)");
    expect(ui).toContain('data-testid="detail-loading"');
    expect(ui).toContain("Rincian kategori tidak dapat dimuat.");
    expect(ui).toContain("Coba Lagi");
    expect(ui).toContain("Belum ada kategori yang dipilih.");
    expect(ui).toContain("Belum ada data kategori pada rentang ini.");
    expect(ui).toContain("aria-expanded={expanded}");
    expect(ui).toContain("toggleGroup(group.key)");
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

function detail(
  id: string,
  date: string,
  amount: number,
  recipientName: string | null,
): OperationalDetailRow {
  return {
    id, date, amount, recipientName, category: "Kasbon",
    description: "Kasbon Operasional", pic: "Admin", referenceNumber: id,
  };
}
