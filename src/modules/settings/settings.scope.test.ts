import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  tenant: { findUnique: vi.fn() },
  outlet: { findFirst: vi.fn(), count: vi.fn() },
  outletBankAccount: { findMany: vi.fn() },
  financialCategory: { findMany: vi.fn() },
  syncRun: { findMany: vi.fn() },
  jfsCashflowSyncRun: { findMany: vi.fn() },
  salaryPublicationShare: { count: vi.fn() },
  salaryEmployee: { findMany: vi.fn() },
  auditLog: { findMany: vi.fn() },
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: db }));

import {
  getBusinessProfile,
  getIntegrationStatus,
  listBankAccounts,
  listFinancialCategories,
  listAvailableSalaryEmployees,
} from "./settings.service";

const unsafeScope = {
  tenantId: "tenant-1",
  outletId: "outlet-1",
  userId: "user-1",
  extraProperty: "ignored",
};
const cleanScope = { tenantId: "tenant-1", outletId: "outlet-1" };

describe("Settings explicit Prisma scope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.outletBankAccount.findMany.mockResolvedValue([]);
    db.financialCategory.findMany.mockResolvedValue([]);
    db.outlet.findFirst.mockResolvedValue({ id: "outlet-1", code: "OUT001" });
    db.syncRun.findMany.mockResolvedValue([]);
    db.jfsCashflowSyncRun.findMany.mockResolvedValue([]);
    db.salaryPublicationShare.count.mockResolvedValue(0);
    db.salaryEmployee.findMany.mockResolvedValue([]);
    db.auditLog.findMany.mockResolvedValue([]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status: 200 }));
  });

  it("strips userId and extra properties from Finance queries", async () => {
    await listBankAccounts(unsafeScope);
    await listFinancialCategories(unsafeScope);
    expect(db.outletBankAccount.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: cleanScope }));
    expect(db.financialCategory.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: cleanScope }));
  });

  it("strips userId from every Integration query", async () => {
    await getIntegrationStatus(unsafeScope);
    for (const [input] of db.syncRun.findMany.mock.calls) expect(input.where).toEqual(cleanScope);
    for (const [input] of db.jfsCashflowSyncRun.findMany.mock.calls) expect(input.where).toEqual(cleanScope);
    expect(db.salaryPublicationShare.count.mock.calls[0][0].where).toMatchObject(cleanScope);
    expect(db.salaryPublicationShare.count.mock.calls[0][0].where).not.toHaveProperty("extraProperty");
    expect(db.auditLog.findMany.mock.calls[0][0].where.tenantId).toBe("tenant-1");
    expect(db.auditLog.findMany.mock.calls[0][0].where.AND[0]).toEqual({ OR: [{ outletId: "outlet-1" }, { outletId: null }] });
  });

  it("uses Outlet.id with tenant scope", async () => {
    db.tenant.findUnique.mockResolvedValue({ id: "tenant-1" });
    db.outlet.findFirst.mockResolvedValue({ id: "outlet-1" });
    await getBusinessProfile(unsafeScope);
    expect(db.outlet.findFirst.mock.calls[0][0].where).toEqual({ tenantId: "tenant-1", id: "outlet-1" });
  });

  it("lists only active unassigned SalaryEmployee records in the scoped outlet", async () => {
    await listAvailableSalaryEmployees(unsafeScope);
    expect(db.salaryEmployee.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        tenantId: "tenant-1",
        outletId: "outlet-1",
        status: "ACTIVE",
        teamMemberships: { none: { status: "ACTIVE" } },
      },
    }));
  });
});
