import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  salaryRows: [] as Array<Record<string, unknown>>,
  expiredShares: [] as Array<Record<string, unknown>>,
  revokedShares: [] as Array<Record<string, unknown>>,
  manualRows: [] as Array<Record<string, unknown>>,
  adjustmentRows: [] as Array<Record<string, unknown>>,
  oldRuns: [] as Array<Record<string, unknown>>,
  latestSuccess: null as { id: string } | null,
  latestFailure: null as { id: string } | null,
  priorAudit: null as { metadata: Record<string, unknown> } | null,
}));

const db = vi.hoisted(() => ({
  salaryClosing: { findMany: vi.fn(), deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
  salaryPublicationShare: { findMany: vi.fn(), deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
  profitLossManualEntry: { findMany: vi.fn(), deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
  profitLossAdjustment: { findMany: vi.fn(), deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
  syncRun: { findMany: vi.fn(), findFirst: vi.fn(), deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
  salaryKasbonAllocation: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
  salaryAdjustment: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
  salaryClosingComponent: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
  salaryClosingSourceRecord: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
  salaryCalculationSnapshot: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
  salaryClosingEmployee: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
  salaryClosingProfileSnapshot: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
  salaryEmployeeSnapshot: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
  salaryRawPickup: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
  salaryRawDispatch: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
  salaryKasbonSnapshot: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
  salaryAudit: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
  auditLog: { findFirst: vi.fn(), create: vi.fn() },
  $transaction: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: db }));

import { getMaintenancePreview, resetMaintenanceCandidate } from "./settings.maintenance.service";

const actor = { tenantId: "tenant-1", outletId: "outlet-1", userId: "owner-1" };
const baseDate = new Date("2026-08-01T00:00:00.000Z");

describe("safe Settings Maintenance reset", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(state, { salaryRows: [], expiredShares: [], revokedShares: [], manualRows: [], adjustmentRows: [], oldRuns: [], latestSuccess: null, latestFailure: null, priorAudit: null });
    db.$transaction.mockImplementation(async (callback: (tx: typeof db) => unknown) => callback(db));
    db.salaryClosing.findMany.mockImplementation(async (input: { select?: { id?: boolean } }) => input.select && Object.keys(input.select).length === 1 ? state.salaryRows.map(({ id }) => ({ id })) : state.salaryRows);
    db.salaryPublicationShare.findMany.mockImplementation(async (input: { where: { revokedAt?: unknown } }) => input.where.revokedAt === null ? state.expiredShares : state.revokedShares);
    db.profitLossManualEntry.findMany.mockImplementation(async () => state.manualRows);
    db.profitLossAdjustment.findMany.mockImplementation(async () => state.adjustmentRows);
    db.syncRun.findMany.mockImplementation(async () => state.oldRuns);
    db.syncRun.findFirst.mockImplementation(async (input: { where: { status: string } }) => input.where.status === "SUCCESS" ? state.latestSuccess : state.latestFailure);
    db.auditLog.findFirst.mockImplementation(async () => state.priorAudit);
    db.auditLog.create.mockResolvedValue({ id: 1n });
    for (const model of [db.salaryPublicationShare, db.profitLossManualEntry, db.profitLossAdjustment, db.syncRun]) model.deleteMany.mockImplementation(async () => ({ count: 1 }));
    db.salaryClosing.deleteMany.mockImplementation(async () => ({ count: state.salaryRows.length }));
  });

  it("scopes every preview query and exposes each candidate as a separate safe contract", async () => {
    const preview = await getMaintenancePreview({ ...actor, extra: "ignored" } as typeof actor);
    expect(preview.candidates).toHaveLength(7);
    expect(preview.candidates.map(({ key }) => key)).toEqual(expect.arrayContaining(["salaryClosingVoid", "salaryPublicationShareExpired", "profitLossManualVoid", "oldSyncRuns"]));
    for (const model of [db.salaryClosing, db.salaryPublicationShare, db.profitLossManualEntry, db.profitLossAdjustment, db.syncRun]) {
      for (const [input] of model.findMany.mock.calls) expect(input.where).toMatchObject({ tenantId: "tenant-1", outletId: "outlet-1" });
    }
  });

  it("blocks VOID Salary Closing that was processed, paid, or still has an active publication", async () => {
    state.salaryRows = [{ id: "closing-1", periodStart: baseDate, periodEnd: baseDate, processedAt: baseDate, employees: [{ status: "PAID" }], publicationShares: [{ id: "active-share" }] }];
    const preview = await getMaintenancePreview(actor);
    const candidate = preview.candidates.find(({ key }) => key === "salaryClosingVoid")!;
    expect(candidate.status).toBe("BLOCKED");
    await expect(resetMaintenanceCandidate(actor, { candidateKey: candidate.key, reason: "Menjaga data produksi aman", confirmation: "RESET", previewToken: candidate.previewToken })).rejects.toMatchObject({ code: "MAINTENANCE_RESET_BLOCKED" });
    expect(db.salaryClosing.deleteMany).not.toHaveBeenCalled();
    expect(db.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ entityType: "MAINTENANCE_RESET_BLOCKED" }) }));
  });

  it("deletes only a fully safe VOID Salary Closing and keeps AuditLog as the reset trail", async () => {
    state.salaryRows = [{ id: "closing-void", periodStart: baseDate, periodEnd: baseDate, processedAt: null, employees: [{ status: "DRAFT" }], publicationShares: [] }];
    const preview = await getMaintenancePreview(actor);
    const candidate = preview.candidates.find(({ key }) => key === "salaryClosingVoid")!;
    const result = await resetMaintenanceCandidate(actor, { candidateKey: candidate.key, reason: "Menghapus closing VOID yang aman", confirmation: "RESET", previewToken: candidate.previewToken });
    expect(result.deletedCount).toBe(1);
    expect(db.salaryKasbonAllocation.deleteMany).toHaveBeenCalledBefore(db.salaryClosingEmployee.deleteMany);
    expect(db.salaryClosingEmployee.deleteMany).toHaveBeenCalledBefore(db.salaryClosing.deleteMany);
    expect(db.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "DELETE", entityType: "MAINTENANCE_RESET_EXECUTED" }) }));
    expect(db.auditLog).not.toHaveProperty("deleteMany");
  });

  it("selects only VOID Profit Loss rows and never ACTIVE rows", async () => {
    state.manualRows = [{ id: "manual-void", entryDate: baseDate }];
    const preview = await getMaintenancePreview(actor);
    const candidate = preview.candidates.find(({ key }) => key === "profitLossManualVoid")!;
    await resetMaintenanceCandidate(actor, { candidateKey: candidate.key, reason: "Menghapus manual VOID yang aman", confirmation: "RESET", previewToken: candidate.previewToken });
    expect(db.profitLossManualEntry.findMany.mock.calls[0][0].where).toMatchObject({ status: "VOID" });
    expect(db.profitLossManualEntry.deleteMany).toHaveBeenCalledWith({ where: { tenantId: "tenant-1", outletId: "outlet-1", status: "VOID" } });
  });

  it("rejects a stale preview when candidate data changes", async () => {
    state.adjustmentRows = [{ id: "adjustment-1", adjustmentDate: baseDate }];
    const preview = await getMaintenancePreview(actor);
    const candidate = preview.candidates.find(({ key }) => key === "profitLossAdjustmentVoid")!;
    state.adjustmentRows.push({ id: "adjustment-2", adjustmentDate: baseDate });
    await expect(resetMaintenanceCandidate(actor, { candidateKey: candidate.key, reason: "Reset adjustment VOID terverifikasi", confirmation: "RESET", previewToken: candidate.previewToken })).rejects.toMatchObject({ code: "MAINTENANCE_RESET_CONFLICT" });
    expect(db.profitLossAdjustment.deleteMany).not.toHaveBeenCalled();
    expect(db.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ entityType: "MAINTENANCE_RESET_CONFLICT" }) }));
  });

  it("is idempotent when the same successful preview token is submitted twice", async () => {
    state.expiredShares = [{ id: "share-expired", createdAt: baseDate }];
    const preview = await getMaintenancePreview(actor);
    const candidate = preview.candidates.find(({ key }) => key === "salaryPublicationShareExpired")!;
    state.priorAudit = { metadata: { count: 1 } };
    const result = await resetMaintenanceCandidate(actor, { candidateKey: candidate.key, reason: "Membersihkan share yang kedaluwarsa", confirmation: "RESET", previewToken: candidate.previewToken });
    expect(result).toMatchObject({ deletedCount: 1, idempotent: true });
    expect(db.salaryPublicationShare.deleteMany).not.toHaveBeenCalled();
  });

  it("keeps old SyncRun blocked when source relations or latest integration status still need it", async () => {
    state.oldRuns = [{ id: "run-1", createdAt: new Date("2026-01-01"), status: "SUCCESS", _count: { firstSeenPickups: 1, lastSeenPickups: 0, firstSeenDispatches: 0, lastSeenDispatches: 0, firstSeenCodRecords: 0, lastSeenCodRecords: 0 } }];
    state.latestSuccess = { id: "run-1" };
    const preview = await getMaintenancePreview(actor);
    const candidate = preview.candidates.find(({ key }) => key === "oldSyncRuns")!;
    expect(candidate).toMatchObject({ count: 0, status: "BLOCKED", safe: false });
    expect(db.syncRun.deleteMany).not.toHaveBeenCalled();
  });
});
