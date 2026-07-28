import "server-only";
import { createHash } from "node:crypto";
import { Prisma, type SyncRunStatus } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { writeAudit } from "@/lib/audit/write-audit";
import { fetchPickupSource, PickupSourceError, validatePickupRecord } from "./pickup.client";
import type {
  PickupEnvelope,
  PickupListInput,
  PickupSourceRecord,
  PickupSyncResult,
} from "./pickup.types";

type SyncContext = {
  tenantId: string;
  outletId: string;
  actorId: string;
};

type PickupFetcher = (operationalDate: string) => Promise<PickupEnvelope>;

function canonicalize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalize(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function pickupSourceRecordHash(record: PickupSourceRecord) {
  return createHash("sha256").update(canonicalize(record)).digest("hex");
}

function pickupSourceKey(waybillNo: string) {
  return `v1:pickup:${waybillNo.trim()}`;
}

function safeDecimal(value: number | string) {
  const decimal = new Prisma.Decimal(String(value));
  if (decimal.isNegative()) throw new Error("NEGATIVE_VALUE");
  return decimal;
}

function jakartaOperationalDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

async function auditRun(
  context: SyncContext,
  runId: string,
  entityType: string,
  action: "CREATE" | "UPDATE",
  metadata?: Prisma.InputJsonValue,
) {
  await writeAudit({
    tenantId: context.tenantId,
    outletId: context.outletId,
    actorId: context.actorId,
    action,
    entityType,
    entityId: runId,
    metadata,
  });
}

export async function syncPickup(
  context: SyncContext,
  options: { operationalDate?: string; fetchPickup?: PickupFetcher } = {},
): Promise<PickupSyncResult> {
  const operationalDate = options.operationalDate ?? jakartaOperationalDate();
  const startedAt = new Date();
  const run = await prisma.syncRun.create({
    data: {
      tenantId: context.tenantId,
      outletId: context.outletId,
      runType: "PICKUP",
      operationalDate: new Date(`${operationalDate}T00:00:00.000Z`),
      status: "RUNNING",
      startedAt,
      triggeredByUserId: context.actorId,
    },
  });

  try {
    await auditRun(context, run.id, "SYNC_STARTED", "CREATE", {
      runType: "PICKUP",
      operationalDate,
    });
    const envelope = await (options.fetchPickup ?? fetchPickupSource)(operationalDate);
    let created = 0;
    let updated = 0;
    let duplicate = 0;
    let anomaly = 0;

    await prisma.$transaction(async (tx) => {
      for (const unknownRecord of envelope.data) {
        const parsed = validatePickupRecord(unknownRecord);
        if (!parsed.success) {
          anomaly += 1;
          continue;
        }

        const record = parsed.data;
        let totalFreight: Prisma.Decimal;
        let freight: Prisma.Decimal;
        let weight: Prisma.Decimal;
        try {
          totalFreight = safeDecimal(record.totalFreight);
          freight = safeDecimal(record.freight);
          weight = safeDecimal(record.weight);
        } catch {
          anomaly += 1;
          continue;
        }

        const sourceRecordKey = pickupSourceKey(record.waybillNo);
        const sourceRecordHash = pickupSourceRecordHash(record);
        const existing = await tx.rawPickup.findUnique({
          where: {
            tenantId_outletId_sourceRecordKey: {
              tenantId: context.tenantId,
              outletId: context.outletId,
              sourceRecordKey,
            },
          },
        });
        const isDuplicate = existing?.sourceRecordHash === sourceRecordHash;

        const commonData = {
          operationalDate: new Date(`${operationalDate}T00:00:00.000Z`),
          sourceEndpoint: "/jfs-pickup",
          sourceFetchedAt: startedAt,
          syncedAt: new Date(),
          syncStatus: "NORMALIZED" as const,
          syncError: null,
          sourceRecordHash,
          sourcePayload: record as unknown as Prisma.InputJsonValue,
          waybillNo: record.waybillNo.trim(),
          pickNetwork: record.pickNetwork || null,
          destination: record.destination || null,
          settlementRaw: record.settlement || null,
          totalFreight,
          freight,
          weight,
          staffNameRaw: record.staff || null,
          senderName: record.sender || null,
          serviceRaw: record.service || null,
          receiverName: record.receiver || null,
          receiverAddress: record.address || null,
          lastSeenRunId: run.id,
        };

        const raw = existing
          ? await tx.rawPickup.update({
              where: { id: existing.id },
              data:
                isDuplicate
                  ? {
                      sourceFetchedAt: startedAt,
                      syncedAt: new Date(),
                      lastSeenRunId: run.id,
                    }
                  : commonData,
            })
          : await tx.rawPickup.create({
              data: {
                tenantId: context.tenantId,
                outletId: context.outletId,
                sourceRecordKey,
                firstSeenRunId: run.id,
                ...commonData,
              },
            });

        if (!existing) created += 1;
        else if (isDuplicate) duplicate += 1;
        else updated += 1;

        await tx.masterPickup.upsert({
          where: {
            tenantId_outletId_waybillNo: {
              tenantId: context.tenantId,
              outletId: context.outletId,
              waybillNo: raw.waybillNo,
            },
          },
          create: {
            tenantId: context.tenantId,
            outletId: context.outletId,
            rawPickupId: raw.id,
            operationalDate: raw.operationalDate,
            waybillNo: raw.waybillNo,
            staffName: raw.staffNameRaw,
            senderName: raw.senderName,
            freightAmount: raw.totalFreight,
            syncStatus: "NORMALIZED",
            sourceSyncedAt: raw.syncedAt ?? new Date(),
          },
          update: {
            rawPickupId: raw.id,
            operationalDate: raw.operationalDate,
            staffName: raw.staffNameRaw,
            senderName: raw.senderName,
            freightAmount: raw.totalFreight,
            syncStatus: "NORMALIZED",
            sourceSyncedAt: raw.syncedAt ?? new Date(),
          },
        });
      }
    });

    const completedAt = new Date();
    const status: SyncRunStatus = anomaly > 0 ? "PARTIAL_SUCCESS" : "SUCCESS";
    await prisma.syncRun.update({
      where: { id: run.id },
      data: {
        status,
        completedAt,
        pickupFetchedCount: envelope.total,
        pickupCreatedCount: created,
        pickupUpdatedCount: updated,
        duplicateCount: duplicate,
        anomalyCount: anomaly,
      },
    });

    const counts = { fetched: envelope.total, created, updated, duplicate, anomaly };
    await auditRun(context, run.id, "RAW_PICKUP_SYNCED", "UPDATE", counts);
    await auditRun(context, run.id, "MASTER_PICKUP_NORMALIZED", "UPDATE", {
      normalized: created + updated + duplicate,
    });
    await auditRun(context, run.id, "PICKUP_SYNC_COMPLETED", "UPDATE", {
      status,
      ...counts,
    });

    return { runId: run.id, startedAt, completedAt, status, ...counts };
  } catch (error) {
    const completedAt = new Date();
    await prisma.syncRun.update({
      where: { id: run.id },
      data: {
        status: "FAILED",
        completedAt,
        errorMessage:
          error instanceof PickupSourceError ? error.message : "Sinkronisasi pickup gagal.",
      },
    });
    await auditRun(context, run.id, "SYNC_FAILED", "UPDATE", {
      errorCode: error instanceof PickupSourceError ? "UPSTREAM_ERROR" : "INTERNAL_ERROR",
    });
    throw new PickupSourceError();
  }
}

function maskText(value: string | null) {
  if (!value) return null;
  if (value.length <= 2) return "**";
  return `${value.slice(0, 2)}${"*".repeat(Math.min(value.length - 2, 8))}`;
}

export async function listRawPickups(input: PickupListInput) {
  const where: Prisma.RawPickupWhereInput = {
    tenantId: input.tenantId,
    outletId: input.outletId,
    ...(input.search
      ? { waybillNo: { contains: input.search, mode: "insensitive" } }
      : {}),
    ...(input.staff
      ? { staffNameRaw: { contains: input.staff, mode: "insensitive" } }
      : {}),
    ...(input.destination
      ? { destination: { contains: input.destination, mode: "insensitive" } }
      : {}),
    ...(input.settlement
      ? { settlementRaw: { contains: input.settlement, mode: "insensitive" } }
      : {}),
  };
  const [total, rows] = await prisma.$transaction([
    prisma.rawPickup.count({ where }),
    prisma.rawPickup.findMany({
      where,
      orderBy: [{ sourceFetchedAt: "desc" }, { id: "desc" }],
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
      include: {
        firstSeenRun: { select: { startedAt: true } },
        lastSeenRun: { select: { startedAt: true } },
      },
    }),
  ]);

  return {
    rows: rows.map((row) => ({
      id: row.id,
      sourceFetchedAt: row.sourceFetchedAt,
      waybillNo: row.waybillNo,
      pickNetwork: row.pickNetwork,
      destination: row.destination,
      settlement: row.settlementRaw,
      totalFreight: row.totalFreight.toString(),
      freight: row.freight.toString(),
      weight: row.weight.toString(),
      staff: row.staffNameRaw,
      sender: row.senderName,
      service: row.serviceRaw,
      receiver: input.canViewPii ? row.receiverName : maskText(row.receiverName),
      address: input.canViewPii ? row.receiverAddress : maskText(row.receiverAddress),
      syncStatus: row.syncStatus,
      firstSeenAt: row.firstSeenRun.startedAt,
      lastSeenAt: row.lastSeenRun.startedAt,
    })),
    pagination: {
      page: input.page,
      pageSize: input.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / input.pageSize)),
    },
  };
}

export async function listMasterPickups(
  input: Omit<PickupListInput, "staff" | "destination" | "settlement" | "canViewPii">,
) {
  const where: Prisma.MasterPickupWhereInput = {
    tenantId: input.tenantId,
    outletId: input.outletId,
    ...(input.search
      ? { waybillNo: { contains: input.search, mode: "insensitive" } }
      : {}),
  };
  const [total, rows] = await prisma.$transaction([
    prisma.masterPickup.count({ where }),
    prisma.masterPickup.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
    }),
  ]);
  return {
    rows: rows.map((row) => ({
      id: row.id,
      waybillNo: row.waybillNo,
      staff: row.staffName,
      sender: row.senderName,
      freightAmount: row.freightAmount.toString(),
      syncStatus: row.syncStatus,
      updatedAt: row.updatedAt,
    })),
    pagination: {
      page: input.page,
      pageSize: input.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / input.pageSize)),
    },
  };
}

export async function getLatestPickupRun(tenantId: string, outletId: string) {
  return prisma.syncRun.findFirst({
    where: { tenantId, outletId, runType: "PICKUP" },
    orderBy: [{ startedAt: "desc" }, { id: "desc" }],
  });
}

export async function getPickupRun(tenantId: string, outletId: string, runId: string) {
  return prisma.syncRun.findFirst({
    where: { id: runId, tenantId, outletId, runType: "PICKUP" },
  });
}
