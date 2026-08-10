import "server-only";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { executeTrustedMultiOutletScraper, isSecurityFailure } from "@/modules/integrations/jfs-multi-outlet-client";
import type { SettingsScope } from "@/modules/settings/settings.types";

const DEFAULT_BASE_URL = "https://jfs-middleware-v2-production.up.railway.app";
const BATCH_SIZE = 100;

type InventoryRecord = {
  billCode: string;
  customerName: string | null;
  goodsName: string | null;
  inventoryHours: number;
  operateScanTime2: string | null;
  abnormalRegisterTime: string | null;
  destinationDistributionName: string | null;
  expressTypeName: string | null;
};
type StatusRecord = {
  sourceWaybill: string;
  status: string;
  currentScanSite: string | null;
  currentScanTime: string | null;
  currentScanType: string | null;
  scanType: string | null;
  problemReason: string | null;
  isVoid: string | null;
  recordId: string | null;
  statusFound: boolean;
};

export class WaybillStuckSourceError extends Error {
  constructor(
    public readonly code: "UNAVAILABLE" | "INVALID_RESPONSE",
    public readonly retryable = false,
  ) {
    super("Sumber Waybill Stuck Delivery tidak tersedia.");
  }
}

const text = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : null;
const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const chunks = <T>(values: T[], size: number) =>
  Array.from({ length: Math.ceil(values.length / size) }, (_, index) =>
    values.slice(index * size, index * size + size),
  );

export function normalizeInventoryRecord(value: unknown): InventoryRecord {
  if (!value || typeof value !== "object") throw new WaybillStuckSourceError("INVALID_RESPONSE");
  const raw = value as Record<string, unknown>;
  const billCode = text(raw.billCode);
  const inventoryHours = Number(raw.inventoryHours);
  if (!billCode || !Number.isFinite(inventoryHours)) throw new WaybillStuckSourceError("INVALID_RESPONSE");
  return {
    billCode,
    customerName: text(raw.customerName),
    goodsName: text(raw.goodsName),
    inventoryHours: Math.trunc(inventoryHours),
    operateScanTime2: text(raw.operateScanTime2),
    abnormalRegisterTime: text(raw.abnormalRegisterTime),
    destinationDistributionName: text(raw.destinationDistributionName),
    expressTypeName: text(raw.expressTypeName),
  };
}

export function normalizeWaybillStatusRecord(value: unknown): StatusRecord {
  if (!value || typeof value !== "object") throw new WaybillStuckSourceError("INVALID_RESPONSE");
  const raw = value as Record<string, unknown>;
  const sourceWaybill = text(raw.sourceWaybill);
  const status = text(raw.status);
  if (!sourceWaybill || !status) throw new WaybillStuckSourceError("INVALID_RESPONSE");
  if (status === "not_found") {
    return {
      sourceWaybill,
      status,
      currentScanSite: null,
      currentScanTime: null,
      currentScanType: null,
      scanType: null,
      problemReason: null,
      isVoid: null,
      recordId: "not_found",
      statusFound: false,
    };
  }
  if (status !== "success") throw new WaybillStuckSourceError("INVALID_RESPONSE");
  return {
    sourceWaybill,
    status,
    currentScanSite: text(raw.currentScanSite),
    currentScanTime: text(raw.currentScanTime),
    currentScanType: text(raw.currentScanType),
    scanType: text(raw.scanType),
    problemReason: text(raw.problemReason),
    isVoid: text(raw.isVoid),
    recordId: text(raw.recordId),
    statusFound: true,
  };
}

export async function requestWithRetry(
  request: () => Promise<Response>,
  wait: (milliseconds: number) => Promise<unknown> = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await request();
      if (!response.ok) {
        throw new WaybillStuckSourceError("UNAVAILABLE", response.status >= 500);
      }
      return response;
    } catch (error) {
      const normalized =
        error instanceof WaybillStuckSourceError
          ? error
          : new WaybillStuckSourceError("UNAVAILABLE", true);
      if (!normalized.retryable || attempt === 3) throw normalized;
      await wait(250 * 2 ** (attempt - 1));
    }
  }
  throw new WaybillStuckSourceError("UNAVAILABLE");
}

export async function fetchInventoryDetail(
  businessDate: string,
  fetcher: typeof fetch = fetch,
  scope?: SettingsScope,
) {
  if (scope) {
    try {
      const envelope = await executeTrustedMultiOutletScraper(scope, "INVENTORY", {
        startDate: businessDate,
        endDate: businessDate,
        fetcher,
      });
      if (!envelope || typeof envelope !== "object" || envelope.success !== true || !Array.isArray(envelope.data)) {
        throw new WaybillStuckSourceError("INVALID_RESPONSE");
      }
      return (envelope.data as unknown[]).map(normalizeInventoryRecord);
    } catch (err) {
      if (err instanceof WaybillStuckSourceError) throw err;
      if (isSecurityFailure(err)) throw err;
      console.warn(`[MultiOutletFallback] INVENTORY multi-outlet fetch failed, falling back to legacy GET /jfs-inventory-detail:`, err instanceof Error ? err.message : err);
      // Fallback to legacy GET endpoint for unconfigured or degraded outlets
    }
  }

  const url = new URL(
    "/jfs-inventory-detail",
    process.env.JFS_MIDDLEWARE_URL ?? DEFAULT_BASE_URL,
  );
  for (const [key, value] of Object.entries({
    startDate: businessDate,
    endDate: businessDate,
    size: "500",
    maxPage: "500",
  })) url.searchParams.set(key, value);
  const response = await requestWithRetry(() =>
    fetcher(url, {
      headers: { accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    }),
  );
  let envelope: unknown;
  try { envelope = await response.json(); } catch { throw new WaybillStuckSourceError("INVALID_RESPONSE"); }
  if (!envelope || typeof envelope !== "object" || (envelope as { success?: unknown }).success !== true || !Array.isArray((envelope as { data?: unknown }).data)) {
    throw new WaybillStuckSourceError("INVALID_RESPONSE");
  }
  return (envelope as { data: unknown[] }).data.map(normalizeInventoryRecord);
}

export async function fetchWaybillStatusBatch(
  waybills: string[],
  businessDate: string,
  fetcher: typeof fetch = fetch,
  scope?: SettingsScope,
) {
  if (waybills.length > BATCH_SIZE) throw new Error("BATCH_LIMIT_EXCEEDED");
  if (scope) {
    try {
      const envelope = await executeTrustedMultiOutletScraper(scope, "WAYBILL_STATUS", {
        waybillList: waybills,
        startDate: businessDate,
        endDate: businessDate,
        fetcher,
      });
      if (!envelope || typeof envelope !== "object" || envelope.success !== true || !Array.isArray(envelope.data)) {
        throw new WaybillStuckSourceError("INVALID_RESPONSE");
      }
      return (envelope.data as unknown[]).map(normalizeWaybillStatusRecord);
    } catch (err) {
      if (err instanceof WaybillStuckSourceError) throw err;
      if (isSecurityFailure(err)) throw err;
      console.warn(`[MultiOutletFallback] WAYBILL_STATUS multi-outlet fetch failed, falling back to legacy POST /jfs-waybill-status-batch:`, err instanceof Error ? err.message : err);
      // Fallback to legacy POST endpoint for unconfigured or degraded outlets
    }
  }

  const response = await requestWithRetry(() =>
    fetcher(new URL("/jfs-waybill-status-batch", process.env.JFS_MIDDLEWARE_URL ?? DEFAULT_BASE_URL), {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({ waybills, startDate: businessDate, endDate: businessDate }),
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    }),
  );
  let envelope: unknown;
  try { envelope = await response.json(); } catch { throw new WaybillStuckSourceError("INVALID_RESPONSE"); }
  if (!envelope || typeof envelope !== "object" || (envelope as { success?: unknown }).success !== true || !Array.isArray((envelope as { data?: unknown }).data)) {
    throw new WaybillStuckSourceError("INVALID_RESPONSE");
  }
  return (envelope as { data: unknown[] }).data.map(
    normalizeWaybillStatusRecord,
  );
}

async function syncWaybillStuckDeliveryCore(input: {
  tenantId: string;
  outletId: string;
  actorId: string;
  businessDate: string;
  fetchInventory?: typeof fetchInventoryDetail;
  fetchStatus?: typeof fetchWaybillStatusBatch;
  scope?: SettingsScope;
}) {
  const startedAt = new Date();
  const scope: SettingsScope = input.scope ?? { tenantId: input.tenantId, outletId: input.outletId };

  const inventory = input.fetchInventory
    ? await input.fetchInventory(input.businessDate)
    : await fetchInventoryDetail(input.businessDate, fetch, scope);

  const uniqueWaybills = [...new Set(inventory.map((record) => record.billCode))];
  const statusRecords: StatusRecord[] = [];
  let failedBatches = 0;
  for (const batch of chunks(uniqueWaybills, BATCH_SIZE)) {
    try {
      if (input.fetchStatus) {
        statusRecords.push(...await input.fetchStatus(batch, input.businessDate));
      } else {
        statusRecords.push(...await fetchWaybillStatusBatch(batch, input.businessDate, fetch, scope));
      }
    } catch {
      failedBatches += 1;
    }
  }
  const businessDate = new Date(`${input.businessDate}T00:00:00.000Z`);
  let inventoryCreated = 0;
  let inventoryUpdated = 0;
  let statusCreated = 0;
  let statusUpdated = 0;
  await prisma.$transaction(async (tx) => {
    for (const record of inventory) {
      const sourceRecordKey = `inventory:${record.billCode}`;
      const unique = { tenantId: input.tenantId, outletId: input.outletId, businessDate, sourceRecordKey };
      const existing = await tx.rawInventoryDetail.findUnique({
        where: { tenantId_outletId_businessDate_sourceRecordKey: unique },
        select: { id: true },
      });
      await tx.rawInventoryDetail.upsert({
        where: { tenantId_outletId_businessDate_sourceRecordKey: unique },
        create: { ...unique, ...record, sourceHash: hash(record), syncedAt: startedAt },
        update: { ...record, sourceHash: hash(record), syncedAt: startedAt },
      });
      if (existing) inventoryUpdated += 1;
      else inventoryCreated += 1;
    }
    for (const record of statusRecords) {
      const identity = record.recordId || record.currentScanTime || "latest";
      const sourceRecordKey = `status:${record.sourceWaybill}:${identity}`;
      const unique = { tenantId: input.tenantId, outletId: input.outletId, businessDate, sourceRecordKey };
      const existing = await tx.rawWaybillStatus.findUnique({
        where: { tenantId_outletId_businessDate_sourceRecordKey: unique },
        select: { id: true },
      });
      const data = {
        sourceWaybill: record.sourceWaybill,
        currentScanSite: record.currentScanSite,
        currentScanTime: record.currentScanTime,
        currentScanType: record.currentScanType,
        scanType: record.scanType,
        problemReason: record.problemReason,
        isVoid: record.isVoid,
        statusFound: record.statusFound,
        sourceHash: hash(record),
        syncedAt: startedAt,
      };
      await tx.rawWaybillStatus.upsert({
        where: { tenantId_outletId_businessDate_sourceRecordKey: unique },
        create: { ...unique, ...data },
        update: data,
      });
      if (existing) statusUpdated += 1;
      else statusCreated += 1;
    }
  }, { maxWait: 10_000, timeout: 120_000, isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
  const result = failedBatches ? "PARTIAL_SUCCESS" : "SUCCESS";
  await prisma.auditLog.create({
    data: {
      tenantId: input.tenantId,
      outletId: input.outletId,
      actorId: input.actorId,
      action: "CREATE",
      entityType: "WAYBILL_STUCK_DELIVERY_SYNC",
      metadata: {
        businessDate: input.businessDate,
        inventoryCount: inventory.length,
        statusCount: statusRecords.length,
        failedBatches,
        result,
      },
    },
  });
  return {
    success: true,
    result,
    inventory: { fetched: inventory.length, created: inventoryCreated, updated: inventoryUpdated },
    status: { fetched: statusRecords.length, created: statusCreated, updated: statusUpdated },
    uniqueWaybills: uniqueWaybills.length,
    failedBatches,
  };
}

export async function syncWaybillStuckDelivery(
  input: Parameters<typeof syncWaybillStuckDeliveryCore>[0],
) {
  try {
    return await syncWaybillStuckDeliveryCore(input);
  } catch (error) {
    await prisma.auditLog.create({
      data: {
        tenantId: input.tenantId,
        outletId: input.outletId,
        actorId: input.actorId,
        action: "CREATE",
        entityType: "WAYBILL_STUCK_DELIVERY_SYNC",
        metadata: {
          businessDate: input.businessDate,
          inventoryCount: 0,
          statusCount: 0,
          result: "FAILED",
        },
      },
    });
    throw error;
  }
}

export { BATCH_SIZE };
