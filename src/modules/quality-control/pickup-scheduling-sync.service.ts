import "server-only";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { executeTrustedMultiOutletScraper } from "@/modules/integrations/jfs-multi-outlet-client";
import type { SettingsScope } from "@/modules/settings/settings.types";

export const PICKUP_SCHEDULING_PROVIDER = "JFS_OMS_ORDER_DISPATCH";
const DEFAULT_STATUS_CODES = "100,106,101,102,105";
const locks = new Set<string>();
const text = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : null;
const integer = (value: unknown) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
};
const decimal = (value: unknown) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function parseJfsJakartaTimestamp(value: unknown) {
  const raw = text(value);
  if (!raw) return null;
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(raw)
    ? `${raw.replace(" ", "T")}+07:00` : raw;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

const maskedPhone = (value: unknown) => {
  const phone = text(value);
  return phone?.includes("*") ? phone : null;
};
const sanitizedRawPayload = (raw: Record<string, unknown>) => ({
  ...raw, senderMobilePhone: maskedPhone(raw.senderMobilePhone),
}) as Prisma.InputJsonObject;

export function normalizePickupScheduleRecord(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const externalJfsId = text(raw.id);
  const waybillNo = text(raw.waybillId);
  if (!externalJfsId || !/^\d+$/.test(externalJfsId) || !waybillNo) return null;
  const sourceInputAt = parseJfsJakartaTimestamp(raw.inputTime);
  const sourceUpdatedAt = parseJfsJakartaTimestamp(raw.updateTime);
  const dateSource = sourceInputAt || sourceUpdatedAt;
  if (!dateSource) return null;
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(dateSource);
  return {
    externalJfsId, waybillNo, businessDate: new Date(`${date}T00:00:00.000Z`),
    sourceInputAt, sourceUpdatedAt, customerOrderAt: parseJfsJakartaTimestamp(raw.customerOrderTime),
    sourcePlatform: text(raw.orderSourceName), orderSourceCode: text(raw.orderSourceCode),
    orderStatusCode: integer(raw.orderStatusCode), sourceStatus: text(raw.orderStatusName),
    customerName: text(raw.customerName), customerId: text(raw.customerCode),
    sendName: text(raw.sendName), sendCode: text(raw.sendCode),
    senderNameMasked: text(raw.senderName), senderCompany: text(raw.senderCompany),
    senderPhoneMasked: maskedPhone(raw.senderMobilePhone),
    senderProvinceName: text(raw.senderProvinceName), senderCityName: text(raw.senderCityName),
    senderAreaName: text(raw.senderAreaName), pickupAddressMasked: text(raw.senderDetailedAddress),
    receiverName: text(raw.receiverName), receiverCompany: text(raw.receiverCompany),
    receiverProvinceName: text(raw.receiverProvinceName), receiverCityName: text(raw.receiverCityName),
    receiverAreaName: text(raw.receiverAreaName), receiverAddress: text(raw.receiverDetailedAddress),
    goodsName: text(raw.goodsName), goodsTypeName: text(raw.goodsTypeName),
    packageNumber: integer(raw.packageNumber), packageChargeWeight: decimal(raw.packageChargeWeight),
    weight: decimal(raw.packageTotalWeight) ?? 0,
    paymentModeName: text(raw.paymentModeName), paymentModeCode: text(raw.paymentModeCode),
    totalFreight: decimal(raw.totalFreight), pickNetworkName: text(raw.pickNetworkName),
    sourceNetworkCode: text(raw.pickNetworkCode), pickStaffName: text(raw.pickStaffName),
    pickStaffCode: text(raw.pickStaffCode), dispatchNetworkAt: parseJfsJakartaTimestamp(raw.dispatchNetworkTime),
    dispatchStaffAt: parseJfsJakartaTimestamp(raw.dispatchStaffTime),
    bestPickTimeStartAt: parseJfsJakartaTimestamp(raw.bestPickTimeStart),
    bestPickTimeEndAt: parseJfsJakartaTimestamp(raw.bestPickTimeEnd),
    latestPickAt: parseJfsJakartaTimestamp(raw.latestPickTime),
    pickFailReason: text(raw.pickFailReason), pickFailAt: parseJfsJakartaTimestamp(raw.pickFailTime),
    pickFailTimes: integer(raw.pickFailTimes), printsNumber: integer(raw.printsNumber),
    sourceOutletCode: text(raw.proxyAreaCode) || text(raw.pickNetworkCode),
    proxyAreaCode: text(raw.proxyAreaCode), proxyAreaName: text(raw.proxyAreaName),
    rawPayload: sanitizedRawPayload(raw),
  };
}

export async function fetchPickupScheduleList(
  startDate: string, endDate: string, fetcher: typeof fetch = fetch, scope?: SettingsScope,
) {
  if (!scope) throw new Error("PICKUP_SCHEDULING_SCOPE_REQUIRED");
  const result = await executeTrustedMultiOutletScraper(scope, "OMS_SCHEDULING_LIST", {
    startInputTime: `${startDate} 00:00:00`, endInputTime: `${endDate} 23:59:59`,
    timeType: 1, orderStatusCode: DEFAULT_STATUS_CODES,
    startPickTime: "", endPickTime: "", pageSize: 100, fetcher,
  }) as { records?: unknown[]; pagesFetched?: number };
  if (!Array.isArray(result.records)) throw new Error("INVALID_OMS_SCHEDULING_RESPONSE");
  const records = result.records.map(normalizePickupScheduleRecord)
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
  return { records, fetched: result.records.length, invalid: result.records.length - records.length,
    pagesFetched: Number.isInteger(result.pagesFetched) ? result.pagesFetched as number : null };
}

export async function syncPickupScheduling(input: {
  tenantId: string; outletId: string; actorId: string; startDate: string; endDate: string;
  fetchList?: typeof fetchPickupScheduleList; scope?: SettingsScope;
}) {
  const lockKey = `${input.tenantId}:${input.outletId}`;
  if (locks.has(lockKey)) throw Object.assign(new Error("SYNC_IN_PROGRESS"), { code: "SYNC_IN_PROGRESS" });
  locks.add(lockKey);
  const scope = input.scope ?? { tenantId: input.tenantId, outletId: input.outletId };
  try {
    const source = await (input.fetchList || fetchPickupScheduleList)(input.startDate, input.endDate, fetch, scope);
    const syncedAt = new Date();
    let inserted = 0; let updated = 0; let unchanged = 0;
    await prisma.$transaction(async (tx) => {
      for (const record of source.records) {
        const unique = { tenantId: input.tenantId, outletId: input.outletId,
          sourceProvider: PICKUP_SCHEDULING_PROVIDER, externalJfsId: record.externalJfsId };
        const existing = await tx.rawPickupSchedule.findUnique({
          where: { tenantId_outletId_sourceProvider_externalJfsId: unique },
          select: { id: true, sourceHash: true },
        });
        const sourceHash = hash(record.rawPayload);
        const data = {
          ...record, sourceProvider: PICKUP_SCHEDULING_PROVIDER,
          sourceOrderId: record.externalJfsId, sourceRecordKey: `jfs-oms:${record.externalJfsId}`,
          sourceInputTime: record.sourceInputAt?.toISOString() || null,
          sourceUpdatedTime: record.sourceUpdatedAt?.toISOString() || null,
          weight: new Prisma.Decimal(record.weight),
          packageChargeWeight: record.packageChargeWeight === null ? null : new Prisma.Decimal(record.packageChargeWeight),
          totalFreight: record.totalFreight === null ? null : new Prisma.Decimal(record.totalFreight),
          sourceHash, syncedAt,
        };
        await tx.rawPickupSchedule.upsert({
          where: { tenantId_outletId_sourceProvider_externalJfsId: unique },
          create: { tenantId: input.tenantId, outletId: input.outletId, ...data }, update: data,
        });
        if (!existing) inserted += 1;
        else if (existing.sourceHash === sourceHash) unchanged += 1;
        else updated += 1;
      }
      const operationalWaybills = new Set(source.records.map(record => record.waybillNo)).size;
      await tx.auditLog.create({ data: {
        tenantId: input.tenantId, outletId: input.outletId, actorId: input.actorId,
        action: "CREATE", entityType: "PICKUP_SCHEDULING_SYNC",
        metadata: { startDate: input.startDate, endDate: input.endDate, fetched: source.fetched,
          inserted, updated, unchanged, invalid: source.invalid, operationalWaybills,
          pagesFetched: source.pagesFetched, result: "SUCCESS" },
      } });
    });
    return { success: true, fetched: source.fetched, inserted, updated, unchanged,
      invalid: source.invalid, operationalWaybills: new Set(source.records.map(record => record.waybillNo)).size,
      pagesFetched: source.pagesFetched };
  } finally { locks.delete(lockKey); }
}

export function resetPickupSchedulingLocks() { locks.clear(); }
