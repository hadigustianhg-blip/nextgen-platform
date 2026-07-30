import "server-only";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

const BASE_URL = "https://jfs-middleware-v2-production.up.railway.app";
const locks = new Set<string>();
const text = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : null;
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

export type PickupListRecord = {
  orderId: string; waybillId: string; customerId: string | null;
  senderNameMasked: string | null; senderPhoneMasked: string | null;
  pickupAddressMasked: string | null; sourcePlatform: string | null;
  goodsName: string | null; weight: number; status: string | null;
  outletCode: string | null; networkCode: string | null;
  inputTime: string | null; updatedTime: string | null;
};

export function normalizePickupListRecord(value: unknown): PickupListRecord {
  if (!value || typeof value !== "object") throw new Error("INVALID_LIST_RECORD");
  const raw = value as Record<string, unknown>;
  const orderId = text(raw.orderId);
  const waybillId = text(raw.waybillId);
  const weight = Number(raw.weight || 0);
  if (!orderId || !waybillId || !Number.isFinite(weight)) throw new Error("INVALID_LIST_RECORD");
  return {
    orderId, waybillId, customerId: text(raw.customerId),
    senderNameMasked: text(raw.senderNameMasked), senderPhoneMasked: text(raw.senderPhoneMasked),
    pickupAddressMasked: text(raw.pickupAddressMasked), sourcePlatform: text(raw.sourcePlatform),
    goodsName: text(raw.goodsName), weight, status: text(raw.status),
    outletCode: text(raw.outletCode), networkCode: text(raw.networkCode),
    inputTime: text(raw.inputTime), updatedTime: text(raw.updatedTime),
  };
}

export async function fetchPickupScheduleList(businessDate: string, fetcher: typeof fetch = fetch) {
  const url = new URL("/jfs-order-list-sync", process.env.JFS_MIDDLEWARE_URL || BASE_URL);
  url.searchParams.set("start", `${businessDate} 00:00:00`);
  url.searchParams.set("end", `${businessDate} 23:59:59`);
  const response = await fetcher(url, {
    cache: "no-store", headers: { accept: "application/json" },
    signal: AbortSignal.timeout(45_000),
  });
  const body = await response.json().catch(() => null) as { success?: boolean; data?: unknown[] } | null;
  if (!response.ok || body?.success !== true || !Array.isArray(body.data)) throw new Error("LIST_SYNC_FAILED");
  return body.data.map(normalizePickupListRecord);
}

export async function syncPickupScheduling(input: {
  tenantId: string; outletId: string; actorId: string; businessDate: string;
  fetchList?: typeof fetchPickupScheduleList;
}) {
  const lockKey = `${input.tenantId}:${input.outletId}`;
  if (locks.has(lockKey)) throw Object.assign(new Error("SYNC_IN_PROGRESS"), { code: "SYNC_IN_PROGRESS" });
  locks.add(lockKey);
  try {
    const records = await (input.fetchList || fetchPickupScheduleList)(input.businessDate);
    const businessDate = new Date(`${input.businessDate}T00:00:00.000Z`);
    const syncedAt = new Date();
    let created = 0; let updated = 0;
    await prisma.$transaction(async (tx) => {
      for (const record of records) {
        const sourceRecordKey = `order:${record.orderId}:${record.waybillId}`;
        const unique = { tenantId: input.tenantId, outletId: input.outletId, businessDate, sourceRecordKey };
        const existing = await tx.rawPickupSchedule.findUnique({
          where: { tenantId_outletId_businessDate_sourceRecordKey: unique }, select: { id: true },
        });
        const data = {
          sourceOrderId: record.orderId, waybillNo: record.waybillId,
          customerId: record.customerId, senderNameMasked: record.senderNameMasked,
          senderPhoneMasked: record.senderPhoneMasked, pickupAddressMasked: record.pickupAddressMasked,
          sourcePlatform: record.sourcePlatform, goodsName: record.goodsName,
          weight: new Prisma.Decimal(record.weight), sourceStatus: record.status,
          sourceOutletCode: record.outletCode, sourceNetworkCode: record.networkCode,
          sourceInputTime: record.inputTime, sourceUpdatedTime: record.updatedTime,
          sourceHash: hash(record), syncedAt,
        };
        await tx.rawPickupSchedule.upsert({
          where: { tenantId_outletId_businessDate_sourceRecordKey: unique },
          create: { ...unique, ...data }, update: data,
        });
        if (existing) updated += 1; else created += 1;
      }
      await tx.auditLog.create({
        data: {
          tenantId: input.tenantId, outletId: input.outletId, actorId: input.actorId,
          action: "CREATE", entityType: "PICKUP_SCHEDULING_SYNC",
          metadata: { businessDate: input.businessDate, fetched: records.length, created, updated },
        },
      });
    });
    return { success: true, fetched: records.length, created, updated };
  } finally {
    locks.delete(lockKey);
  }
}

export function resetPickupSchedulingLocks() { locks.clear(); }
