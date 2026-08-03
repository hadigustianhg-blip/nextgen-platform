import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  tenant: { findUnique: vi.fn() },
  outlet: { findFirst: vi.fn(), count: vi.fn() },
  outletBankAccount: { findMany: vi.fn() },
  financialCategory: { findMany: vi.fn() },
  syncRun: { findFirst: vi.fn(), aggregate: vi.fn() },
  jfsCashflowSyncRun: { findFirst: vi.fn() },
  salaryPublicationShare: { count: vi.fn() },
  salaryEmployee: { findMany: vi.fn() },
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
    db.syncRun.findFirst.mockResolvedValue(null);
    db.jfsCashflowSyncRun.findFirst.mockResolvedValue(null);
    db.salaryPublicationShare.count.mockResolvedValue(0);
    db.salaryEmployee.findMany.mockResolvedValue([]);
  });

  it("strips userId and extra properties from Finance queries", async () => {
    await listBankAccounts(unsafeScope);
    await listFinancialCategories(unsafeScope);
    expect(db.outletBankAccount.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: cleanScope }));
    expect(db.financialCategory.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: cleanScope }));
  });

  it("strips userId from every Integration query", async () => {
    await getIntegrationStatus(unsafeScope);
    for (const [input] of db.syncRun.findFirst.mock.calls) expect(input.where).not.toHaveProperty("userId");
    for (const [input] of db.jfsCashflowSyncRun.findFirst.mock.calls) expect(input.where).not.toHaveProperty("userId");
    expect(db.salaryPublicationShare.count.mock.calls[0][0].where).toMatchObject(cleanScope);
    expect(db.salaryPublicationShare.count.mock.calls[0][0].where).not.toHaveProperty("extraProperty");
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
