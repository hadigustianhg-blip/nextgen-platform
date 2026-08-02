import { readFile } from "node:fs/promises";
import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  findEmployee: vi.fn(),
  updateEmployees: vi.fn(),
  findEmployeeUnique: vi.fn(),
  findClosing: vi.fn(),
  updateClosing: vi.fn(),
  findAllocations: vi.fn(),
  finalizeAllocations: vi.fn(),
  audit: vi.fn(),
}));
const tx = {
  salaryClosingEmployee: {
    findFirst: mocks.findEmployee,
    updateMany: mocks.updateEmployees,
    findUniqueOrThrow: mocks.findEmployeeUnique,
  },
  salaryClosing: {
    findFirst: mocks.findClosing,
    update: mocks.updateClosing,
  },
  salaryKasbonAllocation: {
    findMany: mocks.findAllocations,
    updateMany: mocks.finalizeAllocations,
  },
  salaryAudit: { create: mocks.audit },
};
vi.mock("@/lib/db/prisma", () => ({
  prisma: { $transaction: mocks.transaction },
}));

import {
  processSalaryClosing,
  reviewSalaryClosingEmployeeAdjustment,
} from "./salary.closing.service";

const context = {
  tenantId: "tenant-1",
  outletId: "outlet-1",
  actorId: "user-1",
  outletCode: "OUT001",
};
const pendingEmployee = {
  id: "closing-employee-1",
  employeeId: "employee-1",
  employeeNameSnapshot: "Team Satu",
  status: "PENDING_REVIEW",
  salaryClosing: { status: "CLOSED" },
};
const processClosing = (status: "PENDING_REVIEW" | "REVIEWED") => ({
  id: "closing-1",
  status: "CLOSED",
  employees: [{
    id: "closing-employee-1",
    employeeNameSnapshot: "Team Satu",
    status,
    netSalary: new Prisma.Decimal(100_000),
  }],
  sourceRecords: [],
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.transaction.mockImplementation(async (callback) => callback(tx));
  mocks.findEmployee.mockResolvedValue(pendingEmployee);
  mocks.updateEmployees.mockResolvedValue({ count: 1 });
  mocks.findEmployeeUnique.mockResolvedValue({
    ...pendingEmployee,
    status: "REVIEWED",
  });
  mocks.audit.mockResolvedValue({ id: "audit-1" });
  mocks.findAllocations.mockResolvedValue([]);
  mocks.updateClosing.mockResolvedValue({ id: "closing-1", status: "PROCESSED" });
});

describe("Salary team adjustment review", () => {
  it("marks a scoped pending team reviewed even without nominal changes", async () => {
    await expect(reviewSalaryClosingEmployeeAdjustment(
      context,
      "closing-1",
      "closing-employee-1",
    )).resolves.toMatchObject({ status: "REVIEWED", alreadyReviewed: false });

    expect(mocks.updateEmployees).toHaveBeenCalledWith({
      where: {
        id: "closing-employee-1",
        salaryClosingId: "closing-1",
        tenantId: "tenant-1",
        outletId: "outlet-1",
        status: "PENDING_REVIEW",
      },
      data: { status: "REVIEWED" },
    });
    expect(mocks.audit).toHaveBeenCalledWith({
      data: expect.objectContaining({
        entityType: "SALARY_TEAM_ADJUSTMENT_REVIEWED",
        actorId: "user-1",
      }),
    });
  });

  it("is idempotent and does not create a duplicate review audit", async () => {
    mocks.findEmployee.mockResolvedValueOnce({
      ...pendingEmployee,
      status: "REVIEWED",
    });
    await expect(reviewSalaryClosingEmployeeAdjustment(
      context,
      "closing-1",
      "closing-employee-1",
    )).resolves.toMatchObject({ alreadyReviewed: true });
    expect(mocks.updateEmployees).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("rejects another scope and a closing that is no longer in review", async () => {
    mocks.findEmployee.mockResolvedValueOnce(null);
    await expect(reviewSalaryClosingEmployeeAdjustment(
      context,
      "other-closing",
      "other-employee",
    )).rejects.toMatchObject({ code: "SALARY_SCOPE_MISMATCH", status: 404 });

    mocks.findEmployee.mockResolvedValueOnce({
      ...pendingEmployee,
      salaryClosing: { status: "COMPLETED" },
    });
    await expect(reviewSalaryClosingEmployeeAdjustment(
      context,
      "closing-1",
      "closing-employee-1",
    )).rejects.toMatchObject({ code: "SALARY_CLOSING_LOCKED", status: 409 });
  });

  it("blocks Salary Recap until all teams are reviewed", async () => {
    mocks.findClosing.mockResolvedValueOnce(processClosing("PENDING_REVIEW"));
    await expect(processSalaryClosing(context, "closing-1"))
      .rejects.toMatchObject({
        code: "SALARY_TEAM_REVIEW_REQUIRED",
        status: 409,
        details: { teamNames: "Team Satu" },
      });
    expect(mocks.updateClosing).not.toHaveBeenCalled();
  });

  it("allows Salary Recap after every team is reviewed", async () => {
    mocks.findClosing.mockResolvedValueOnce(processClosing("REVIEWED"));
    await expect(processSalaryClosing(context, "closing-1"))
      .resolves.toMatchObject({ status: "PROCESSED" });
    expect(mocks.updateEmployees).toHaveBeenCalledWith(expect.objectContaining({
      data: { status: "PROCESSED" },
    }));
  });

  it("keeps the UI and reset rules aligned with the review SOP", async () => {
    const [ui, closingService, adjustmentService, kasbonService, migration] =
      await Promise.all([
        readFile(new URL(
          "../../components/finance/salary-closing-detail-client.tsx",
          import.meta.url,
        ), "utf8"),
        readFile(new URL("./salary.closing.service.ts", import.meta.url), "utf8"),
        readFile(new URL("./salary.service.ts", import.meta.url), "utf8"),
        readFile(new URL("./salary.kasbon.service.ts", import.meta.url), "utf8"),
        readFile(new URL(
          "../../../prisma/migrations/20260802000300_add_salary_team_pending_review_status/migration.sql",
          import.meta.url,
        ), "utf8"),
      ]);

    for (const label of [
      "Status Adjustment",
      "Belum Disesuaikan",
      "Selesai Disesuaikan",
      "Adjustment Salary —",
      "Simpan Adjustment",
      "Penyesuaian Team:",
      "text-rose-700",
      "text-emerald-700",
    ]) expect(ui).toContain(label);
    expect(ui).not.toContain('setConfirmAction("complete")');
    expect(ui).not.toContain("/${closingId}/complete");
    expect(closingService).toContain('status: "PENDING_REVIEW"');
    expect(adjustmentService.match(/status: "PENDING_REVIEW"/g)).toHaveLength(2);
    expect(kasbonService.match(/status: "PENDING_REVIEW"/g)).toHaveLength(2);
    expect(migration).toContain("ADD VALUE IF NOT EXISTS 'PENDING_REVIEW'");
    expect(migration).not.toMatch(/\b(UPDATE|DELETE|DROP|TRUNCATE)\b/i);
  });
});
