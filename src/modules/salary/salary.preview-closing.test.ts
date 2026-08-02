import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  create: vi.fn(),
  generate: vi.fn(),
  audit: vi.fn(),
}));
const tx = { salaryAudit: { create: mocks.audit } };
vi.mock("@/lib/db/prisma", () => ({
  prisma: { $transaction: mocks.transaction },
}));
vi.mock("./salary.service", () => ({
  createSalaryClosingInTransaction: mocks.create,
}));
vi.mock("./salary.closing.service", () => ({
  generateSalaryClosingInTransaction: mocks.generate,
}));

import { SalaryError } from "./salary.api";
import { createSalaryClosingFromPreview } from "./salary.preview-closing.service";

const context = {
  tenantId: "tenant-1",
  outletId: "outlet-1",
  actorId: "user-1",
  outletCode: "OUT001",
};
const input = {
  startDate: "2026-08-01",
  endDate: "2026-08-31",
  notes: "Closing Agustus",
  requestId: "11111111-1111-4111-8111-111111111111",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.transaction.mockImplementation(async (callback) => callback(tx));
  mocks.create.mockResolvedValue({
    id: "closing-1", closingNumber: "SAL/CLS/OUT001/2026/08/0001",
  });
  mocks.generate.mockResolvedValue({
    id: "closing-1",
    status: "CLOSED",
    generatedAt: new Date("2026-08-31T12:00:00.000Z"),
    generatedEmployees: 2,
  });
  mocks.audit.mockResolvedValue({ id: "audit-1" });
});

describe("create Salary Closing from preview", () => {
  it("creates, snapshots/calculates, and closes in one transaction", async () => {
    const result = await createSalaryClosingFromPreview(context, input);
    expect(result).toMatchObject({ id: "closing-1", status: "CLOSED" });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.create).toHaveBeenCalledWith(tx, context, {
      periodStart: input.startDate,
      periodEnd: input.endDate,
      notes: input.notes,
    }, { activeStatusesOnly: true });
    expect(mocks.generate).toHaveBeenCalledWith(tx, context, "closing-1");
    expect(mocks.audit).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "CREATE",
        entityType: "SALARY_CLOSING_CREATED_FROM_PREVIEW",
        salaryClosingId: "closing-1",
      }),
    });
  });

  it("does not leave a partial closing when snapshot/generation fails", async () => {
    mocks.generate.mockRejectedValueOnce(new Error("SNAPSHOT_FAILED"));
    await expect(createSalaryClosingFromPreview(context, input))
      .rejects.toThrow("SNAPSHOT_FAILED");
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });

  it("returns a safe overlap conflict including the existing closing number", async () => {
    mocks.create.mockRejectedValueOnce(new SalaryError(
      "SALARY_CLOSING_OVERLAP",
      409,
      { closingNumber: "SAL/CLS/OUT001/2026/08/0001" },
    ));
    await expect(createSalaryClosingFromPreview(context, input))
      .rejects.toMatchObject({
        code: "SALARY_CLOSING_OVERLAP",
        status: 409,
        details: { closingNumber: "SAL/CLS/OUT001/2026/08/0001" },
      });
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it("retries one serializable conflict so concurrent submit cannot persist twice", async () => {
    const conflict = new Prisma.PrismaClientKnownRequestError("write conflict", {
      code: "P2034",
      clientVersion: "6.19.3",
    });
    mocks.transaction
      .mockRejectedValueOnce(conflict)
      .mockImplementationOnce(async (callback) => callback(tx));
    await expect(createSalaryClosingFromPreview(context, input))
      .resolves.toMatchObject({ id: "closing-1", status: "CLOSED" });
    expect(mocks.transaction).toHaveBeenCalledTimes(2);
  });
});
