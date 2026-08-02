import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  findClosing: vi.fn(),
  updateClosing: vi.fn(),
  audit: vi.fn(),
  finalizeKasbon: vi.fn(),
}));
const tx = {
  salaryClosing: {
    findFirst: mocks.findClosing,
    updateMany: mocks.updateClosing,
  },
  salaryAudit: { create: mocks.audit },
  salaryKasbonAllocation: { updateMany: mocks.finalizeKasbon },
};
vi.mock("@/lib/db/prisma", () => ({
  prisma: { $transaction: mocks.transaction },
}));

import { completeSalaryClosing } from "./salary.closing.service";

const context = {
  tenantId: "tenant-1",
  outletId: "outlet-1",
  actorId: "user-1",
  outletCode: "OUT001",
};
const decimal = (value: number) => new Prisma.Decimal(value);
const employee = {
  id: "closing-employee-1",
  salaryProfileId: "profile-1",
  calculationWarningCount: 0,
  systemIncomeTotal: decimal(100_000),
  manualAdditionTotal: decimal(10_000),
  manualDeductionTotal: decimal(5_000),
  netSalary: decimal(105_000),
  calculationSnapshot: { id: "calculation-1" },
  adjustments: [],
};
const validClosing = () => ({
  id: "closing-1",
  closingNumber: "SAL/CLS/OUT001/2026/08/0001",
  status: "CLOSED",
  periodStart: new Date("2026-08-01T00:00:00.000Z"),
  periodEnd: new Date("2026-08-31T00:00:00.000Z"),
  snapshotCapturedAt: new Date("2026-08-31T10:00:00.000Z"),
  generatedAt: new Date("2026-08-31T10:01:00.000Z"),
  employees: [employee],
  profileSnapshots: [{
    salaryProfileId: "profile-1",
    effectiveFrom: new Date("2026-08-01T00:00:00.000Z"),
    effectiveTo: null,
  }],
  sourceRecords: [],
  kasbonSnapshots: [],
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.transaction.mockImplementation(async (callback) => callback(tx));
  mocks.findClosing.mockResolvedValue(validClosing());
  mocks.updateClosing.mockResolvedValue({ count: 1 });
  mocks.audit.mockResolvedValue({ id: "audit-1" });
  mocks.finalizeKasbon.mockResolvedValue({ count: 0 });
});

describe("Salary Closing Success", () => {
  it("finalizes a reviewed closing atomically and fills processedAt", async () => {
    const result = await completeSalaryClosing(context, "closing-1");
    expect(result).toMatchObject({
      id: "closing-1", status: "COMPLETED", alreadyCompleted: false,
    });
    expect(result.processedAt).toBeInstanceOf(Date);
    expect(mocks.updateClosing).toHaveBeenCalledWith({
      where: {
        id: "closing-1",
        tenantId: "tenant-1",
        outletId: "outlet-1",
        status: "CLOSED",
      },
      data: expect.objectContaining({
        status: "COMPLETED",
        processedAt: expect.any(Date),
        processedByUserId: "user-1",
      }),
    });
    expect(mocks.audit).toHaveBeenCalledTimes(1);
    expect(mocks.audit).toHaveBeenCalledWith({
      data: expect.objectContaining({
        entityType: "SALARY_CLOSING_COMPLETED",
        salaryClosingId: "closing-1",
      }),
    });
    expect(mocks.finalizeKasbon).toHaveBeenCalledWith({
      where: {
        tenantId: "tenant-1",
        outletId: "outlet-1",
        status: "DRAFT",
        closingEmployee: { salaryClosingId: "closing-1" },
      },
      data: { status: "FINALIZED", finalizedAt: expect.any(Date) },
    });
    expect(Object.keys(tx).sort()).toEqual([
      "salaryAudit", "salaryClosing", "salaryKasbonAllocation",
    ]);
  });

  it("is idempotent and does not create a second audit", async () => {
    mocks.findClosing.mockResolvedValueOnce({
      ...validClosing(), status: "COMPLETED",
    });
    await expect(completeSalaryClosing(context, "closing-1"))
      .resolves.toMatchObject({ status: "COMPLETED", alreadyCompleted: true });
    expect(mocks.updateClosing).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.finalizeKasbon).not.toHaveBeenCalled();
  });

  it.each(["DRAFT", "VOID"])("rejects status %s", async (status) => {
    mocks.findClosing.mockResolvedValueOnce({ ...validClosing(), status });
    await expect(completeSalaryClosing(context, "closing-1"))
      .rejects.toMatchObject({ code: "SALARY_CLOSING_NOT_REVIEW", status: 409 });
    expect(mocks.updateClosing).not.toHaveBeenCalled();
  });

  it("rejects unresolved employee/source mapping", async () => {
    mocks.findClosing.mockResolvedValueOnce({
      ...validClosing(),
      sourceRecords: [{ id: "source-1", exclusionReason: "EMPLOYEE_NOT_MATCHED" }],
    });
    await expect(completeSalaryClosing(context, "closing-1"))
      .rejects.toMatchObject({ code: "SALARY_CLOSING_HAS_WARNINGS" });
  });

  it("rejects a Kasbon snapshot without a reviewed allocation and names the team", async () => {
    mocks.findClosing.mockResolvedValueOnce({
      ...validClosing(),
      kasbonSnapshots: [{ teamName: "Team A", allocations: [] }],
    });
    await expect(completeSalaryClosing(context, "closing-1"))
      .rejects.toMatchObject({
        code: "SALARY_KASBON_REVIEW_REQUIRED",
        details: { teamNames: "Team A" },
      });
    expect(mocks.updateClosing).not.toHaveBeenCalled();
  });

  it("rejects incomplete snapshots and invalid negative totals", async () => {
    mocks.findClosing.mockResolvedValueOnce({
      ...validClosing(), snapshotCapturedAt: null,
    });
    await expect(completeSalaryClosing(context, "closing-1"))
      .rejects.toMatchObject({ code: "SALARY_CLOSING_NOT_GENERATED" });

    mocks.findClosing.mockResolvedValueOnce({
      ...validClosing(),
      employees: [{ ...employee, netSalary: decimal(-1) }],
    });
    await expect(completeSalaryClosing(context, "closing-1"))
      .rejects.toMatchObject({ code: "SALARY_CLOSING_INVALID_TOTAL" });
  });

  it("rolls back as one transaction when the success audit fails", async () => {
    mocks.audit.mockRejectedValueOnce(new Error("AUDIT_FAILED"));
    await expect(completeSalaryClosing(context, "closing-1"))
      .rejects.toThrow("AUDIT_FAILED");
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
  });

  it("returns not found for a closing outside tenant/outlet scope", async () => {
    mocks.findClosing.mockResolvedValueOnce(null);
    await expect(completeSalaryClosing(context, "other-closing"))
      .rejects.toMatchObject({ code: "SALARY_CLOSING_NOT_FOUND", status: 404 });
    expect(mocks.findClosing).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        id: "other-closing",
        tenantId: "tenant-1",
        outletId: "outlet-1",
      },
    }));
  });
});
