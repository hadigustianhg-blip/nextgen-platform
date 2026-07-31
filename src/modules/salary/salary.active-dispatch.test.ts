import { Prisma } from "@prisma/client";
import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));

import { getActiveDispatchRecords } from "@/modules/delivery-settlement/active-dispatch-dataset";
import {
  calculateEmployeeSalary,
  type SalaryCalculationSetting,
} from "./salary.calculation";

const d = (value: string | number) => new Prisma.Decimal(value);
const setting: SalaryCalculationSetting = {
  profileId: "profile-1", profileCode: "MOTORIST", profileVersion: 1,
  basicDailySalary: d(0), fixedAllowance: d(0),
  deliveryPerKgAmount: d(180), deliveryPerKgMinWeight: d(10), deliveryPerKgMaxWeight: d(100),
  deliveryPerWaybillAmount: d(1800), deliveryPerWaybillMinWeight: d(1), deliveryPerWaybillMaxWeight: d(9),
  pickupRegularRevenuePercentage: d(0), pickupRegularPerWaybillAmount: d(0),
  pickupMarketplacePerWaybillAmount: d(0), dailyFuelMinDeliveryWaybill: 35,
  dailyFuelAmount: d(20000), dailyExtraMinDeliveryWaybill: 35, dailyExtraAmount: d(50000),
};

const raw = (index: number, overrides: Partial<{
  id: string; waybillNo: string; isActive: boolean; weight: number; status: string;
  fetchedAt: Date;
}> = {}) => ({
  id: overrides.id ?? `dispatch-${index}`,
  operationalDate: new Date("2026-07-31T00:00:00Z"),
  waybillNo: overrides.waybillNo ?? `WB-${index}`,
  courierNameRaw: "Courier A", deliveryStatusRaw: overrides.status ?? "Penerimaan Normal",
  receiverName: null, chargeWeight: d(overrides.weight ?? 1), syncStatus: "NORMALIZED" as const,
  isActive: overrides.isActive ?? true, sourceRecordKey: `key-${overrides.id ?? index}`,
  sourceFetchedAt: overrides.fetchedAt ?? new Date("2026-07-31T12:00:00Z"),
  dispatchAt: null, createdAt: new Date("2026-07-31T10:00:00Z"),
  updatedAt: overrides.fetchedAt ?? new Date("2026-07-31T12:00:00Z"),
});

describe("Salary Closing active dispatch source", () => {
  it("uses final active weight once and unique waybills for daily thresholds", async () => {
    const rows = Array.from({ length: 35 }, (_, index) => raw(index));
    rows.push(raw(0, { id: "inactive-old", isActive: false, weight: 10 }));
    rows[0] = raw(0, { id: "active-final", weight: 12, fetchedAt: new Date("2026-07-31T13:00:00Z") });
    const findMany = vi.fn(async (args: Prisma.RawDispatchFindManyArgs) => {
      void args;
      return rows;
    });
    const active = await getActiveDispatchRecords({
      tenantId: "tenant-1", outletId: "outlet-1",
      periodStart: new Date("2026-07-01T00:00:00Z"),
      periodEnd: new Date("2026-07-31T00:00:00Z"), status: "Penerimaan Normal",
      client: { rawDispatch: { findMany } },
    });
    const result = calculateEmployeeSalary({
      pickups: [],
      dispatches: active.map((source) => ({
        id: source.id, sourceKey: source.sourceRecordKey,
        employeeNameRaw: source.courierNameRaw,
        date: source.operationalDate.toISOString().slice(0, 10),
        waybill: source.waybillNo, status: source.deliveryStatusRaw,
        weight: source.chargeWeight, setting,
      })),
    });
    expect(findMany.mock.calls[0][0].where).toMatchObject({
      tenantId: "tenant-1", outletId: "outlet-1",
      syncStatus: "NORMALIZED", isActive: true,
    });
    expect(active).toHaveLength(35);
    expect(active.find((source) => source.waybillNo === "WB-0")?.chargeWeight.toString()).toBe("12");
    expect(result.dispatchCount).toBe(35);
    expect(result.workDates).toEqual(["2026-07-31"]);
    expect(result.sources.filter((source) => source.sourceType === "DISPATCH")).toHaveLength(35);
    expect(result.components.find((row) => row.sourceType === "DELIVERY_PER_KG"))
      .toMatchObject({ quantity: d(12), amount: d(2160) });
    expect(result.components.find((row) => row.sourceType === "DAILY_FUEL")?.amount.toString()).toBe("20000");
    expect(result.components.find((row) => row.sourceType === "DAILY_EXTRA")?.amount.toString()).toBe("50000");
  });

  it("excludes non-normal delivery status before Salary calculation", async () => {
    const findMany = vi.fn(async (args: Prisma.RawDispatchFindManyArgs) => {
      void args;
      return [
        raw(1, { status: "Belum diterima" }),
        raw(2, { status: "Pereturan Penerimaan" }),
      ];
    });
    const active = await getActiveDispatchRecords({
      tenantId: "tenant-1", outletId: "outlet-1",
      operationalDate: new Date("2026-07-31T00:00:00Z"),
      status: "Penerimaan Normal", client: { rawDispatch: { findMany } },
    });
    expect(active).toEqual([]);
  });

  it("recalculates only DRAFT/CLOSED while preserving adjustments and Kasbon", async () => {
    const source = await readFile(
      new URL("./salary.closing.service.ts", import.meta.url),
      "utf8",
    );
    expect(source).toContain('["DRAFT", "CLOSED"].includes(closing.status)');
    expect(source).toContain("salaryClosingSourceRecord.deleteMany");
    expect(source).toContain("salaryClosingComponent.deleteMany");
    expect(source).not.toContain("salaryAdjustment.deleteMany");
    expect(source).not.toContain("salaryKasbonAllocation.deleteMany");
    expect(source).toContain("refreshClosingEmployeeTotals(tx, context");
    expect(source).toContain("client: tx");
  });
});
