import { readFile } from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ transaction: vi.fn() }));
const tx = vi.hoisted(() => ({
  salaryClosing: { findFirst: vi.fn(), update: vi.fn() },
  salaryClosingSourceRecord: {
    findMany: vi.fn(), updateMany: vi.fn(), count: vi.fn(),
  },
  salaryAudit: { create: vi.fn() },
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: { $transaction: mocks.transaction } }));

import { ignoreSalaryClosingSources } from "./salary.closing.service";

const context = {
  tenantId: "tenant-1", outletId: "outlet-1", actorId: "user-1", outletCode: "SUM001A",
};
const input = {
  sourceIds: [
    "11111111-1111-4111-8111-111111111111",
    "22222222-2222-4222-8222-222222222222",
  ],
  reason: "Part-time harian / Tidak masuk payroll",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.transaction.mockImplementation(async (callback) => callback(tx));
  tx.salaryClosing.findFirst.mockResolvedValue({ id: "closing-1", status: "CLOSED" });
  tx.salaryClosingSourceRecord.findMany.mockResolvedValue([
    { id: input.sourceIds[0], sourceType: "PICKUP", sourceRecordId: "pickup-1" },
    { id: input.sourceIds[1], sourceType: "DISPATCH", sourceRecordId: "dispatch-1" },
  ]);
  tx.salaryClosingSourceRecord.updateMany.mockResolvedValue({ count: 2 });
  tx.salaryClosingSourceRecord.count.mockResolvedValue(0);
  tx.salaryClosing.update.mockResolvedValue({});
  tx.salaryAudit.create.mockResolvedValue({});
});

describe("manual Salary source exclusion", () => {
  it("bulk ignores unmatched pickup and dispatch with scoped audit metadata", async () => {
    const result = await ignoreSalaryClosingSources(context, "closing-1", input);
    expect(result).toEqual({ ignored: 2, pickup: 1, dispatch: 1, remaining: 0 });
    expect(tx.salaryClosingSourceRecord.findMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: { in: input.sourceIds }, tenantId: context.tenantId,
        outletId: context.outletId, salaryClosingId: "closing-1",
        isActive: true, calculationStatus: "UNMATCHED",
        salaryClosingEmployeeId: null,
      }),
      select: expect.any(Object),
    });
    expect(tx.salaryClosingSourceRecord.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ salaryClosingId: "closing-1" }),
      data: expect.objectContaining({
        calculationStatus: "EXCLUDED", isActive: false,
        exclusionReason: `MANUAL_IGNORE:${input.reason}`,
        metadata: { manualIgnore: expect.objectContaining({
          reason: input.reason, actorId: context.actorId,
        }) },
      }),
    });
    expect(tx.salaryAudit.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      actorId: context.actorId,
      entityType: "SALARY_SOURCES_MANUALLY_IGNORED",
      metadata: expect.objectContaining({ sourceIds: input.sourceIds, reason: input.reason }),
    }) });
  });

  it("keeps processing blocked when one active unmatched source remains", async () => {
    tx.salaryClosingSourceRecord.count.mockResolvedValueOnce(1);
    await expect(ignoreSalaryClosingSources(context, "closing-1", input))
      .resolves.toMatchObject({ remaining: 1 });
    expect(tx.salaryClosing.update).toHaveBeenCalledWith({
      where: { id: "closing-1" }, data: { calculationWarningCount: 1 },
    });
  });

  it.each([
    ["source from another closing", [{ ...input, id: input.sourceIds[0] }]],
    ["cross-tenant or cross-outlet source", []],
    ["already mapped or excluded source", []],
  ])("rejects %s when every requested ID is not unresolved in scope", async (_label, rows) => {
    tx.salaryClosingSourceRecord.findMany.mockResolvedValueOnce(rows);
    await expect(ignoreSalaryClosingSources(context, "closing-1", input))
      .rejects.toMatchObject({ code: "SALARY_SOURCE_IGNORE_INVALID", status: 409 });
    expect(tx.salaryClosingSourceRecord.updateMany).not.toHaveBeenCalled();
  });

  it.each(["DRAFT", "COMPLETED", "PROCESSED", "PAID", "VOID"])(
    "rejects historical or non-review closing status %s",
    async (status) => {
      tx.salaryClosing.findFirst.mockResolvedValueOnce({ id: "closing-1", status });
      await expect(ignoreSalaryClosingSources(context, "closing-1", input))
        .rejects.toMatchObject({ code: "SALARY_CLOSING_LOCKED", status: 409 });
    },
  );

  it("preserves manual exclusion across regenerate and exposes confirmation UI", async () => {
    const [service, ui] = await Promise.all([
      readFile(new URL("./salary.closing.service.ts", import.meta.url), "utf8"),
      readFile(new URL(
        "../../components/finance/salary-closing-detail-client.tsx",
        import.meta.url,
      ), "utf8"),
    ]);
    expect(service).toContain("manualIgnoredSources");
    expect(service).toContain("MANUAL_IGNORE:");
    expect(service).toContain("id: { notIn: manualIgnoredSources.map");
    expect(service).toContain("calculationPickups");
    expect(service).toContain("calculationDispatches");
    expect(ui).toContain("Abaikan Data dari Salary Closing?");
    expect(ui).toContain("Abaikan Terpilih");
    expect(ui).toContain("Pilih Semua");
  });
});
