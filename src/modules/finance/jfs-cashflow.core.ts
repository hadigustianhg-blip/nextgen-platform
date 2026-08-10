import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { executeTrustedMultiOutletScraper, isSecurityFailure } from "@/modules/integrations/jfs-multi-outlet-client";
import type { SettingsScope } from "@/modules/settings/settings.types";

export type JfsCashflowDirection = "income" | "expense";
export type JfsCashflowSourceRecord = {
  date: string;
  direction: JfsCashflowDirection;
  transactionType: string;
  category: string;
  amount: number;
  sourceReference: string | null;
  sourceRecordKey: string;
  sourcePayloadHash: string;
};
export type JfsCashflowTriggerSource = "MANUAL" | "CRON";

type StoredRecord = {
  direction: string;
  transactionType: string;
  amount: unknown;
};

export class JfsCashflowError extends Error {
  constructor(
    public readonly code: "SOURCE_UNAVAILABLE" | "INVALID_RESPONSE" | "ALREADY_RUNNING" | "MIDDLEWARE_NOT_CONFIGURED",
    public readonly retryable = false,
  ) {
    super(code);
  }
}

const locks = new Set<string>();
const transientStatuses = new Set([502, 503, 504]);
const sleep = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const dateOnly = (value: string) => new Date(`${value}T00:00:00.000Z`);

function direction(value: unknown): JfsCashflowDirection | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (value === 1 || ["1", "income", "credit", "kredit", "pemasukan"].includes(normalized)) return "income";
  if (value === 2 || ["2", "expense", "debit", "pengeluaran"].includes(normalized)) return "expense";
  return null;
}

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";

export function normalizeIbkRecord(value: unknown): JfsCashflowSourceRecord | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const recordDirection = direction(raw.tradeType);
  const sourceAmount = Number(raw.amount);
  const date = text(raw.date).slice(0, 10);
  if (
    !recordDirection || !Number.isFinite(sourceAmount) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(dateOnly(date).valueOf())
  ) return null;
  const transactionType = text(raw.feeItemTypeName) || text(raw.feeTypeName) || "Lainnya";
  const category = text(raw.feeTypeName) || transactionType;
  const sourceReference = text(raw.networkName) || null;
  const amount = Math.abs(sourceAmount);
  const identity = [sourceReference || "", recordDirection, category, transactionType, date].join("|");
  const payload = JSON.stringify({ sourceReference, recordDirection, category, transactionType, date, amount });
  return {
    date,
    direction: recordDirection,
    transactionType,
    category,
    amount,
    sourceReference,
    sourceRecordKey: hash(identity),
    sourcePayloadHash: hash(payload),
  };
}

function summarize(records: StoredRecord[], directionValue: JfsCashflowDirection) {
  const totals = new Map<string, Prisma.Decimal>();
  for (const record of records) {
    if (record.direction !== directionValue) continue;
    const amount = new Prisma.Decimal(record.amount as Prisma.Decimal.Value);
    totals.set(record.transactionType, (totals.get(record.transactionType) || new Prisma.Decimal(0)).plus(amount));
  }
  return [...totals.entries()]
    .map(([transactionType, total]) => ({ transactionType, total: total.toNumber() }))
    .sort((a, b) => b.total - a.total);
}

export function summarizeJfsCashflow(records: StoredRecord[]) {
  const income = summarize(records, "income");
  const expense = summarize(records, "expense");
  const totalIncome = income.reduce((sum, row) => sum.plus(row.total), new Prisma.Decimal(0));
  const totalExpense = expense.reduce((sum, row) => sum.plus(row.total), new Prisma.Decimal(0));
  return {
    income,
    expense,
    summary: {
      totalIncome: totalIncome.toNumber(),
      totalExpense: totalExpense.toNumber(),
      difference: totalIncome.minus(totalExpense).toNumber(),
    },
  };
}

export function aggregateJfsCashflowRecords(records: JfsCashflowSourceRecord[]) {
  const aggregated = new Map<string, JfsCashflowSourceRecord>();
  for (const record of records) {
    const existing = aggregated.get(record.sourceRecordKey);
    const amount = new Prisma.Decimal(existing?.amount || 0).plus(record.amount).toNumber();
    const next = { ...record, amount };
    next.sourcePayloadHash = hash(JSON.stringify({
      sourceReference: next.sourceReference,
      recordDirection: next.direction,
      category: next.category,
      transactionType: next.transactionType,
      date: next.date,
      amount,
    }));
    aggregated.set(record.sourceRecordKey, next);
  }
  return [...aggregated.values()];
}

export async function fetchJfsCashflow(input: {
  startDate: string;
  endDate: string;
  fetcher?: typeof fetch;
  wait?: (milliseconds: number) => Promise<unknown>;
  scope?: SettingsScope;
}) {
  const isSum001a = !input.scope || input.scope.outletId === "SUM001A" || process.env.USE_MULTI_OUTLET_SUM001A !== "true";

  if (input.scope && !isSum001a) {
    try {
      const result = await executeTrustedMultiOutletScraper(input.scope, "IBK", {
        startDate: input.startDate,
        endDate: input.endDate,
        fetcher: input.fetcher,
      });

      const dataArray = Array.isArray(result.data) ? result.data : [];
      const normalized = dataArray.map(normalizeIbkRecord);
      const records = normalized.filter((record: JfsCashflowSourceRecord | null): record is JfsCashflowSourceRecord => Boolean(
        record && record.date >= input.startDate && record.date <= input.endDate,
      ));
      return {
        records,
        fetchedCount: dataArray.length,
        anomalyCount: normalized.length - records.length,
        ...summarizeJfsCashflow(records),
        receivedAt: new Date().toISOString(),
      };
    } catch (err) {
      if (err instanceof JfsCashflowError) throw err;
      if (isSecurityFailure(err)) throw err;
      console.warn(`[MultiOutletFallback] IBK multi-outlet fetch failed, falling back to legacy GET /jfs-ibk-report:`, err instanceof Error ? err.message : err);
      // Fallback to legacy GET for unconfigured or degraded outlets
    }
  }

  const baseUrl = process.env.JFS_MIDDLEWARE_BASE_URL?.trim()
    || process.env.JFS_MIDDLEWARE_URL?.trim();
  if (!baseUrl) throw new JfsCashflowError("MIDDLEWARE_NOT_CONFIGURED");
  const url = new URL("/jfs-ibk-report", baseUrl);
  url.searchParams.set("startDate", input.startDate);
  url.searchParams.set("endDate", input.endDate);
  const fetcher = input.fetcher || fetch;
  const wait = input.wait || sleep;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const response = await fetcher(url, {
        cache: "no-store",
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) {
        throw new JfsCashflowError("SOURCE_UNAVAILABLE", transientStatuses.has(response.status));
      }
      const body = await response.json().catch(() => null) as
        | { success?: boolean; data?: unknown[]; total?: unknown; startDate?: unknown; endDate?: unknown }
        | null;
      if (body?.success !== true || !Array.isArray(body.data)) {
        throw new JfsCashflowError("INVALID_RESPONSE", false);
      }
      const declaredTotal = Number(body.total);
      if (
        (body.total !== undefined && (!Number.isSafeInteger(declaredTotal) || declaredTotal !== body.data.length)) ||
        (body.startDate !== undefined && body.startDate !== input.startDate) ||
        (body.endDate !== undefined && body.endDate !== input.endDate)
      ) {
        throw new JfsCashflowError("INVALID_RESPONSE", false);
      }
      const normalized = body.data.map(normalizeIbkRecord);
      const records = normalized.filter((record): record is JfsCashflowSourceRecord => Boolean(
        record && record.date >= input.startDate && record.date <= input.endDate,
      ));
      return {
        records,
        fetchedCount: body.data.length,
        anomalyCount: normalized.length - records.length,
        ...summarizeJfsCashflow(records),
        receivedAt: new Date().toISOString(),
      };
    } catch (error) {
      const normalized = error instanceof JfsCashflowError
        ? error
        : new JfsCashflowError("SOURCE_UNAVAILABLE", true);
      if (!normalized.retryable || attempt === 2) throw normalized;
      await wait(250);
    }
  }
  throw new JfsCashflowError("SOURCE_UNAVAILABLE");
}

type CashflowStore = {
  jfsCashflowSyncLock: {
    createMany(args: { data: Array<Record<string, unknown>>; skipDuplicates: boolean }): Promise<{ count: number }>;
    deleteMany(args: { where: { requestId: string } }): Promise<unknown>;
  };
  jfsCashflowSyncRun: {
    create(args: { data: Record<string, unknown> }): Promise<{ id: string }>;
    update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<unknown>;
    findFirst(args: Record<string, unknown>): Promise<Record<string, unknown> | null>;
  };
  jfsCashflowRecord: {
    findUnique(args: Record<string, unknown>): Promise<{ id: string; sourcePayloadHash: string } | null>;
    create(args: { data: Record<string, unknown> }): Promise<unknown>;
    update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<unknown>;
    findMany(args: Record<string, unknown>): Promise<StoredRecord[]>;
  };
  auditLog: { create(args: { data: Record<string, unknown> }): Promise<unknown> };
  transaction(callback: (store: CashflowStore) => Promise<void>): Promise<void>;
};

function prismaStore(): CashflowStore {
  const client = prisma as unknown as Omit<CashflowStore, "transaction"> & {
    $transaction(callback: (store: CashflowStore) => Promise<void>): Promise<void>;
  };
  return {
    jfsCashflowSyncLock: client.jfsCashflowSyncLock,
    jfsCashflowSyncRun: client.jfsCashflowSyncRun,
    jfsCashflowRecord: client.jfsCashflowRecord,
    auditLog: client.auditLog,
    transaction: (callback) => client.$transaction(callback),
  };
}

function rangeDates(startDate: string, endDate: string) {
  const dates: string[] = [];
  for (let current = dateOnly(startDate); current <= dateOnly(endDate); current = new Date(current.valueOf() + 86_400_000)) {
    dates.push(current.toISOString().slice(0, 10));
  }
  return dates;
}

function acquireLocks(tenantId: string, outletId: string, startDate: string, endDate: string) {
  const keys = rangeDates(startDate, endDate).map((date) => `${tenantId}:${outletId}:${date}`);
  if (keys.some((key) => locks.has(key))) throw new JfsCashflowError("ALREADY_RUNNING");
  keys.forEach((key) => locks.add(key));
  return () => keys.forEach((key) => locks.delete(key));
}

export async function runJfsCashflowSync(input: {
  tenantId: string;
  outletId: string;
  actorId?: string;
  startDate: string;
  endDate: string;
  triggerSource: JfsCashflowTriggerSource;
  requestId?: string;
  store?: CashflowStore;
  fetchSource?: typeof fetchJfsCashflow;
  now?: () => Date;
}) {
  const release = acquireLocks(input.tenantId, input.outletId, input.startDate, input.endDate);
  const store = input.store || prismaStore();
  const now = input.now || (() => new Date());
  const requestId = input.requestId || randomUUID();
  const startedAt = now();
  let runId: string | null = null;
  let databaseLockAcquired = false;
  try {
    const dates = rangeDates(input.startDate, input.endDate);
    await store.transaction(async (tx) => {
      const result = await tx.jfsCashflowSyncLock.createMany({
        data: dates.map((date) => ({
          tenantId: input.tenantId,
          outletId: input.outletId,
          businessDate: dateOnly(date),
          requestId,
          acquiredAt: startedAt,
        })),
        skipDuplicates: true,
      });
      if (result.count !== dates.length) throw new JfsCashflowError("ALREADY_RUNNING");
    });
    databaseLockAcquired = true;
    const run = await store.jfsCashflowSyncRun.create({ data: {
      tenantId: input.tenantId,
      outletId: input.outletId,
      periodStart: dateOnly(input.startDate),
      periodEnd: dateOnly(input.endDate),
      triggerSource: input.triggerSource,
      status: "RUNNING",
      startedAt,
      requestId,
    } });
    runId = run.id;
    await store.auditLog.create({ data: {
      tenantId: input.tenantId, outletId: input.outletId, actorId: input.actorId || null,
      action: "CREATE", entityType: "CASHFLOW_JFS_SYNC_REQUESTED", entityId: runId,
      metadata: { requestId, startDate: input.startDate, endDate: input.endDate, triggerSource: input.triggerSource },
    } });

    const source = await (input.fetchSource || fetchJfsCashflow)({
      startDate: input.startDate,
      endDate: input.endDate,
    });
    const uniqueRecords = aggregateJfsCashflowRecords(source.records);
    let createdCount = 0;
    let updatedCount = 0;
    let skippedCount = source.records.length - uniqueRecords.length;
    const fetchedAt = now();

    await store.transaction(async (tx) => {
      for (const record of uniqueRecords) {
        const existing = await tx.jfsCashflowRecord.findUnique({
          where: { tenantId_outletId_sourceRecordKey: {
            tenantId: input.tenantId,
            outletId: input.outletId,
            sourceRecordKey: record.sourceRecordKey,
          } },
          select: { id: true, sourcePayloadHash: true },
        });
        const data = {
          businessDate: dateOnly(record.date),
          direction: record.direction,
          transactionType: record.transactionType,
          category: record.category,
          amount: new Prisma.Decimal(record.amount),
          sourceReference: record.sourceReference,
          sourcePayloadHash: record.sourcePayloadHash,
          lastSeenRunId: runId,
          fetchedAt,
        };
        if (!existing) {
          await tx.jfsCashflowRecord.create({ data: {
            tenantId: input.tenantId,
            outletId: input.outletId,
            sourceRecordKey: record.sourceRecordKey,
            firstSeenRunId: runId,
            ...data,
          } });
          createdCount += 1;
        } else {
          await tx.jfsCashflowRecord.update({ where: { id: existing.id }, data });
          if (existing.sourcePayloadHash === record.sourcePayloadHash) skippedCount += 1;
          else updatedCount += 1;
        }
      }
    });

    const completedAt = now();
    const counts = {
      fetchedCount: source.fetchedCount,
      uniqueCount: uniqueRecords.length,
      createdCount,
      updatedCount,
      skippedCount,
      anomalyCount: source.anomalyCount,
    };
    await store.jfsCashflowSyncRun.update({
      where: { id: runId },
      data: { status: "SUCCESS", completedAt, ...counts },
    });
    await store.auditLog.create({ data: {
      tenantId: input.tenantId, outletId: input.outletId, actorId: input.actorId || null,
      action: "CREATE", entityType: "CASHFLOW_JFS_SYNC_COMPLETED", entityId: runId,
      metadata: { requestId, startDate: input.startDate, endDate: input.endDate, triggerSource: input.triggerSource, ...counts },
    } });
    return { success: true, requestId, syncRunId: runId, completedAt: completedAt.toISOString(), ...counts };
  } catch (error) {
    const code = error instanceof JfsCashflowError ? error.code : "SOURCE_UNAVAILABLE";
    if (runId) {
      await store.jfsCashflowSyncRun.update({
        where: { id: runId },
        data: { status: "FAILED", completedAt: now(), errorCode: code },
      });
      await store.auditLog.create({ data: {
        tenantId: input.tenantId, outletId: input.outletId, actorId: input.actorId || null,
        action: "UPDATE", entityType: "CASHFLOW_JFS_SYNC_FAILED", entityId: runId,
        metadata: { requestId, startDate: input.startDate, endDate: input.endDate, triggerSource: input.triggerSource, errorCode: code },
      } });
    }
    throw error;
  } finally {
    if (databaseLockAcquired) {
      await store.jfsCashflowSyncLock.deleteMany({ where: { requestId } }).catch(() => undefined);
    }
    release();
  }
}

export async function readJfsCashflow(input: {
  tenantId: string;
  outletId: string;
  startDate: string;
  endDate: string;
  store?: CashflowStore;
}) {
  const store = input.store || prismaStore();
  const [records, lastSync, lastSuccessfulSync] = await Promise.all([
    store.jfsCashflowRecord.findMany({
      where: {
        tenantId: input.tenantId,
        outletId: input.outletId,
        businessDate: { gte: dateOnly(input.startDate), lte: dateOnly(input.endDate) },
      },
      select: { direction: true, transactionType: true, amount: true },
      orderBy: [{ businessDate: "asc" }, { transactionType: "asc" }],
    }),
    store.jfsCashflowSyncRun.findFirst({
      where: { tenantId: input.tenantId, outletId: input.outletId },
      orderBy: { startedAt: "desc" },
      select: {
        status: true, triggerSource: true, periodStart: true, periodEnd: true,
        completedAt: true, fetchedCount: true, createdCount: true,
        updatedCount: true, skippedCount: true, errorCode: true,
      },
    }),
    store.jfsCashflowSyncRun.findFirst({
      where: { tenantId: input.tenantId, outletId: input.outletId, status: "SUCCESS" },
      orderBy: { completedAt: "desc" },
      select: { completedAt: true },
    }),
  ]);
  return {
    ...summarizeJfsCashflow(records),
    receivedAt: lastSuccessfulSync?.completedAt instanceof Date
      ? lastSuccessfulSync.completedAt.toISOString()
      : "",
    lastSync: lastSync ? {
      ...lastSync,
      periodStart: lastSync.periodStart instanceof Date ? lastSync.periodStart.toISOString().slice(0, 10) : lastSync.periodStart,
      periodEnd: lastSync.periodEnd instanceof Date ? lastSync.periodEnd.toISOString().slice(0, 10) : lastSync.periodEnd,
      completedAt: lastSync.completedAt instanceof Date ? lastSync.completedAt.toISOString() : lastSync.completedAt,
    } : null,
  };
}

export function resetJfsCashflowLocks() {
  locks.clear();
}
