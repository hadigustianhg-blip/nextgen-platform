import "server-only";
import { prisma } from "@/lib/db/prisma";
import { normalizeAgingSign, SLA_TARGET, summarizeSla } from "./sla-cut-off.calculation";

const SOURCE_ENDPOINT =
  "https://jfs-middleware-v2-production.up.railway.app/jfs-aging-sign";

export async function getSlaCutOff(input: {
  tenantId: string; outletId: string; periodStart: string; periodEnd: string;
}) {
  const rows = await prisma.rawSlaCutOff.findMany({
    where: {
      tenantId: input.tenantId,
      outletId: input.outletId,
      businessDate: {
        gte: new Date(`${input.periodStart}T00:00:00.000Z`),
        lte: new Date(`${input.periodEnd}T00:00:00.000Z`),
      },
      syncStatus: "NORMALIZED",
    },
    orderBy: { businessDate: "desc" },
  });
  const items = rows.map((row) => ({
    businessDate: row.businessDate.toISOString().slice(0, 10),
    sla: Number(row.sla),
    paketSampai: row.paketSampai,
    sudahTandaTerima: row.sudahTandaTerima,
    belumTandaTerima: row.belumTandaTerima,
    lewatSla: row.lewatSla,
    status: Number(row.sla) >= SLA_TARGET ? "ACHIEVE" as const : "NOT_ACHIEVE" as const,
  }));
  return {
    period: { startDate: input.periodStart, endDate: input.periodEnd, target: SLA_TARGET },
    summary: summarizeSla(items),
    items,
  };
}

export async function syncSlaCutOff(input: {
  tenantId: string; outletId: string; periodStart: string; periodEnd: string;
}) {
  const outlet = await prisma.outlet.findFirst({
    where: { id: input.outletId, tenantId: input.tenantId, isActive: true },
    select: { code: true },
  });
  if (!outlet) throw new Error("Outlet tidak valid.");
  const response = await fetch(SOURCE_ENDPOINT, {
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Sinkronisasi SLA gagal (${response.status}).`);
  const payload = await response.json() as { success?: boolean; data?: unknown[] };
  if (!payload.success || !Array.isArray(payload.data)) throw new Error("Respons jfs-aging-sign tidak valid.");
  const records = payload.data.map(normalizeAgingSign);
  const mismatchedNetwork = records.find((record) => record.networkName !== outlet.code);
  if (mismatchedNetwork) {
    throw new Error("Network sumber SLA tidak sesuai dengan outlet yang dipilih.");
  }
  let inserted = 0;
  let updated = 0;
  let skippedOutsidePeriod = 0;
  for (const record of records) {
    if (record.queryTime < input.periodStart || record.queryTime > input.periodEnd) {
      skippedOutsidePeriod += 1;
      continue;
    }
    const businessDate = new Date(`${record.queryTime}T00:00:00.000Z`);
    const sourceRecordKey = `${record.networkName}:${record.queryTime}`;
    const existing = await prisma.rawSlaCutOff.findUnique({
      where: { tenantId_outletId_businessDate_sourceRecordKey: {
        tenantId: input.tenantId, outletId: input.outletId, businessDate, sourceRecordKey,
      }},
      select: { id: true },
    });
    const data = {
      sourceEndpoint: SOURCE_ENDPOINT,
      sourceFetchedAt: new Date(),
      sourcePayload: record,
      syncStatus: "NORMALIZED" as const,
      sla: Number(record.signTimelyRate.replace("%", "")),
      paketSampai: record.sendCenterTotal,
      sudahTandaTerima: record.signTimelyTotal,
      belumTandaTerima: record.signDelayNoSignTotal,
      lewatSla: record.signDelayOtherTotal,
    };
    await prisma.rawSlaCutOff.upsert({
      where: { tenantId_outletId_businessDate_sourceRecordKey: {
        tenantId: input.tenantId, outletId: input.outletId, businessDate, sourceRecordKey,
      }},
      create: { ...data, tenantId: input.tenantId, outletId: input.outletId, businessDate, sourceRecordKey },
      update: data,
    });
    if (existing) updated += 1;
    else inserted += 1;
  }
  return {
    success: true, processed: records.length, inserted, updated, skippedOutsidePeriod,
    snapshotOnly: true,
    period: { startDate: input.periodStart, endDate: input.periodEnd },
  };
}
