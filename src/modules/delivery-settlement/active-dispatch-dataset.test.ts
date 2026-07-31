import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));

import { getActiveDispatchRecords } from "./active-dispatch-dataset";

const record = (overrides: Partial<{
  id: string;
  waybillNo: string;
  courierNameRaw: string | null;
  deliveryStatusRaw: string | null;
  chargeWeight: Prisma.Decimal;
  operationalDate: Date;
  isActive: boolean;
  syncStatus: "FETCHED" | "NORMALIZED" | "ERROR";
  sourceFetchedAt: Date;
}> = {}) => ({
  id: overrides.id ?? "dispatch-1",
  operationalDate: overrides.operationalDate ?? new Date("2026-07-31T00:00:00Z"),
  waybillNo: overrides.waybillNo ?? "WB-1",
  courierNameRaw: overrides.courierNameRaw ?? "Courier A",
  deliveryStatusRaw: overrides.deliveryStatusRaw ?? "Penerimaan Normal",
  receiverName: null,
  chargeWeight: overrides.chargeWeight ?? new Prisma.Decimal(12),
  syncStatus: overrides.syncStatus ?? "NORMALIZED",
  isActive: overrides.isActive ?? true,
  sourceRecordKey: `key-${overrides.id ?? "dispatch-1"}`,
  sourceFetchedAt: overrides.sourceFetchedAt ?? new Date("2026-07-31T12:00:00Z"),
  dispatchAt: null,
  createdAt: new Date("2026-07-31T10:00:00Z"),
  updatedAt: overrides.sourceFetchedAt ?? new Date("2026-07-31T12:00:00Z"),
});

const client = (rows: ReturnType<typeof record>[]) => ({
  rawDispatch: {
    findMany: vi.fn(async (args: Prisma.RawDispatchFindManyArgs) => {
      void args;
      return rows;
    }),
  },
});

describe("active dispatch dataset", () => {
  it("enforces tenant/outlet, NORMALIZED, active, and operational date range", async () => {
    const database = client([record()]);
    await getActiveDispatchRecords({
      tenantId: "tenant-1", outletId: "outlet-1",
      periodStart: new Date("2026-07-01T00:00:00Z"),
      periodEnd: new Date("2026-07-31T00:00:00Z"), client: database,
    });
    expect(database.rawDispatch.findMany.mock.calls[0][0].where).toEqual({
      tenantId: "tenant-1", outletId: "outlet-1",
      operationalDate: {
        gte: new Date("2026-07-01T00:00:00Z"),
        lte: new Date("2026-07-31T00:00:00Z"),
      },
      syncStatus: "NORMALIZED", isActive: true,
    });
  });

  it("ignores inactive/error versions and resolves duplicate active legacy rows deterministically", async () => {
    const rows = [
      record({ id: "inactive", isActive: false, chargeWeight: new Prisma.Decimal(10) }),
      record({ id: "error", syncStatus: "ERROR" }),
      record({ id: "older", sourceFetchedAt: new Date("2026-07-31T11:00:00Z"), chargeWeight: new Prisma.Decimal(11) }),
      record({ id: "final", sourceFetchedAt: new Date("2026-07-31T13:00:00Z"), chargeWeight: new Prisma.Decimal(12) }),
    ];
    const result = await getActiveDispatchRecords({
      tenantId: "tenant-1", outletId: "outlet-1",
      operationalDate: new Date("2026-07-31T00:00:00Z"), client: client(rows),
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: "final", waybillNo: "WB-1" });
    expect(result[0].chargeWeight.toString()).toBe("12");
  });

  it("applies canonical status, courier, and waybill filters after resolution", async () => {
    const result = await getActiveDispatchRecords({
      tenantId: "tenant-1", outletId: "outlet-1",
      operationalDate: new Date("2026-07-31T00:00:00Z"),
      status: " penerimaan   normal ", courier: "courier a", waybill: "wb-1",
      client: client([record({ deliveryStatusRaw: "PENERIMAAN NORMAL" })]),
    });
    expect(result).toHaveLength(1);
  });
});
