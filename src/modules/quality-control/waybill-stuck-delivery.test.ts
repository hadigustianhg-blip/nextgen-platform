import { readFile } from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
type UniqueArgs = {
  where: {
    tenantId_outletId_businessDate_sourceRecordKey: Record<string, unknown>;
  };
};
type AuditArgs = { data: unknown };
const memory = vi.hoisted(() => ({
  inventory: new Map<string, { id: string }>(),
  statuses: new Map<string, { id: string }>(),
  audits: [] as unknown[],
  rawInventoryDetail: { findMany: vi.fn() },
  rawWaybillStatus: { findMany: vi.fn() },
}));
const prismaMock = vi.hoisted(() => {
  const transactionStore = {
    rawInventoryDetail: {
      findUnique: vi.fn(async ({ where }: UniqueArgs) => {
        const key = JSON.stringify(where.tenantId_outletId_businessDate_sourceRecordKey);
        return memory.inventory.get(key) ?? null;
      }),
      upsert: vi.fn(async ({ where }: UniqueArgs) => {
        const key = JSON.stringify(where.tenantId_outletId_businessDate_sourceRecordKey);
        const row = { id: `inventory-${memory.inventory.size + 1}` };
        memory.inventory.set(key, row);
        return row;
      }),
    },
    rawWaybillStatus: {
      findUnique: vi.fn(async ({ where }: UniqueArgs) => {
        const key = JSON.stringify(where.tenantId_outletId_businessDate_sourceRecordKey);
        return memory.statuses.get(key) ?? null;
      }),
      upsert: vi.fn(async ({ where }: UniqueArgs) => {
        const key = JSON.stringify(where.tenantId_outletId_businessDate_sourceRecordKey);
        const row = { id: `status-${memory.statuses.size + 1}` };
        memory.statuses.set(key, row);
        return row;
      }),
    },
  };
  return {
    rawInventoryDetail: memory.rawInventoryDetail,
    rawWaybillStatus: memory.rawWaybillStatus,
    auditLog: {
      create: vi.fn(async ({ data }: AuditArgs) => {
        memory.audits.push(data);
        return data;
      }),
    },
    $transaction: vi.fn(async (callback: (tx: typeof transactionStore) => unknown) =>
      callback(transactionStore),
    ),
  };
});
vi.mock("@/lib/db/prisma", () => ({ prisma: prismaMock }));

import {
  canReadWaybillStuck,
  canSyncWaybillStuck,
} from "./waybill-stuck-delivery.authorization";
import {
  isVoidStatus,
  joinInventoryWithStatus,
  listWaybillStuckDelivery,
  summarizeWaybillStuck,
} from "./waybill-stuck-delivery.service";
import {
  BATCH_SIZE,
  fetchInventoryDetail,
  fetchWaybillStatusBatch,
  normalizeInventoryRecord,
  normalizeWaybillStatusRecord,
  requestWithRetry,
  syncWaybillStuckDelivery,
} from "./waybill-stuck-delivery-sync.service";

const inventoryRecord = (billCode: string) => ({
  billCode,
  customerName: "Customer",
  goodsName: "Goods",
  inventoryHours: 12,
  operateScanTime2: "2026-07-30 10:00:00",
  abnormalRegisterTime: null,
  destinationDistributionName: "Distribution",
  expressTypeName: "FastTrack",
});
const statusRecord = (sourceWaybill: string) => ({
  sourceWaybill,
  status: "success",
  currentScanSite: "SUM001A",
  currentScanTime: "2026-07-30 11:00:00",
  currentScanType: "Inbound",
  scanType: "Pickup",
  problemReason: "",
  isVoid: "tidak",
  recordId: `record-${sourceWaybill}`,
  statusFound: true,
});
const scope = {
  tenantId: "tenant-1",
  outletId: "outlet-1",
  actorId: "user-1",
  businessDate: "2026-07-30",
};

beforeEach(() => {
  vi.clearAllMocks();
  memory.inventory.clear();
  memory.statuses.clear();
  memory.audits.length = 0;
});

describe("Waybill Stuck source and sync", () => {
  it("maps the audited inventory response", () => {
    expect(normalizeInventoryRecord({
      ...inventoryRecord("WB000001"),
      inventoryHours: 12.9,
    })).toMatchObject({ billCode: "WB000001", inventoryHours: 12 });
  });

  it("fetches inventory with the audited date and pagination parameters", async () => {
    const fetcher = vi.fn(async (input: URL | RequestInfo) => {
      const url = input instanceof URL ? input : new URL(String(input));
      expect(url.searchParams.get("startDate")).toBe("2026-07-30");
      expect(url.searchParams.get("endDate")).toBe("2026-07-30");
      expect(url.searchParams.get("size")).toBe("500");
      return new Response(JSON.stringify({ success: true, data: [inventoryRecord("WB000001")] }), { status: 200 });
    });
    expect(await fetchInventoryDetail("2026-07-30", fetcher)).toHaveLength(1);
  });

  it("enforces maximum status batch size 100", async () => {
    expect(BATCH_SIZE).toBe(100);
    await expect(fetchWaybillStatusBatch(
      Array.from({ length: 101 }, (_, index) => `WB${index}`),
      "2026-07-30",
      vi.fn(),
    )).rejects.toThrow("BATCH_LIMIT_EXCEEDED");
  });

  it("keeps a non-destructive not_found marker", () => {
    expect(normalizeWaybillStatusRecord({
      sourceWaybill: "WB000001",
      status: "not_found",
    })).toMatchObject({
      sourceWaybill: "WB000001",
      statusFound: false,
      recordId: "not_found",
    });
  });

  it("retries 5xx but does not retry 4xx", async () => {
    const wait = vi.fn(async () => undefined);
    const retry = vi.fn()
      .mockResolvedValueOnce(new Response("error", { status: 500 }))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));
    expect((await requestWithRetry(retry, wait)).ok).toBe(true);
    expect(retry).toHaveBeenCalledTimes(2);
    const noRetry = vi.fn(async () => new Response("bad", { status: 400 }));
    await expect(requestWithRetry(noRetry, wait)).rejects.toMatchObject({ retryable: false });
    expect(noRetry).toHaveBeenCalledOnce();
  });

  it("chunks unique waybills, continues failed batches, and is idempotent", async () => {
    const inventory = Array.from({ length: 205 }, (_, index) =>
      inventoryRecord(`WB${String(index).padStart(6, "0")}`),
    );
    const batchSizes: number[] = [];
    const fetchStatus = vi.fn(async (waybills: string[]) => {
      batchSizes.push(waybills.length);
      if (batchSizes.length === 2) throw new Error("batch failed");
      return waybills.map(statusRecord);
    });
    const first = await syncWaybillStuckDelivery({
      ...scope,
      fetchInventory: vi.fn(async () => inventory),
      fetchStatus,
    });
    expect(batchSizes).toEqual([100, 100, 5]);
    expect(first.failedBatches).toBe(1);
    expect(memory.inventory.size).toBe(205);
    expect(memory.statuses.size).toBe(105);
    const second = await syncWaybillStuckDelivery({
      ...scope,
      fetchInventory: vi.fn(async () => inventory),
      fetchStatus: vi.fn(async (waybills) => waybills.map(statusRecord)),
    });
    expect(memory.inventory.size).toBe(205);
    expect(memory.statuses.size).toBe(205);
    expect(second.inventory.updated).toBe(205);
    expect(memory.audits.at(-1)).toMatchObject({
      entityType: "WAYBILL_STUCK_DELIVERY_SYNC",
      metadata: { businessDate: "2026-07-30", result: "SUCCESS" },
    });
  });
});

describe("Waybill Stuck join and read", () => {
  const inventory = [
    {
      id: "one", businessDate: new Date("2026-07-30T00:00:00.000Z"),
      billCode: "WB1", customerName: "Customer A", goodsName: "Goods A",
      inventoryHours: 10, abnormalRegisterTime: null,
      updatedAt: new Date("2026-07-30T10:00:00.000Z"),
    },
    {
      id: "two", businessDate: new Date("2026-07-30T00:00:00.000Z"),
      billCode: "WB2", customerName: "Customer B", goodsName: "Goods B",
      inventoryHours: 20, abnormalRegisterTime: null,
      updatedAt: new Date("2026-07-30T10:00:00.000Z"),
    },
  ];
  const statuses = [{
    sourceWaybill: "WB1", currentScanSite: "SUM001A",
    currentScanTime: "2026-07-30 11:00:00", currentScanType: "Inbound",
    scanType: "Pickup", problemReason: "Problem", isVoid: "tidak",
    statusFound: true,
    syncedAt: new Date("2026-07-30T11:00:00.000Z"),
    updatedAt: new Date("2026-07-30T11:00:00.000Z"),
  }];

  it("joins billCode to sourceWaybill and retains inventory without status", () => {
    const rows = joinInventoryWithStatus(inventory, statuses);
    expect(rows[0]).toMatchObject({ waybill: "WB1", statusFound: true, status: "PROBLEM" });
    expect(rows[1]).toMatchObject({ waybill: "WB2", statusFound: false, status: "STATUS_NOT_FOUND" });
    expect(summarizeWaybillStuck(rows)).toMatchObject({
      totalInventory: 2, uniqueWaybills: 2, statusFound: 1,
      statusNotFound: 1, totalProblem: 1, averageInventoryHours: 15,
    });
  });

  it("recognizes source void values", () => {
    expect(isVoidStatus("ya")).toBe(true);
    expect(isVoidStatus("tidak")).toBe(false);
  });

  it("keeps tenant/outlet/date isolation and summarizes before pagination", async () => {
    memory.rawInventoryDetail.findMany.mockResolvedValue(inventory);
    memory.rawWaybillStatus.findMany.mockResolvedValue(statuses);
    const result = await listWaybillStuckDelivery({
      tenantId: "tenant-1", outletId: "outlet-1", businessDate: "2026-07-30",
      page: 1, pageSize: 1,
    });
    expect(memory.rawInventoryDetail.findMany.mock.calls[0][0].where).toMatchObject({
      tenantId: "tenant-1", outletId: "outlet-1",
      businessDate: new Date("2026-07-30T00:00:00.000Z"),
    });
    expect(memory.rawWaybillStatus.findMany.mock.calls[0][0].where).toMatchObject({
      tenantId: "tenant-1", outletId: "outlet-1",
    });
    expect(result.data).toHaveLength(1);
    expect(result.summary.totalInventory).toBe(2);
    expect(result.pagination).toMatchObject({ total: 2, totalPages: 2 });
  });
});

describe("Waybill Stuck UI and RBAC", () => {
  const session = (roles: string[]) => ({
    sessionId: "session-1", tenantId: "tenant-1", tenantName: "Tenant",
    userId: "user-1", userName: "User", email: "user@example.test",
    outletId: "outlet-1", outletCode: "SUM001A", roles,
  });

  it("allows VIEWER read but not sync", () => {
    expect(canReadWaybillStuck(session(["VIEWER"]))).toBe(true);
    expect(canSyncWaybillStuck(session(["VIEWER"]))).toBe(false);
    for (const role of ["OWNER", "ADMIN", "OPERATIONAL"]) {
      expect(canSyncWaybillStuck(session([role]))).toBe(true);
    }
  });

  it("keeps Refresh database-only and Sync on the dedicated shared route", async () => {
    const ui = await readFile(
      new URL("../../components/quality-control/waybill-stuck-delivery-client.tsx", import.meta.url),
      "utf8",
    );
    expect(ui).toContain('onClick={() => void load()}');
    expect(ui).toContain('fetch("/api/quality-control/waybill-stuck-delivery/sync"');
    expect(ui).toContain("await load()");
    expect(ui).not.toContain("setInterval");
  });

  it("defaults to Jakarta today, auto-loads changes, and refreshes the active date", async () => {
    const ui = await readFile(
      new URL("../../components/quality-control/waybill-stuck-delivery-client.tsx", import.meta.url),
      "utf8",
    );
    expect(ui).toContain('import { jakartaOperationalDate } from "@/lib/dates/jakarta-date"');
    expect(ui).toContain("useState(jakartaOperationalDate)");
    expect(ui).toContain("businessDate,");
    expect(ui).toContain("queueMicrotask(() => void load())");
    expect(ui).toContain("setBusinessDate(event.target.value)");
    expect(ui).toContain('onClick={() => void load()}');
  });
});
