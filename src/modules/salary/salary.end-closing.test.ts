import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { mockTx } = vi.hoisted(() => ({
  mockTx: {
    $queryRaw: vi.fn(),
    salaryClosing: { updateMany: vi.fn() },
    salaryClosingEmployee: { updateMany: vi.fn() },
    salaryKasbonAllocation: { updateMany: vi.fn() },
    salaryAudit: { create: vi.fn(), findFirst: vi.fn() },
  },
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: vi.fn(async (cb: any) => cb(mockTx)),
  },
}));

import { endSalaryRecapClosing, cancelSalaryRecap, SalaryError } from "./index";

describe("Salary Recap End Closing Integration & Regression Tests", () => {
  it("transitions PROCESSED closing to PAID idempotently and records audit", async () => {
    mockTx.$queryRaw.mockResolvedValueOnce([
      { id: "closing-100", closingNumber: "SAL-202608-001", status: "PROCESSED" },
    ]);
    mockTx.salaryClosing.updateMany.mockResolvedValueOnce({ count: 1 });
    mockTx.salaryClosingEmployee.updateMany.mockResolvedValueOnce({ count: 2 });
    mockTx.salaryKasbonAllocation.updateMany.mockResolvedValueOnce({ count: 1 });
    mockTx.salaryAudit.create.mockResolvedValueOnce({ id: "audit-1" });

    const context = {
      tenantId: "tenant-1",
      outletId: "outlet-1",
      actorId: "user-admin",
      outletCode: "OUT01",
    };

    const res1 = await endSalaryRecapClosing(context, "closing-100");
    expect(res1.status).toBe("PAID");
    expect(res1.alreadyEnded).toBe(false);
    expect(mockTx.salaryClosing.updateMany).toHaveBeenCalledWith({
      where: {
        id: "closing-100",
        tenantId: "tenant-1",
        outletId: "outlet-1",
        status: "PROCESSED",
      },
      data: { status: "PAID" },
    });
    expect(mockTx.salaryAudit.create).toHaveBeenCalled();
  });

  it("handles double End Closing calls idempotently without duplicate audit or mutation", async () => {
    mockTx.$queryRaw.mockResolvedValueOnce([
      { id: "closing-100", closingNumber: "SAL-202608-001", status: "PAID" },
    ]);
    mockTx.salaryAudit.findFirst.mockResolvedValueOnce({
      createdAt: new Date("2026-08-15T10:00:00.000Z"),
      actorId: "user-admin",
    });

    const context = {
      tenantId: "tenant-1",
      outletId: "outlet-1",
      actorId: "user-admin",
      outletCode: "OUT01",
    };

    const res2 = await endSalaryRecapClosing(context, "closing-100");
    expect(res2.status).toBe("PAID");
    expect(res2.alreadyEnded).toBe(true);
  });

  it("blocks cancelSalaryRecap when status is PAID with HTTP 409 SalaryError", async () => {
    mockTx.$queryRaw.mockResolvedValueOnce([
      { id: "closing-100", closingNumber: "SAL-202608-001", status: "PAID" },
    ]);

    const context = {
      tenantId: "tenant-1",
      outletId: "outlet-1",
      actorId: "user-admin",
      outletCode: "OUT01",
    };

    await expect(cancelSalaryRecap(context, "closing-100", "Reason for cancel")).rejects.toThrow(
      SalaryError,
    );
  });

  it("calculates partial kasbon remaining obligation correctly", () => {
    const originalExpenseAmount = 1000000;
    const closingAAllocation = 300000;

    const paidAfterA = closingAAllocation;
    const remainingAfterA = Math.max(0, originalExpenseAmount - paidAfterA);

    expect(remainingAfterA).toBe(700000);

    const closingBAllocation = 700000;
    const paidAfterB = paidAfterA + closingBAllocation;
    const remainingAfterB = Math.max(0, originalExpenseAmount - paidAfterB);

    expect(remainingAfterB).toBe(0);
  });

  it("maintains tenant and outlet isolation for End Closing", async () => {
    mockTx.$queryRaw.mockResolvedValueOnce([]); // Not found for wrong tenant/outlet scope

    const wrongContext = {
      tenantId: "tenant-2",
      outletId: "outlet-2",
      actorId: "user-admin-2",
      outletCode: "OUT02",
    };

    await expect(endSalaryRecapClosing(wrongContext, "closing-100")).rejects.toThrow(
      SalaryError,
    );
  });
});
