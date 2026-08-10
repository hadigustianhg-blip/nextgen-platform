import "server-only";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { executeTrustedMultiOutletScraper, isSecurityFailure } from "@/modules/integrations/jfs-multi-outlet-client";
import type { SettingsScope } from "@/modules/settings/settings.types";

const locks = new Set<string>();
const text = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : null;
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

export type PickupListRecord = {
  orderId: string; waybillId: string; customerId: string | null;
  senderNameMasked: string | null; senderPhoneMasked: string | null;
  pickupAddressMasked: string | null; sourcePlatform: string | null;
  goodsName: string | null; weight: number; status: string | null;
  outletCode: string | null; networkCode: string | null;
  businessDate: string; inputTime: string | null; updatedTime: string | null;
};

export function normalizePickupListRecord(value: unknown): PickupListRecord {
  if (!value || typeof value !== "object") throw new Error("INVALID_LIST_RECORD");
  const raw = value as Record<string, unknown>;
  const orderId = text(raw.orderId);
  const waybillId = text(raw.waybillId);
  const weight = Number(raw.weight || 0);
  const businessDate = text(raw.businessDate) || text(raw.inputTime)?.slice(0, 10);
  if (
    !orderId || !waybillId || !Number.isFinite(weight) ||
    !businessDate || !/^\d{4}-\d{2}-\d{2}$/.test(businessDate)
  ) throw new Error("INVALID_LIST_RECORD");
  return {
    orderId, waybillId, customerId: text(raw.customerId),
    senderNameMasked: text(raw.senderNameMasked), senderPhoneMasked: text(raw.senderPhoneMasked),
    pickupAddressMasked: text(raw.pickupAddressMasked), sourcePlatform: text(raw.sourcePlatform),
    goodsName: text(raw.goodsName), weight, status: text(raw.status),
    outletCode: text(raw.outletCode), networkCode: text(raw.networkCode),
    businessDate, inputTime: text(raw.inputTime), updatedTime: text(raw.updatedTime),
  };
}

export async function fetchPickupScheduleList(
  startDate: string,
  endDate: string,
  fetcher: typeof fetch = fetch,
  scope?: SettingsScope,
) {
  if (scope) {
    try {
      const result = await executeTrustedMultiOutletScraper(scope, "OMS", {
        startDate,
        endDate,
        fetcher,
      });
      const bodyData = Array.isArray(result.data) ? result.data : [];
      return bodyData.map(normalizePickupListRecord);
    } catch (err) {
      if (isSecurityFailure(err)) throw err;
      console.warn(`[MultiOutletFallback] OMS multi-outlet fetch failed, falling back to legacy GET /jfs-order-list-sync:`, err instanceof Error ? err.message : err);
      // Fallback to legacy GET endpoint for unconfigured or degraded outlets
    }
  }

  const baseUrl = process.env.JFS_MIDDLEWARE_BASE_URL?.trim()
    || process.env.JFS_MIDDLEWARE_URL?.trim();
  if (!baseUrl) throw new Error("MIDDLEWARE_NOT_CONFIGURED");
  const url = new URL("/jfs-order-list-sync", baseUrl);
  url.searchParams.set("startDate", startDate);
  url.searchParams.set("endDate", endDate);
  const response = await fetcher(url, {
    cache: "no-store", headers: { accept: "application/json" },
    signal: AbortSignal.timeout(45_000),
  });
  const body = await response.json().catch(() => null) as { success?: boolean; data?: unknown[] } | null;
  if (!response.ok || body?.success !== true || !Array.isArray(body.data)) throw new Error("LIST_SYNC_FAILED");
  return body.data.map(normalizePickupListRecord);
}

export async function syncPickupScheduling(input: {
  tenantId: string; outletId: string; actorId: string;
  startDate: string; endDate: string;
  fetchList?: typeof fetchPickupScheduleList;
  scope?: SettingsScope;
}) {
  const lockKey = `${input.tenantId}:${input.outletId}`;
  if (locks.has(lockKey)) throw Object.assign(new Error("SYNC_IN_PROGRESS"), { code: "SYNC_IN_PROGRESS" });
  locks.add(lockKey);

  const scope: SettingsScope = input.scope ?? { tenantId: input.tenantId, outletId: input.outletId };

  try {
    const records = input.fetchList
      ? await input.fetchList(input.startDate, input.endDate)
      : await fetchPickupScheduleList(input.startDate, input.endDate, fetch, scope);

    const syncedAt = new Date();
    let created = 0; let updated = 0; let unchanged = 0;
    await prisma.$transaction(async (tx) => {
      for (const record of records) {
        const businessDate = new Date(`${record.businessDate}T00:00:00.000Z`);
        const sourceRecordKey = `order:${record.orderId}:${record.waybillId}`;
        const unique = { tenantId: input.tenantId, outletId: input.outletId, businessDate, sourceRecordKey };
        const existing = await tx.rawPickupSchedule.findUnique({
          where: { tenantId_outletId_businessDate_sourceRecordKey: unique },
          select: { id: true, sourceHash: true },
        });
        const sourceHash = hash(record);
        const data = {
          sourceOrderId: record.orderId, waybillNo: record.waybillId,
          customerId: record.customerId, senderNameMasked: record.senderNameMasked,
          senderPhoneMasked: record.senderPhoneMasked, pickupAddressMasked: record.pickupAddressMasked,
          sourcePlatform: record.sourcePlatform, goodsName: record.goodsName,
          weight: new Prisma.Decimal(record.weight), sourceStatus: record.status,
          sourceOutletCode: record.outletCode, sourceNetworkCode: record.networkCode,
          sourceInputTime: record.inputTime, sourceUpdatedTime: record.updatedTime,
          sourceHash, syncedAt,
        };
        await tx.rawPickupSchedule.upsert({
          where: { tenantId_outletId_businessDate_sourceRecordKey: unique },
          create: { ...unique, ...data }, update: data,
        });
        if (!existing) created += 1;
        else if (existing.sourceHash === sourceHash) unchanged += 1;
        else updated += 1;
      }
      await tx.auditLog.create({
        data: {
          tenantId: input.tenantId, outletId: input.outletId, actorId: input.actorId,
          action: "CREATE", entityType: "PICKUP_SCHEDULING_SYNC",
          metadata: {
            startDate: input.startDate, endDate: input.endDate,
            fetched: records.length, created, updated, unchanged, result: "SUCCESS",
          },
        },
      });
    });
    return { success: true, fetched: records.length, created, updated, unchanged };
  } finally {
    locks.delete(lockKey);
  }
}

export function resetPickupSchedulingLocks() { locks.clear(); }
