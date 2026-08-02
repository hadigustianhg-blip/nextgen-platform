import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  employeeFindMany: vi.fn(),
  pickupFindMany: vi.fn(),
  kasbonFindMany: vi.fn(),
  dispatchFindMany: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    salaryEmployee: { findMany: mocks.employeeFindMany },
    masterPickup: { findMany: mocks.pickupFindMany },
    operationalExpense: { findMany: mocks.kasbonFindMany },
  },
}));
vi.mock("@/modules/delivery-settlement/active-dispatch-dataset", () => ({
  canonicalDispatchText: (value: string) => value.trim(),
  getActiveDispatchRecords: mocks.dispatchFindMany,
}));

import { calculateEmployeeSalary } from "./salary.calculation";
import {
  salaryPreviewMonthRange,
  shiftedSalaryPreviewMonthRange,
} from "./salary.preview-date";
import { getSalaryMonthlyPreview } from "./salary.preview.service";

const scope = { tenantId: "tenant-1", outletId: "outlet-1" };
const setting = {
  basicDailySalary: null,
  overtimeRate: null,
  fixedAllowance: null,
  deliveryPerKgAmount: null,
  deliveryPerKgMinWeight: null,
  deliveryPerKgMaxWeight: null,
  deliveryPerWaybillAmount: null,
  deliveryPerWaybillMinWeight: null,
  deliveryPerWaybillMaxWeight: null,
  pickupRegularRevenuePercentage: new Prisma.Decimal(10),
  pickupRegularPerWaybillAmount: null,
  pickupMarketplacePerWaybillAmount: null,
  dailyFuelMinDeliveryWaybill: null,
  dailyFuelAmount: null,
  dailyExtraMinDeliveryWaybill: null,
  dailyExtraAmount: null,
};
const profile = {
  id: "profile-1",
  code: "PICKUP",
  version: 1,
  division: "DRIVER",
  status: "ACTIVE",
  effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
  effectiveTo: null,
  setting,
};
const employee = {
  id: "employee-1",
  name: "Team A",
  division: "DRIVER",
  status: "ACTIVE",
  aliases: [],
  assignments: [{
    id: "assignment-1",
    employeeId: "employee-1",
    salaryProfileId: "profile-1",
    effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
    effectiveTo: null,
    status: "ACTIVE",
    salaryProfile: profile,
  }],
};
const pickup = (id: string, date: string, freight: number) => ({
  id,
  operationalDate: new Date(`${date}T00:00:00.000Z`),
  waybillNo: `WB-${id}`,
  staffName: "Team A",
  freightAmount: new Prisma.Decimal(freight),
  rawPickup: { settlementRaw: "Tunai" },
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.employeeFindMany.mockResolvedValue([employee]);
  mocks.pickupFindMany.mockResolvedValue([pickup("pickup-1", "2026-08-01", 10_000)]);
  mocks.dispatchFindMany.mockResolvedValue([]);
  mocks.kasbonFindMany.mockResolvedValue([]);
});

describe("read-only monthly Salary preview", () => {
  it("uses the active Jakarta month range and handles month/year boundaries", () => {
    expect(salaryPreviewMonthRange("2026-08-02")).toEqual({
      startDate: "2026-08-01", endDate: "2026-08-31",
    });
    expect(shiftedSalaryPreviewMonthRange("2026-08-01", -1)).toEqual({
      startDate: "2026-07-01", endDate: "2026-07-31",
    });
    expect(shiftedSalaryPreviewMonthRange("2027-01-01", -1)).toEqual({
      startDate: "2026-12-01", endDate: "2026-12-31",
    });
  });

  it("changes results with the requested range and scopes every source read", async () => {
    const august = await getSalaryMonthlyPreview(scope, {
      startDate: "2026-08-01", endDate: "2026-08-31",
    });
    mocks.pickupFindMany.mockResolvedValueOnce([
      pickup("pickup-2", "2026-09-01", 20_000),
    ]);
    const september = await getSalaryMonthlyPreview(scope, {
      startDate: "2026-09-01", endDate: "2026-09-30",
    });

    expect(august.summary.systemIncomeTotal).toBe("1000");
    expect(september.summary.systemIncomeTotal).toBe("2000");
    expect(mocks.employeeFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { ...scope, status: "ACTIVE" },
    }));
    expect(mocks.pickupFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining(scope),
    }));
    expect(mocks.dispatchFindMany).toHaveBeenCalledWith(expect.objectContaining(scope));
  });

  it("uses the existing calculator and produces the same formula result", async () => {
    const preview = await getSalaryMonthlyPreview(scope, {
      startDate: "2026-08-01", endDate: "2026-08-31",
    });
    const calculated = calculateEmployeeSalary({
      pickups: [{
        id: "pickup-1",
        date: "2026-08-01",
        waybill: "WB-pickup-1",
        settlement: "Tunai",
        freight: new Prisma.Decimal(10_000),
        setting: {
          profileId: profile.id,
          profileCode: profile.code,
          profileVersion: profile.version,
          ...setting,
        },
      }],
      dispatches: [],
    });
    expect(preview.data[0].systemIncomeTotal)
      .toBe(calculated.systemIncomeTotal.toString());
    expect(preview.summary.manualAdditionTotal).toBe("0");
    expect(preview.summary.manualDeductionTotal).toBe("0");
    expect(preview.summary.kasbonDeductionTotal).toBe("0");
  });

  it("marks an employee without an effective profile as unmapped", async () => {
    mocks.employeeFindMany.mockResolvedValueOnce([{
      ...employee,
      assignments: [],
    }]);
    const preview = await getSalaryMonthlyPreview(scope, {
      startDate: "2026-08-01", endDate: "2026-08-31",
    });
    expect(preview.data).toEqual([
      expect.objectContaining({
        employeeId: "employee-1",
        profileStatus: "UNMAPPED",
        systemIncomeTotal: "0",
      }),
    ]);
  });

  it("never asks for inactive teams and exposes no write database operation", async () => {
    await getSalaryMonthlyPreview(scope, {
      startDate: "2026-08-01", endDate: "2026-08-31",
    });
    expect(mocks.employeeFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: "ACTIVE" }),
    }));
    expect(Object.keys((await import("@/lib/db/prisma")).prisma).sort())
      .toEqual(["masterPickup", "operationalExpense", "salaryEmployee"]);
  });
});
