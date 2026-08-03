import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { SettingsError } from "./settings.service";
import type { SettingsActor, SettingsScope } from "./settings.types";

export const maintenanceCandidateKeys = [
  "salaryClosingVoid",
  "salaryPublicationShareExpired",
  "salaryPublicationShareRevoked",
  "profitLossManualVoid",
  "profitLossAdjustmentVoid",
  "oldSyncRuns",
  "salaryRecapTest",
] as const;

export type MaintenanceCandidateKey = typeof maintenanceCandidateKeys[number];
export type MaintenanceResetInput = {
  candidateKey: MaintenanceCandidateKey;
  reason: string;
  confirmation: "RESET";
  previewToken: string;
};

export type MaintenanceCandidate = {
  key: MaintenanceCandidateKey;
  label: string;
  count: number;
  oldest: Date | null;
  newest: Date | null;
  status: "RESETTABLE" | "BLOCKED" | "EMPTY";
  safe: boolean;
  blocker: string | null;
  risk: string[];
  relationsAffected: string[];
  previewToken: string;
};

type MaintenanceClient = Pick<Prisma.TransactionClient,
  | "salaryClosing"
  | "salaryPublicationShare"
  | "profitLossManualEntry"
  | "profitLossAdjustment"
  | "syncRun"
  | "salaryKasbonAllocation"
  | "salaryAdjustment"
  | "salaryClosingComponent"
  | "salaryClosingSourceRecord"
  | "salaryCalculationSnapshot"
  | "salaryClosingEmployee"
  | "salaryClosingProfileSnapshot"
  | "salaryEmployeeSnapshot"
  | "salaryRawPickup"
  | "salaryRawDispatch"
  | "salaryKasbonSnapshot"
  | "salaryAudit"
  | "auditLog"
>;

const DAY = 86_400_000;
const RETENTION_DAYS = 90;

function dateRange(values: Date[]) {
  if (values.length === 0) return { oldest: null, newest: null };
  const timestamps = values.map((value) => value.getTime());
  return { oldest: new Date(Math.min(...timestamps)), newest: new Date(Math.max(...timestamps)) };
}

function tokenFor(scope: SettingsScope, candidate: Omit<MaintenanceCandidate, "previewToken">) {
  return createHash("sha256").update(JSON.stringify({
    tenantId: scope.tenantId,
    outletId: scope.outletId,
    key: candidate.key,
    count: candidate.count,
    oldest: candidate.oldest?.toISOString() ?? null,
    newest: candidate.newest?.toISOString() ?? null,
    status: candidate.status,
    blocker: candidate.blocker,
  })).digest("base64url");
}

function candidate(scope: SettingsScope, value: Omit<MaintenanceCandidate, "previewToken">): MaintenanceCandidate {
  return { ...value, previewToken: tokenFor(scope, value) };
}

async function buildMaintenancePreview(client: MaintenanceClient, scope: SettingsScope, now: Date) {
  const where = { tenantId: scope.tenantId, outletId: scope.outletId };
  const retentionCutoff = new Date(now.getTime() - RETENTION_DAYS * DAY);
  const [
    salaryRows,
    expiredShares,
    revokedShares,
    manualVoid,
    adjustmentVoid,
    oldRuns,
    latestSuccess,
    latestFailure,
  ] = await Promise.all([
    client.salaryClosing.findMany({
      where: { ...where, status: "VOID" },
      select: {
        id: true, periodStart: true, periodEnd: true, processedAt: true,
        employees: { select: { status: true } },
        publicationShares: { where: { revokedAt: null, expiresAt: { gt: now } }, select: { id: true } },
      },
    }),
    client.salaryPublicationShare.findMany({
      where: { ...where, expiresAt: { lt: now }, revokedAt: null },
      select: { id: true, createdAt: true },
    }),
    client.salaryPublicationShare.findMany({
      where: { ...where, revokedAt: { not: null } },
      select: { id: true, createdAt: true },
    }),
    client.profitLossManualEntry.findMany({
      where: { ...where, status: "VOID" },
      select: { id: true, entryDate: true },
    }),
    client.profitLossAdjustment.findMany({
      where: { ...where, status: "VOID" },
      select: { id: true, adjustmentDate: true },
    }),
    client.syncRun.findMany({
      where: { ...where, createdAt: { lt: retentionCutoff } },
      select: {
        id: true, createdAt: true, status: true,
        _count: { select: {
          firstSeenPickups: true, lastSeenPickups: true,
          firstSeenDispatches: true, lastSeenDispatches: true,
          firstSeenCodRecords: true, lastSeenCodRecords: true,
        } },
      },
    }),
    client.syncRun.findFirst({ where: { ...where, status: "SUCCESS" }, orderBy: { completedAt: "desc" }, select: { id: true } }),
    client.syncRun.findFirst({ where: { ...where, status: "FAILED" }, orderBy: { completedAt: "desc" }, select: { id: true } }),
  ]);

  const salaryBlocked = salaryRows.filter((row) => row.processedAt
    || row.publicationShares.length > 0
    || row.employees.some(({ status }) => status === "PROCESSED" || status === "PAID"));
  const salaryDates = dateRange(salaryRows.flatMap((row) => [row.periodStart, row.periodEnd]));
  const expiredDates = dateRange(expiredShares.map((row) => row.createdAt));
  const revokedDates = dateRange(revokedShares.map((row) => row.createdAt));
  const manualDates = dateRange(manualVoid.map((row) => row.entryDate));
  const adjustmentDates = dateRange(adjustmentVoid.map((row) => row.adjustmentDate));
  const lastStatusIds = new Set([latestSuccess?.id, latestFailure?.id].filter(Boolean));
  const safeOldRuns = oldRuns.filter((row) => row.status !== "RUNNING"
    && !lastStatusIds.has(row.id)
    && Object.values(row._count).every((count) => count === 0));
  const blockedOldRuns = oldRuns.length - safeOldRuns.length;
  const syncDates = dateRange(safeOldRuns.map((row) => row.createdAt));

  const row = (
    key: MaintenanceCandidateKey,
    label: string,
    count: number,
    dates: { oldest: Date | null; newest: Date | null },
    blocker: string | null,
    risk: string[],
    relationsAffected: string[],
  ) => candidate(scope, {
    key, label, count, ...dates,
    status: blocker ? "BLOCKED" : count === 0 ? "EMPTY" : "RESETTABLE",
    safe: !blocker && count > 0,
    blocker,
    risk,
    relationsAffected,
  });

  return {
    retentionDays: RETENTION_DAYS,
    generatedAt: now,
    candidates: [
      row(
        "salaryClosingVoid", "Salary Closing VOID", salaryRows.length, salaryDates,
        salaryBlocked.length > 0 ? `${salaryBlocked.length} closing masih memiliki status/relasi yang wajib dipertahankan.` : null,
        ["Data tidak dapat dikembalikan.", "Snapshot dan child closing terkait ikut dihapus.", "Audit aktivitas Maintenance tetap dipertahankan."],
        ["SalaryClosing", "SalaryClosingEmployee", "Salary snapshot", "Salary adjustment/kasbon", "Salary publication nonaktif", "SalaryAudit"],
      ),
      row("salaryPublicationShareExpired", "Salary Publication Share expired", expiredShares.length, expiredDates, null,
        ["Short link yang kedaluwarsa dihapus permanen."], ["SalaryPublicationShare"]),
      row("salaryPublicationShareRevoked", "Salary Publication Share revoked", revokedShares.length, revokedDates, null,
        ["Short link yang telah dicabut dihapus permanen."], ["SalaryPublicationShare"]),
      row("profitLossManualVoid", "Profit Loss Manual VOID", manualVoid.length, manualDates, null,
        ["Entri manual VOID dihapus permanen; transaksi ACTIVE tidak disentuh."], ["ProfitLossManualEntry"]),
      row("profitLossAdjustmentVoid", "Profit Loss Adjustment VOID", adjustmentVoid.length, adjustmentDates, null,
        ["Adjustment VOID dihapus permanen; adjustment ACTIVE tidak disentuh."], ["ProfitLossAdjustment"]),
      row("oldSyncRuns", `SyncRun lebih dari ${RETENTION_DAYS} hari`, safeOldRuns.length, syncDates,
        blockedOldRuns > 0 ? `${blockedOldRuns} run masih aktif, direferensikan data source, atau diperlukan sebagai status Integrasi terakhir.` : null,
        ["Hanya run terminal tanpa referensi data source yang dapat dihapus."], ["SyncRun"]),
      row("salaryRecapTest", "Salary Closing/Recap testing", 0, { oldest: null, newest: null },
        "Tidak ada penanda canonical untuk membuktikan data testing.",
        ["Kategori tidak dapat direset tanpa penanda data testing yang valid."], []),
    ],
  };
}

export async function getMaintenancePreview(scope: SettingsScope) {
  return buildMaintenancePreview(prisma, scope, new Date());
}

export async function simulateMaintenance(scope: SettingsScope) {
  const preview = await getMaintenancePreview(scope);
  return { simulatedAt: new Date(), writesPerformed: 0, candidates: preview.candidates };
}

function auditReset(
  tx: MaintenanceClient,
  actor: SettingsActor,
  entityType: "MAINTENANCE_RESET_EXECUTED" | "MAINTENANCE_RESET_BLOCKED" | "MAINTENANCE_RESET_CONFLICT",
  entityId: string,
  metadata: Prisma.InputJsonObject,
) {
  return tx.auditLog.create({ data: {
    tenantId: actor.tenantId,
    outletId: actor.outletId,
    actorId: actor.userId,
    action: entityType === "MAINTENANCE_RESET_EXECUTED" ? "DELETE" : "UPDATE",
    entityType,
    entityId,
    metadata,
  } });
}

async function deleteSalaryClosingRows(tx: MaintenanceClient, ids: string[], actor: SettingsActor) {
  const closing = { salaryClosingId: { in: ids }, tenantId: actor.tenantId, outletId: actor.outletId };
  const employee = { closingEmployee: { salaryClosingId: { in: ids } }, tenantId: actor.tenantId, outletId: actor.outletId };
  await tx.salaryPublicationShare.deleteMany({ where: closing });
  await tx.salaryKasbonAllocation.deleteMany({ where: employee });
  await tx.salaryAdjustment.deleteMany({ where: employee });
  await tx.salaryClosingComponent.deleteMany({ where: employee });
  await tx.salaryClosingSourceRecord.deleteMany({ where: closing });
  await tx.salaryCalculationSnapshot.deleteMany({ where: { closingEmployee: { salaryClosingId: { in: ids } }, tenantId: actor.tenantId, outletId: actor.outletId } });
  await tx.salaryClosingEmployee.deleteMany({ where: closing });
  await tx.salaryClosingProfileSnapshot.deleteMany({ where: closing });
  await tx.salaryEmployeeSnapshot.deleteMany({ where: closing });
  await tx.salaryRawPickup.deleteMany({ where: closing });
  await tx.salaryRawDispatch.deleteMany({ where: closing });
  await tx.salaryKasbonSnapshot.deleteMany({ where: closing });
  await tx.salaryAudit.deleteMany({ where: closing });
  return tx.salaryClosing.deleteMany({ where: { id: { in: ids }, tenantId: actor.tenantId, outletId: actor.outletId, status: "VOID", processedAt: null } });
}

async function executeCandidateDelete(tx: MaintenanceClient, actor: SettingsActor, key: MaintenanceCandidateKey, now: Date) {
  const where = { tenantId: actor.tenantId, outletId: actor.outletId };
  switch (key) {
    case "salaryClosingVoid": {
      const rows = await tx.salaryClosing.findMany({ where: { ...where, status: "VOID", processedAt: null }, select: { id: true } });
      return deleteSalaryClosingRows(tx, rows.map(({ id }) => id), actor);
    }
    case "salaryPublicationShareExpired":
      return tx.salaryPublicationShare.deleteMany({ where: { ...where, expiresAt: { lt: now }, revokedAt: null } });
    case "salaryPublicationShareRevoked":
      return tx.salaryPublicationShare.deleteMany({ where: { ...where, revokedAt: { not: null } } });
    case "profitLossManualVoid":
      return tx.profitLossManualEntry.deleteMany({ where: { ...where, status: "VOID" } });
    case "profitLossAdjustmentVoid":
      return tx.profitLossAdjustment.deleteMany({ where: { ...where, status: "VOID" } });
    case "oldSyncRuns": {
      const preview = await buildMaintenancePreview(tx, actor, now);
      const expected = preview.candidates.find((item) => item.key === key);
      if (!expected?.safe) return { count: 0 };
      const retentionCutoff = new Date(now.getTime() - RETENTION_DAYS * DAY);
      const rows = await tx.syncRun.findMany({
        where: { ...where, createdAt: { lt: retentionCutoff }, status: { not: "RUNNING" },
          firstSeenPickups: { none: {} }, lastSeenPickups: { none: {} },
          firstSeenDispatches: { none: {} }, lastSeenDispatches: { none: {} },
          firstSeenCodRecords: { none: {} }, lastSeenCodRecords: { none: {} } },
        select: { id: true },
      });
      return tx.syncRun.deleteMany({ where: { ...where, id: { in: rows.map(({ id }) => id) } } });
    }
    case "salaryRecapTest":
      return { count: 0 };
  }
}

export async function resetMaintenanceCandidate(actor: SettingsActor, input: MaintenanceResetInput) {
  const idempotencyKey = `${input.candidateKey}:${input.previewToken}`;
  const outcome = await prisma.$transaction(async (tx) => {
    const previous = await tx.auditLog.findFirst({
      where: { tenantId: actor.tenantId, outletId: actor.outletId, entityType: "MAINTENANCE_RESET_EXECUTED", entityId: idempotencyKey },
      select: { metadata: true },
    });
    if (previous) {
      const metadata = previous.metadata as Prisma.JsonObject | null;
      return { state: "SUCCESS" as const, candidateKey: input.candidateKey, deletedCount: Number(metadata?.count ?? 0), idempotent: true };
    }

    const now = new Date();
    const preview = await buildMaintenancePreview(tx, actor, now);
    const current = preview.candidates.find(({ key }) => key === input.candidateKey);
    if (!current || !current.safe) {
      await auditReset(tx, actor, "MAINTENANCE_RESET_BLOCKED", idempotencyKey, {
        candidateKey: input.candidateKey, count: current?.count ?? 0, reason: input.reason,
        dateRange: { oldest: current?.oldest?.toISOString() ?? null, newest: current?.newest?.toISOString() ?? null }, result: "BLOCKED",
      });
      return { state: "BLOCKED" as const };
    }
    if (current.previewToken !== input.previewToken) {
      await auditReset(tx, actor, "MAINTENANCE_RESET_CONFLICT", idempotencyKey, {
        candidateKey: input.candidateKey, count: current.count, reason: input.reason,
        dateRange: { oldest: current.oldest?.toISOString() ?? null, newest: current.newest?.toISOString() ?? null }, result: "CONFLICT",
      });
      return { state: "CONFLICT" as const };
    }

    const deleted = await executeCandidateDelete(tx, actor, input.candidateKey, now);
    if (deleted.count !== current.count) throw new SettingsError("MAINTENANCE_RESET_CONFLICT", 409);
    await auditReset(tx, actor, "MAINTENANCE_RESET_EXECUTED", idempotencyKey, {
      candidateKey: input.candidateKey, count: deleted.count, reason: input.reason,
      dateRange: { oldest: current.oldest?.toISOString() ?? null, newest: current.newest?.toISOString() ?? null }, result: "EXECUTED",
    });
    return { state: "SUCCESS" as const, candidateKey: input.candidateKey, deletedCount: deleted.count, idempotent: false };
  }, { isolationLevel: "Serializable" });

  if (outcome.state === "BLOCKED") throw new SettingsError("MAINTENANCE_RESET_BLOCKED", 409);
  if (outcome.state === "CONFLICT") throw new SettingsError("MAINTENANCE_RESET_CONFLICT", 409);
  return outcome;
}
