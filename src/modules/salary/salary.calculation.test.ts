import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  calculateEmployeeSalary,
  createSalaryEmployeeMatcher,
  normalizeSalaryEmployeeName,
  type SalaryCalculationSetting,
  type SalaryDispatchSource,
  type SalaryPickupSource,
} from "./salary.calculation";

const d = (value: string | number) => new Prisma.Decimal(value);
const setting: SalaryCalculationSetting = {
  profileId: "profile-1",
  profileCode: "MOTORIST",
  profileVersion: 1,
  basicDailySalary: d(80000),
  fixedAllowance: d(75000),
  deliveryPerKgAmount: d(180),
  deliveryPerKgMinWeight: d(10),
  deliveryPerKgMaxWeight: d(100),
  deliveryPerWaybillAmount: d(1800),
  deliveryPerWaybillMinWeight: d(1),
  deliveryPerWaybillMaxWeight: d(9),
  pickupRegularRevenuePercentage: d(5),
  pickupRegularPerWaybillAmount: d(650),
  pickupMarketplacePerWaybillAmount: d(600),
  dailyFuelMinDeliveryWaybill: 35,
  dailyFuelAmount: d(20000),
  dailyExtraMinDeliveryWaybill: 50,
  dailyExtraAmount: d(50000),
};
const pickup = (
  id: string,
  date = "2026-07-01",
  settlement = "DFOD",
  freight = 100000,
): SalaryPickupSource => ({
  id, date, waybill: `WB-${id}`, settlement, freight: d(freight), setting,
});
const dispatch = (
  id: string,
  weight = 1,
  date = "2026-07-01",
  status = "Penerimaan Normal",
): SalaryDispatchSource => ({
  id, date, waybill: `WB-${id}`, status, weight: d(weight), setting,
});
const component = (
  result: ReturnType<typeof calculateEmployeeSalary>,
  sourceType: string,
) => result.components.find((row) => row.sourceType === sourceType);

describe("salary employee matching", () => {
  const match = createSalaryEmployeeMatcher([
    {
      id: "employee-1",
      name: "Ridwan Kusnawan",
      aliases: [{
        aliasName: "Ridwan K.",
        sourceType: "BOTH",
        isActive: true,
      }],
    },
  ]);

  it("normalizes whitespace and case but never uses partial matching", () => {
    expect(normalizeSalaryEmployeeName(" RIDWAN   KUSNAWAN "))
      .toBe("ridwan kusnawan");
    expect(match("ridwan kusnawan", "PICKUP").employeeId).toBe("employee-1");
    expect(match("Ridwan", "PICKUP")).toMatchObject({
      employeeId: null,
      reason: "EMPLOYEE_NOT_MAPPED",
    });
  });

  it("prioritizes an explicit alias and keeps ambiguous names unmapped", () => {
    expect(match("ridwan k.", "DISPATCH").employeeId).toBe("employee-1");
    const ambiguous = createSalaryEmployeeMatcher([
      { id: "one", name: "Nama Sama" },
      { id: "two", name: " nama  sama " },
    ]);
    expect(ambiguous("NAMA SAMA", "PICKUP")).toMatchObject({
      employeeId: null,
      reason: "AMBIGUOUS_NAME",
    });
  });
});

describe("salary work days, basic salary and allowance", () => {
  it("counts unique activity dates across Pickup and eligible Dispatch", () => {
    const result = calculateEmployeeSalary({
      pickups: [pickup("p1"), pickup("p2"), pickup("p3", "2026-07-02")],
      dispatches: [
        dispatch("d1"),
        dispatch("d2", 1, "2026-07-03"),
        dispatch("d3", 1, "2026-07-04", "Gagal Antar"),
      ],
    });
    expect(result.workDates).toEqual([
      "2026-07-01",
      "2026-07-02",
      "2026-07-03",
    ]);
    expect(component(result, "BASIC")?.quantity.toString()).toBe("3");
    expect(component(result, "BASIC")?.amount.toString()).toBe("240000");
    expect(component(result, "FIXED_ALLOWANCE")?.amount.toString()).toBe("75000");
    expect(component(result, "OVERTIME")).toBeUndefined();
  });

  it("does not add basic salary or allowance without valid activity", () => {
    const result = calculateEmployeeSalary({
      pickups: [],
      dispatches: [dispatch("d1", 1, "2026-07-01", "Retur")],
    });
    expect(result.workDates).toEqual([]);
    expect(component(result, "BASIC")).toBeUndefined();
    expect(component(result, "FIXED_ALLOWANCE")).toBeUndefined();
  });
});

describe("salary delivery calculation", () => {
  it.each([
    [1, "DELIVERY_PER_WAYBILL", "1800"],
    [9, "DELIVERY_PER_WAYBILL", "1800"],
    [10, "DELIVERY_PER_KG", "1800"],
    [11, "DELIVERY_PER_KG", "1980"],
    [100, "DELIVERY_PER_KG", "18000"],
    [10.5, "DELIVERY_PER_KG", "1890"],
  ])("calculates inclusive delivery weight %s", (weight, type, amount) => {
    const result = calculateEmployeeSalary({
      pickups: [],
      dispatches: [dispatch("d1", weight)],
    });
    expect(component(result, type)?.amount.toString()).toBe(amount);
    expect(result.sources.filter((row) => row.calculationStatus === "INCLUDED"))
      .toHaveLength(1);
  });

  it.each([
    [101, "OUTSIDE_WEIGHT_RANGE"],
    [-1, "INVALID_WEIGHT"],
  ])("excludes invalid/outside delivery weight %s", (weight, reason) => {
    const result = calculateEmployeeSalary({
      pickups: [],
      dispatches: [dispatch("d1", weight)],
    });
    expect(result.sources[0]).toMatchObject({
      calculationStatus: "EXCLUDED",
      exclusionReason: reason,
    });
  });

  it("does not count an ineligible status or duplicate source twice", () => {
    const duplicate = dispatch("d1", 1);
    const result = calculateEmployeeSalary({
      pickups: [],
      dispatches: [
        duplicate,
        duplicate,
        dispatch("d2", 1, "2026-07-01", "Gagal Antar"),
      ],
    });
    expect(component(result, "DELIVERY_PER_WAYBILL")?.quantity.toString())
      .toBe("1");
    expect(result.dispatchCount).toBe(1);
  });

  it("fails safely for an overlapping legacy configuration", () => {
    const overlap = {
      ...setting,
      deliveryPerWaybillMaxWeight: d(10),
    };
    expect(() => calculateEmployeeSalary({
      pickups: [],
      dispatches: [{ ...dispatch("d1", 10), setting: overlap }],
    })).toThrow("OVERLAPPING_DELIVERY_RANGE:MOTORIST");
  });
});

describe("salary pickup calculation", () => {
  it.each(["DFOD", " dfod ", "Tunai", " TUNAI "])(
    "calculates regular percentage and per-waybill for %s",
    (settlement) => {
      const result = calculateEmployeeSalary({
        pickups: [pickup("p1", "2026-07-01", settlement)],
        dispatches: [],
      });
      expect(component(result, "PICKUP_REGULAR_PERCENTAGE")?.amount.toString())
        .toBe("5000");
      expect(component(result, "PICKUP_REGULAR_PER_WAYBILL")?.amount.toString())
        .toBe("650");
    },
  );

  it("uses per-waybill rate without Freight for Bulanan", () => {
    const result = calculateEmployeeSalary({
      pickups: [pickup("p1", "2026-07-01", " Bulanan ", 999999)],
      dispatches: [],
    });
    expect(component(result, "PICKUP_REGULAR_PERCENTAGE")).toBeUndefined();
    expect(component(result, "PICKUP_MARKETPLACE_PER_WAYBILL")?.amount.toString())
      .toBe("600");
  });

  it("uses Decimal percentage and excludes unknown or negative Freight", () => {
    const precise = calculateEmployeeSalary({
      pickups: [pickup("p1", "2026-07-01", "DFOD", 100001)],
      dispatches: [],
    });
    expect(component(precise, "PICKUP_REGULAR_PERCENTAGE")?.amount.toString())
      .toBe("5000.05");
    const excluded = calculateEmployeeSalary({
      pickups: [
        pickup("p2", "2026-07-01", "Lainnya"),
        pickup("p3", "2026-07-01", "DFOD", -1),
      ],
      dispatches: [],
    });
    expect(excluded.sources).toEqual(expect.arrayContaining([
      expect.objectContaining({ exclusionReason: "SETTLEMENT_NOT_ELIGIBLE" }),
      expect.objectContaining({
        exclusionReason: "INVALID_FREIGHT_FOR_PERCENTAGE",
      }),
    ]));
  });
});

describe("daily salary incentives", () => {
  const manyDispatches = (count: number, date = "2026-07-01") =>
    Array.from({ length: count }, (_, index) =>
      dispatch(`${date}-${index}`, 1, date)
    );

  it.each([
    [34, false, false],
    [35, true, false],
    [40, true, false],
    [49, true, false],
    [50, true, true],
    [52, true, true],
  ])("applies daily thresholds once for %s Dispatch", (count, fuel, extra) => {
    const result = calculateEmployeeSalary({
      pickups: [],
      dispatches: manyDispatches(count),
    });
    expect(Boolean(component(result, "DAILY_FUEL"))).toBe(fuel);
    expect(Boolean(component(result, "DAILY_EXTRA"))).toBe(extra);
  });

  it("calculates thresholds independently for each date", () => {
    const result = calculateEmployeeSalary({
      pickups: [],
      dispatches: [
        ...manyDispatches(35, "2026-07-01"),
        ...manyDispatches(50, "2026-07-02"),
      ],
    });
    expect(component(result, "DAILY_FUEL")?.quantity.toString()).toBe("2");
    expect(component(result, "DAILY_FUEL")?.amount.toString()).toBe("40000");
    expect(component(result, "DAILY_EXTRA")?.quantity.toString()).toBe("1");
    expect(component(result, "DAILY_EXTRA")?.amount.toString()).toBe("50000");
  });
});
