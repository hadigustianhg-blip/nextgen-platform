/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from "vitest";
import fixture from "./__fixtures__/pickup.json";

vi.mock("server-only", () => ({}));

const memory = vi.hoisted(() => ({
  runs: [] as Array<Record<string, any>>,
  raws: [] as Array<Record<string, any>>,
  masters: [] as Array<Record<string, any>>,
  audits: [] as Array<Record<string, any>>,
  runSequence: 0,
  rawSequence: 0,
  masterSequence: 0,
}));

function matchesText(value: unknown, filter: unknown) {
  if (!filter || typeof filter !== "object" || !("contains" in filter)) return true;
  return String(value ?? "").toLowerCase().includes(String((filter as { contains: string }).contains).toLowerCase());
}

const tx = {
  rawPickup: {
    findUnique: vi.fn(async ({ where }: any) => {
      const key = where.tenantId_outletId_sourceRecordKey;
      return memory.raws.find((row) =>
        row.tenantId === key.tenantId &&
        row.outletId === key.outletId &&
        row.sourceRecordKey === key.sourceRecordKey,
      ) ?? null;
    }),
    create: vi.fn(async ({ data }: any) => {
      const now = new Date();
      const row = { id: `raw-${++memory.rawSequence}`, createdAt: now, updatedAt: now, ...data };
      memory.raws.push(row);
      return row;
    }),
    update: vi.fn(async ({ where, data }: any) => {
      const row = memory.raws.find((item) => item.id === where.id);
      if (!row) throw new Error("RAW_NOT_FOUND");
      Object.assign(row, data, { updatedAt: new Date() });
      return row;
    }),
  },
  masterPickup: {
    upsert: vi.fn(async ({ where, create, update }: any) => {
      const key = where.tenantId_outletId_waybillNo;
      const existing = memory.masters.find((row) =>
        row.tenantId === key.tenantId &&
        row.outletId === key.outletId &&
        row.waybillNo === key.waybillNo,
      );
      if (existing) {
        Object.assign(existing, update, { updatedAt: new Date() });
        return existing;
      }
      const row = { id: `master-${++memory.masterSequence}`, createdAt: new Date(), updatedAt: new Date(), ...create };
      memory.masters.push(row);
      return row;
    }),
  },
};

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    syncRun: {
      create: vi.fn(async ({ data }: any) => {
        const row = { id: `run-${++memory.runSequence}`, createdAt: new Date(), updatedAt: new Date(), ...data };
        memory.runs.push(row);
        return row;
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const row = memory.runs.find((item) => item.id === where.id);
        if (!row) throw new Error("RUN_NOT_FOUND");
        Object.assign(row, data, { updatedAt: new Date() });
        return row;
      }),
      findFirst: vi.fn(async ({ where }: any) =>
        [...memory.runs].reverse().find((row) =>
          Object.entries(where).every(([key, value]) => row[key] === value),
        ) ?? null),
    },
    rawPickup: {
      count: vi.fn(async ({ where }: any) => memory.raws.filter((row) =>
        row.tenantId === where.tenantId &&
        row.outletId === where.outletId &&
        matchesText(row.waybillNo, where.waybillNo) &&
        matchesText(row.staffNameRaw, where.staffNameRaw) &&
        matchesText(row.destination, where.destination) &&
        matchesText(row.settlementRaw, where.settlementRaw),
      ).length),
      findMany: vi.fn(async ({ where, skip, take }: any) => memory.raws.filter((row) =>
        row.tenantId === where.tenantId &&
        row.outletId === where.outletId &&
        matchesText(row.waybillNo, where.waybillNo) &&
        matchesText(row.staffNameRaw, where.staffNameRaw) &&
        matchesText(row.destination, where.destination) &&
        matchesText(row.settlementRaw, where.settlementRaw),
      ).slice(skip, skip + take).map((row) => ({
        ...row,
        firstSeenRun: { startedAt: memory.runs.find((run) => run.id === row.firstSeenRunId)?.startedAt },
        lastSeenRun: { startedAt: memory.runs.find((run) => run.id === row.lastSeenRunId)?.startedAt },
      }))),
    },
    masterPickup: {
      count: vi.fn(async () => memory.masters.length),
      findMany: vi.fn(async () => memory.masters),
    },
    auditLog: {
      create: vi.fn(async ({ data }: any) => {
        memory.audits.push(data);
        return data;
      }),
    },
    $transaction: vi.fn(async (input: any) =>
      typeof input === "function" ? input(tx) : Promise.all(input)),
  },
}));

import { listRawPickups, syncPickup } from "./pickup.service";

const context = { tenantId: "tenant-a", outletId: "outlet-a", actorId: "user-a" };

beforeEach(() => {
  memory.runs.length = 0;
  memory.raws.length = 0;
  memory.masters.length = 0;
  memory.audits.length = 0;
  memory.runSequence = 0;
  memory.rawSequence = 0;
  memory.masterSequence = 0;
  vi.clearAllMocks();
});

describe("pickup vertical slice", () => {
  it("creates RAW and MasterPickup with totalFreight", async () => {
    const result = await syncPickup(context, {
      operationalDate: "2026-07-28",
      fetchPickup: async () => fixture,
    });
    expect(result.created).toBe(2);
    expect(memory.raws).toHaveLength(2);
    expect(memory.masters).toHaveLength(2);
    expect(memory.masters[0].freightAmount.toString()).toBe("12500");
    expect(memory.raws[0].firstSeenRunId).toBe(result.runId);
    expect(memory.raws[0].lastSeenRunId).toBe(result.runId);
  });

  it("keeps first seen, updates last seen, and does not create rows on identical replay", async () => {
    const first = await syncPickup(context, { operationalDate: "2026-07-28", fetchPickup: async () => fixture });
    const second = await syncPickup(context, { operationalDate: "2026-07-28", fetchPickup: async () => fixture });
    expect(memory.raws).toHaveLength(2);
    expect(second.duplicate).toBe(2);
    expect(memory.raws[0].firstSeenRunId).toBe(first.runId);
    expect(memory.raws[0].lastSeenRunId).toBe(second.runId);
  });

  it("updates the same RAW and MasterPickup when source fields change", async () => {
    await syncPickup(context, { operationalDate: "2026-07-28", fetchPickup: async () => fixture });
    const changed = structuredClone(fixture);
    changed.data[0].totalFreight = 15000;
    const result = await syncPickup(context, { operationalDate: "2026-07-28", fetchPickup: async () => changed });
    expect(result.updated).toBe(1);
    expect(memory.raws).toHaveLength(2);
    expect(memory.masters[0].freightAmount.toString()).toBe("15000");
  });

  it("scopes reads by tenant/outlet and supports waybill search and pagination", async () => {
    await syncPickup(context, { operationalDate: "2026-07-28", fetchPickup: async () => fixture });
    await syncPickup(
      { tenantId: "tenant-b", outletId: "outlet-b", actorId: "user-b" },
      { operationalDate: "2026-07-28", fetchPickup: async () => fixture },
    );
    const result = await listRawPickups({
      tenantId: "tenant-a",
      outletId: "outlet-a",
      page: 1,
      pageSize: 10,
      search: "WB-002",
      canViewPii: false,
    });
    expect(result.pagination.total).toBe(1);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].waybillNo).toBe("TEST-WB-002");
    expect(result.rows[0].receiver).not.toBe("RECEIVER TWO");
  });
});
