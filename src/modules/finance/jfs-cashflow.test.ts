import { readFile } from "node:fs/promises";
import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  aggregateJfsCashflowRecords,
  fetchJfsCashflow,
  JfsCashflowError,
  normalizeIbkRecord,
  readJfsCashflow,
  resetJfsCashflowLocks,
  runJfsCashflowSync,
  summarizeJfsCashflow,
} from "./jfs-cashflow.service";

const memory = {
  runs: [] as Array<Record<string, unknown>>,
  records: new Map<string, Record<string, unknown>>(),
  audits: [] as Array<Record<string, unknown>>,
  locks: new Map<string, string>(),
};

function store() {
  const value = {
    jfsCashflowSyncLock: {
      createMany: vi.fn(async ({ data }: { data: Array<Record<string, unknown>> }) => {
        let count = 0;
        for (const row of data) {
          const key = `${row.tenantId}:${row.outletId}:${(row.businessDate as Date).toISOString().slice(0, 10)}`;
          if (memory.locks.has(key)) continue;
          memory.locks.set(key, row.requestId as string);
          count += 1;
        }
        return { count };
      }),
      deleteMany: vi.fn(async ({ where }: { where: { requestId: string } }) => {
        for (const [key, requestId] of memory.locks) if (requestId === where.requestId) memory.locks.delete(key);
        return { count: 1 };
      }),
    },
    jfsCashflowSyncRun: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `run-${memory.runs.length + 1}`, ...data };
        memory.runs.push(row);
        return row;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = memory.runs.find((item) => item.id === where.id)!;
        Object.assign(row, data);
        return row;
      }),
      findFirst: vi.fn(async ({ where }: { where: { tenantId: string; outletId: string } }) =>
        [...memory.runs].reverse().find((item) =>
          item.tenantId === where.tenantId && item.outletId === where.outletId) || null),
    },
    jfsCashflowRecord: {
      findUnique: vi.fn(async ({ where }: { where: { tenantId_outletId_sourceRecordKey: Record<string, string> } }) => {
        const key = Object.values(where.tenantId_outletId_sourceRecordKey).join(":");
        const row = memory.records.get(key);
        return row ? { id: row.id as string, sourcePayloadHash: row.sourcePayloadHash as string } : null;
      }),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const key = `${data.tenantId}:${data.outletId}:${data.sourceRecordKey}`;
        const row = { id: `record-${memory.records.size + 1}`, ...data };
        memory.records.set(key, row);
        return row;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const entry = [...memory.records.entries()].find(([, row]) => row.id === where.id)!;
        Object.assign(entry[1], data);
        return entry[1];
      }),
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const range = where.businessDate as { gte: Date; lte: Date };
        return [...memory.records.values()].filter((row) =>
          row.tenantId === where.tenantId && row.outletId === where.outletId
          && (row.businessDate as Date) >= range.gte && (row.businessDate as Date) <= range.lte);
      }),
    },
    auditLog: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        memory.audits.push(data); return data;
      }),
    },
    transaction: vi.fn(async (callback: (tx: unknown) => Promise<void>) => callback(value)),
  };
  return value;
}

function sourceRecord(amount = 100, date = "2026-08-01") {
  return normalizeIbkRecord({
    networkName: "OUT001", tradeType: 1, feeTypeName: "Income",
    feeItemTypeName: "Setoran", date, amount,
  })!;
}

function sourceResult(records = [sourceRecord()]) {
  return {
    records,
    fetchedCount: records.length,
    anomalyCount: 0,
    ...summarizeJfsCashflow(records),
    receivedAt: "2026-08-01T16:00:00.000Z",
  };
}

beforeEach(() => {
  memory.runs = [];
  memory.records.clear();
  memory.audits = [];
  memory.locks.clear();
  resetJfsCashflowLocks();
  process.env.JFS_MIDDLEWARE_BASE_URL = "https://middleware.example.test";
});

describe("JFS Cashflow source contract", () => {
  it("normalizes actual IBK fields and creates deterministic source identity", () => {
    const first = sourceRecord(100);
    const changed = sourceRecord(125);
    expect(first).toMatchObject({
      date: "2026-08-01", direction: "income", transactionType: "Setoran",
      category: "Income", amount: 100, sourceReference: "OUT001",
    });
    expect(first.sourceRecordKey).toBe(changed.sourceRecordKey);
    expect(first.sourcePayloadHash).not.toBe(changed.sourcePayloadHash);
  });

  it("aggregates same-day source rows without losing their amounts", () => {
    const aggregated = aggregateJfsCashflowRecords([sourceRecord(100), sourceRecord(50)]);
    expect(aggregated).toHaveLength(1);
    expect(aggregated[0].amount).toBe(150);
  });

  it("requests the actual middleware range with no-store and retries one transient error", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response("", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, data: [] })));
    await fetchJfsCashflow({
      startDate: "2026-08-01", endDate: "2026-08-01", fetcher, wait: vi.fn(async () => undefined),
    });
    const [url, init] = fetcher.mock.calls[1] as unknown as [URL, RequestInit];
    expect(url.pathname).toBe("/jfs-ibk-report");
    expect(url.searchParams.get("startDate")).toBe("2026-08-01");
    expect(url.searchParams.get("endDate")).toBe("2026-08-01");
    expect(init.cache).toBe("no-store");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("does not retry invalid responses or permanent HTTP errors", async () => {
    const invalid = vi.fn(async () => new Response("{}"));
    await expect(fetchJfsCashflow({
      startDate: "2026-08-01", endDate: "2026-08-01", fetcher: invalid,
    })).rejects.toEqual(new JfsCashflowError("INVALID_RESPONSE"));
    expect(invalid).toHaveBeenCalledOnce();
    const unauthorized = vi.fn(async () => new Response("", { status: 401 }));
    await expect(fetchJfsCashflow({
      startDate: "2026-08-01", endDate: "2026-08-01", fetcher: unauthorized,
    })).rejects.toMatchObject({ code: "SOURCE_UNAVAILABLE", retryable: false });
    expect(unauthorized).toHaveBeenCalledOnce();
  });

  it("rejects inconsistent middleware totals and date ranges", async () => {
    const inconsistentTotal = vi.fn(async () => new Response(JSON.stringify({
      success: true, total: 2, startDate: "2026-08-01", endDate: "2026-08-01", data: [],
    })));
    await expect(fetchJfsCashflow({
      startDate: "2026-08-01", endDate: "2026-08-01", fetcher: inconsistentTotal,
    })).rejects.toEqual(new JfsCashflowError("INVALID_RESPONSE"));
    expect(inconsistentTotal).toHaveBeenCalledOnce();

    const inconsistentRange = vi.fn(async () => new Response(JSON.stringify({
      success: true, total: 0, startDate: "2026-07-31", endDate: "2026-08-01", data: [],
    })));
    await expect(fetchJfsCashflow({
      startDate: "2026-08-01", endDate: "2026-08-01", fetcher: inconsistentRange,
    })).rejects.toEqual(new JfsCashflowError("INVALID_RESPONSE"));
    expect(inconsistentRange).toHaveBeenCalledOnce();
  });
});

describe("JFS Cashflow persistence", () => {
  it("stores Decimal, scope, business date, and run links", async () => {
    const db = store();
    const result = await runJfsCashflowSync({
      tenantId: "tenant-1", outletId: "outlet-1", actorId: "user-1",
      startDate: "2026-08-01", endDate: "2026-08-01", triggerSource: "MANUAL",
      store: db as never, fetchSource: vi.fn(async () => sourceResult()),
      now: () => new Date("2026-08-01T16:00:00.000Z"), requestId: "request-1",
    });
    expect(result).toMatchObject({ fetchedCount: 1, createdCount: 1, updatedCount: 0 });
    const record = [...memory.records.values()][0];
    expect(record).toMatchObject({ tenantId: "tenant-1", outletId: "outlet-1" });
    expect((record.businessDate as Date).toISOString()).toContain("2026-08-01");
    expect(Prisma.Decimal.isDecimal(record.amount)).toBe(true);
    expect(record.firstSeenRunId).toBe("run-1");
    expect(memory.runs[0]).toMatchObject({ status: "SUCCESS", triggerSource: "MANUAL" });
  });

  it("is idempotent and updates changed source without deleting history", async () => {
    const db = store();
    const input = {
      tenantId: "tenant-1", outletId: "outlet-1",
      startDate: "2026-08-01", endDate: "2026-08-01", triggerSource: "MANUAL" as const,
      store: db as never, now: () => new Date("2026-08-01T16:00:00.000Z"),
    };
    await runJfsCashflowSync({ ...input, requestId: "one", fetchSource: vi.fn(async () => sourceResult()) });
    const second = await runJfsCashflowSync({ ...input, requestId: "two", fetchSource: vi.fn(async () => sourceResult()) });
    expect(second).toMatchObject({ createdCount: 0, updatedCount: 0, skippedCount: 1 });
    const third = await runJfsCashflowSync({ ...input, requestId: "three", fetchSource: vi.fn(async () => sourceResult([sourceRecord(125)])) });
    expect(third).toMatchObject({ createdCount: 0, updatedCount: 1 });
    expect(memory.records.size).toBe(1);
    expect(memory.runs).toHaveLength(3);
    const record = [...memory.records.values()][0];
    expect(Number(record.amount)).toBe(125);
    expect(record.firstSeenRunId).toBe("run-1");
    expect(record.lastSeenRunId).toBe("run-3");
  });

  it("isolates tenant, outlet, and date reads while preserving empty success", async () => {
    const db = store();
    for (const [tenantId, outletId, date, requestId] of [
      ["tenant-1", "outlet-1", "2026-08-01", "one"],
      ["tenant-2", "outlet-1", "2026-08-01", "two"],
      ["tenant-1", "outlet-2", "2026-08-01", "three"],
      ["tenant-1", "outlet-1", "2026-08-02", "four"],
    ]) {
      await runJfsCashflowSync({
        tenantId, outletId, startDate: date, endDate: date, requestId,
        triggerSource: "MANUAL", store: db as never,
        fetchSource: vi.fn(async () => sourceResult([sourceRecord(100, date)])),
      });
    }
    const result = await readJfsCashflow({
      tenantId: "tenant-1", outletId: "outlet-1",
      startDate: "2026-08-01", endDate: "2026-08-01", store: db as never,
    });
    expect(result.summary).toEqual({ totalIncome: 100, totalExpense: 0, difference: 100 });
    const empty = await runJfsCashflowSync({
      tenantId: "tenant-1", outletId: "outlet-1",
      startDate: "2026-08-03", endDate: "2026-08-03", triggerSource: "MANUAL",
      requestId: "empty", store: db as never, fetchSource: vi.fn(async () => sourceResult([])),
    });
    expect(empty).toMatchObject({ fetchedCount: 0, createdCount: 0 });
    expect(memory.records.size).toBe(4);
  });

  it("records safe failure and keeps existing records", async () => {
    const db = store();
    await runJfsCashflowSync({
      tenantId: "tenant-1", outletId: "outlet-1", startDate: "2026-08-01", endDate: "2026-08-01",
      triggerSource: "MANUAL", requestId: "one", store: db as never,
      fetchSource: vi.fn(async () => sourceResult()),
    });
    await expect(runJfsCashflowSync({
      tenantId: "tenant-1", outletId: "outlet-1", startDate: "2026-08-01", endDate: "2026-08-01",
      triggerSource: "CRON", requestId: "failed", store: db as never,
      fetchSource: vi.fn(async () => { throw new JfsCashflowError("INVALID_RESPONSE"); }),
    })).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    expect(memory.records.size).toBe(1);
    expect(memory.runs.at(-1)).toMatchObject({ status: "FAILED", errorCode: "INVALID_RESPONSE" });
    expect(JSON.stringify(memory.audits)).not.toMatch(/password|authtoken|cookie/i);
  });

  it("locks overlapping manual and cron dates", async () => {
    const db = store();
    let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    const first = runJfsCashflowSync({
      tenantId: "tenant-1", outletId: "outlet-1", startDate: "2026-08-01", endDate: "2026-08-02",
      triggerSource: "MANUAL", store: db as never,
      fetchSource: vi.fn(async () => { await pending; return sourceResult(); }),
    });
    await vi.waitFor(() => expect(memory.runs).toHaveLength(1));
    await expect(runJfsCashflowSync({
      tenantId: "tenant-1", outletId: "outlet-1", startDate: "2026-08-02", endDate: "2026-08-02",
      triggerSource: "CRON", store: db as never, fetchSource: vi.fn(),
    })).rejects.toMatchObject({ code: "ALREADY_RUNNING" });
    release();
    await first;
  });

  it("uses a database-backed date lock across service processes", async () => {
    const db = store();
    memory.locks.set("tenant-1:outlet-1:2026-08-01", "other-process");
    await expect(runJfsCashflowSync({
      tenantId: "tenant-1", outletId: "outlet-1", startDate: "2026-08-01", endDate: "2026-08-01",
      triggerSource: "CRON", store: db as never, fetchSource: vi.fn(),
    })).rejects.toMatchObject({ code: "ALREADY_RUNNING" });
    expect(memory.runs).toHaveLength(0);
    expect(memory.locks.get("tenant-1:outlet-1:2026-08-01")).toBe("other-process");
  });
});

describe("JFS Cashflow UI and route contracts", () => {
  it("reads stored data on load/filter, syncs only on CEK, and exports stored data", async () => {
    const [ui, checkRoute, exportRoute] = await Promise.all([
      readFile(new URL("../../components/finance/jfs-cashflow-client.tsx", import.meta.url), "utf8"),
      readFile(new URL("../../app/api/finance/cashflow-jfs/check/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../../app/api/finance/cashflow-jfs/export/route.ts", import.meta.url), "utf8"),
    ]);
    expect(ui).toContain("useEffect");
    expect(ui).toContain("readStored");
    expect(ui).toContain('loading ? "Checking..." : "CEK"');
    expect(checkRoute).toContain("runJfsCashflowSync");
    expect(checkRoute).toContain("readJfsCashflow");
    expect(exportRoute).toContain("readJfsCashflow");
    expect(exportRoute).not.toContain("fetchJfsCashflow");
    expect(ui).not.toMatch(/window\.(alert|confirm|prompt)/);
  });
});
