import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const dbStore = {
  rawDispatch: new Map<string, any>(),
  rawCod: new Map<string, any>(),
  masterSetoran: new Map<string, any>(),
  syncRun: new Map<string, any>(),
};

vi.mock("@/lib/db/prisma", () => {
  const mockTx = {
    rawDispatch: {
      updateMany: vi.fn(async () => ({ count: 0 })),
      upsert: vi.fn(async ({ where, create, update }: any) => {
        const key = `${where.tenantId_outletId_sourceRecordKey.tenantId}:${where.tenantId_outletId_sourceRecordKey.outletId}:${where.tenantId_outletId_sourceRecordKey.sourceRecordKey}`;
        const existing = dbStore.rawDispatch.get(key);
        if (existing) {
          const updated = { ...existing, ...update, id: existing.id };
          dbStore.rawDispatch.set(key, updated);
          return updated;
        }
        const created = { ...create, id: `rd-${Math.random()}` };
        dbStore.rawDispatch.set(key, created);
        return created;
      }),
      findMany: vi.fn(async ({ where }: any) => {
        const keys: string[] = where?.sourceRecordKey?.in || [];
        const result: any[] = [];
        for (const k of keys) {
          const fullKey = `${where.tenantId}:${where.outletId}:${k}`;
          if (dbStore.rawDispatch.has(fullKey)) {
            result.push(dbStore.rawDispatch.get(fullKey));
          }
        }
        return result;
      }),
    },
    rawCod: {
      updateMany: vi.fn(async () => ({ count: 0 })),
      upsert: vi.fn(async ({ where, create, update }: any) => {
        const key = `${where.tenantId_outletId_sourceRecordKey.tenantId}:${where.tenantId_outletId_sourceRecordKey.outletId}:${where.tenantId_outletId_sourceRecordKey.sourceRecordKey}`;
        const existing = dbStore.rawCod.get(key);
        if (existing) {
          const updated = { ...existing, ...update, id: existing.id };
          dbStore.rawCod.set(key, updated);
          return updated;
        }
        const created = { ...create, id: `rc-${Math.random()}` };
        dbStore.rawCod.set(key, created);
        return created;
      }),
      findMany: vi.fn(async ({ where }: any) => {
        const keys: string[] = where?.sourceRecordKey?.in || [];
        const result: any[] = [];
        for (const k of keys) {
          const fullKey = `${where.tenantId}:${where.outletId}:${k}`;
          if (dbStore.rawCod.has(fullKey)) {
            result.push(dbStore.rawCod.get(fullKey));
          }
        }
        return result;
      }),
    },
    masterSetoran: {
      findUnique: vi.fn(async () => null),
      create: vi.fn(async ({ data }: any) => ({ ...data, id: "ms-1" })),
      update: vi.fn(async ({ data }: any) => ({ ...data, id: "ms-1" })),
    },
    auditLog: {
      create: vi.fn(async () => ({ id: "audit-1" })),
    },
  };

  return {
    prisma: {
      ...mockTx,
      syncRun: {
        create: vi.fn(async ({ data }: any) => ({ ...data, id: "run-1" })),
        update: vi.fn(async ({ data }: any) => ({ ...data, id: "run-1" })),
      },
      auditLog: {
        create: vi.fn(async () => ({ id: "audit-1" })),
      },
      rawDispatch: mockTx.rawDispatch,
      rawCod: mockTx.rawCod,
      $transaction: vi.fn(async (callback: any) => callback(mockTx)),
    },
  };
});

import { syncDeliverySettlement } from "./delivery-settlement.service";

describe("Delivery Settlement P2002 & Single-Flight Integration Test", () => {
  it("executes first sync, rerun sync, and concurrent sync without P2002 or duplicate errors", async () => {
    const scope = { tenantId: "tenant-100", outletId: "outlet-100", actorId: "test-actor" };
    const dateStr = "2026-08-12";

    const mockFetch = vi.fn(async (url: string) => {
      if (url.includes("/jfs-dispatch")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            total: 2,
            data: [
              { waybillNo: "TEST_P2002_01", kurir: "KURIR_TEST", ongkir: 15000, waktu: "2026-08-12 10:00:00", receiver: "R1", address: "A1", status: "Penerimaan Normal", berat: 1, pembayaran: "DFOD", service: "EZ", codStatus: "", codValue: 0, barang: "B1" },
              { waybillNo: "TEST_P2002_02", kurir: "KURIR_TEST", ongkir: 20000, waktu: "2026-08-12 10:30:00", receiver: "R2", address: "A2", status: "Penerimaan Normal", berat: 1, pembayaran: "DFOD", service: "EZ", codStatus: "", codValue: 0, barang: "B2" },
            ],
          }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ success: true, total: 0, data: [] }),
      };
    });

    // 1. FIRST RUN
    const run1 = await syncDeliverySettlement(scope, { operationalDate: dateStr, fetchSource: mockFetch as any });
    expect(run1.status).toBe("SUCCESS");
    expect(run1.dispatchFetchedCount).toBe(2);
    expect(run1.dispatchCreatedCount).toBe(2);

    // 2. SECOND RUN (RERUN) - Idempotent
    const run2 = await syncDeliverySettlement(scope, { operationalDate: dateStr, fetchSource: mockFetch as any });
    expect(run2.status).toBe("SUCCESS");
    expect(run2.dispatchFetchedCount).toBe(2);
    expect(run2.dispatchCreatedCount).toBe(0);
    expect(run2.dispatchUnchangedCount).toBe(2);

    // 3. CONCURRENT RUNS - Single Flight Lock
    const [c1, c2] = await Promise.all([
      syncDeliverySettlement(scope, { operationalDate: dateStr, fetchSource: mockFetch as any }),
      syncDeliverySettlement(scope, { operationalDate: dateStr, fetchSource: mockFetch as any }),
    ]);

    expect(c1.status).toBe("SUCCESS");
    expect(c2.status).toBe("SUCCESS");
    expect(c1 === c2).toBe(true);
  });
});
