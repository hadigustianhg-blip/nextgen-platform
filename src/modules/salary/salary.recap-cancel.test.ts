import { readFile } from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  lockClosing: vi.fn(),
  updateClosing: vi.fn(),
  updateEmployees: vi.fn(),
  updateKasbon: vi.fn(),
  findCancellationAudit: vi.fn(),
  createAudits: vi.fn(),
}));
const tx = {
  $queryRaw: mocks.lockClosing,
  salaryClosing: { updateMany: mocks.updateClosing },
  salaryClosingEmployee: { updateMany: mocks.updateEmployees },
  salaryKasbonAllocation: { updateMany: mocks.updateKasbon },
  salaryAudit: {
    findFirst: mocks.findCancellationAudit,
    createMany: mocks.createAudits,
  },
};
vi.mock("@/lib/db/prisma", () => ({
  prisma: { $transaction: mocks.transaction },
}));

import { cancelSalaryRecap } from "./salary.recap.service";
import { salaryRecapCancelSchema } from "./salary.validation";

const context = {
  tenantId: "tenant-1",
  outletId: "outlet-1",
  actorId: "user-1",
  outletCode: "OUT001",
};
const processedClosing = {
  id: "closing-1",
  closingNumber: "SAL/CLS/OUT001/2026/08/0001",
  status: "PROCESSED",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.transaction.mockImplementation(async (callback) => callback(tx));
  mocks.lockClosing.mockResolvedValue([processedClosing]);
  mocks.updateClosing.mockResolvedValue({ count: 1 });
  mocks.updateEmployees.mockResolvedValue({ count: 11 });
  mocks.updateKasbon.mockResolvedValue({ count: 1 });
  mocks.createAudits.mockResolvedValue({ count: 2 });
  mocks.findCancellationAudit.mockResolvedValue(null);
});

describe("Salary Recap cancellation", () => {
  it("reopens a processed recap and requires every team to be reviewed again", async () => {
    const result = await cancelSalaryRecap(
      context,
      "closing-1",
      "Nominal perlu diperiksa kembali",
    );

    expect(result).toMatchObject({
      id: "closing-1",
      closingNumber: processedClosing.closingNumber,
      status: "CLOSED",
      processedAt: null,
      processedByUserId: null,
      employeeCount: 11,
      alreadyCancelled: false,
    });
    expect(mocks.updateClosing).toHaveBeenCalledWith({
      where: {
        id: "closing-1",
        tenantId: "tenant-1",
        outletId: "outlet-1",
        status: "PROCESSED",
      },
      data: {
        status: "CLOSED",
        processedAt: null,
        processedByUserId: null,
      },
    });
    expect(mocks.updateEmployees).toHaveBeenCalledWith({
      where: {
        tenantId: "tenant-1",
        outletId: "outlet-1",
        salaryClosingId: "closing-1",
      },
      data: { status: "PENDING_REVIEW" },
    });
    expect(mocks.updateKasbon).toHaveBeenCalledWith(expect.objectContaining({
      data: { status: "DRAFT", finalizedAt: null },
    }));
    expect(mocks.createAudits).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ entityType: "SALARY_RECAP_CANCELLED" }),
        expect.objectContaining({
          entityType: "SALARY_CLOSING_REOPENED_FROM_RECAP",
        }),
      ]),
    });
  });

  it("rejects a paid recap without changing any Salary data", async () => {
    mocks.lockClosing.mockResolvedValueOnce([{
      ...processedClosing,
      status: "PAID",
    }]);
    await expect(cancelSalaryRecap(context, "closing-1", "Alasan valid"))
      .rejects.toMatchObject({
        code: "SALARY_RECAP_PAYMENT_EXISTS",
        status: 409,
      });
    expect(mocks.updateClosing).not.toHaveBeenCalled();
    expect(mocks.updateEmployees).not.toHaveBeenCalled();
    expect(mocks.createAudits).not.toHaveBeenCalled();
  });

  it("rejects a closing outside the active tenant/outlet scope", async () => {
    mocks.lockClosing.mockResolvedValueOnce([]);
    await expect(cancelSalaryRecap(context, "other-closing", "Alasan valid"))
      .rejects.toMatchObject({ code: "SALARY_CLOSING_NOT_FOUND", status: 404 });
    expect(mocks.updateClosing).not.toHaveBeenCalled();
  });

  it("is idempotent after a successful cancellation without duplicate audits", async () => {
    mocks.lockClosing.mockResolvedValueOnce([{
      ...processedClosing,
      status: "CLOSED",
    }]);
    mocks.findCancellationAudit.mockResolvedValueOnce({ id: "audit-1" });
    await expect(cancelSalaryRecap(context, "closing-1", "Alasan valid"))
      .resolves.toMatchObject({ status: "CLOSED", alreadyCancelled: true });
    expect(mocks.updateClosing).not.toHaveBeenCalled();
    expect(mocks.createAudits).not.toHaveBeenCalled();
  });

  it("does not treat an unrelated CLOSED closing as an idempotent cancellation", async () => {
    mocks.lockClosing.mockResolvedValueOnce([{
      ...processedClosing,
      status: "CLOSED",
    }]);
    await expect(cancelSalaryRecap(context, "closing-1", "Alasan valid"))
      .rejects.toMatchObject({ code: "SALARY_RECAP_CANCEL_NOT_ALLOWED" });
  });

  it("keeps every mutation and both audits in the same transaction", async () => {
    mocks.createAudits.mockRejectedValueOnce(new Error("AUDIT_FAILED"));
    await expect(cancelSalaryRecap(context, "closing-1", "Alasan valid"))
      .rejects.toThrow("AUDIT_FAILED");
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(Object.keys(tx).sort()).toEqual([
      "$queryRaw",
      "salaryAudit",
      "salaryClosing",
      "salaryClosingEmployee",
      "salaryKasbonAllocation",
    ]);
  });

  it("requires a meaningful cancellation reason", () => {
    expect(salaryRecapCancelSchema.safeParse({ reason: "" }).success).toBe(false);
    expect(salaryRecapCancelSchema.safeParse({ reason: "abc" }).success).toBe(false);
    expect(salaryRecapCancelSchema.safeParse({
      reason: "Nominal perlu diperiksa kembali",
    }).success).toBe(true);
  });

  it("keeps recap filtering, UI and immutable Salary sources intact", async () => {
    const [closingService, recapService, recapUi, closingUi] = await Promise.all([
      readFile(new URL("./salary.closing.service.ts", import.meta.url), "utf8"),
      readFile(new URL("./salary.recap.service.ts", import.meta.url), "utf8"),
      readFile(new URL(
        "../../components/finance/salary-recap-empty.tsx",
        import.meta.url,
      ), "utf8"),
      readFile(new URL(
        "../../components/finance/salary-closing-detail-client.tsx",
        import.meta.url,
      ), "utf8"),
    ]);
    expect(closingService).toContain('status: { in: ["PROCESSED", "PAID"] }');
    for (const text of [
      "Batalkan Rekap",
      "Alasan Pembatalan",
      "Buka Salary Closing",
      "Salary Recap berhasil dibatalkan dan dikembalikan ke Dalam Review.",
    ]) expect([recapUi, closingUi].join("\n")).toContain(text);
    expect([recapUi, closingUi].join("\n")).not.toMatch(
      /\bwindow\.(alert|confirm|prompt)\s*\(/,
    );
    expect(recapService).not.toMatch(
      /RawPickup|RawDispatch|MasterPickup|calculateEmployeeSalary|captureSalaryClosingSnapshots/,
    );
    expect(recapService).not.toMatch(
      /salary(EmployeeSnapshot|RawPickup|RawDispatch|CalculationSnapshot)\.(delete|update|create)/,
    );
  });
});
