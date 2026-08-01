import { readFile } from "node:fs/promises";
import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  canonicalizeSalaryPickupSettlement,
  captureSalaryClosingSnapshots,
} from "./salary.snapshot.service";
import {
  calculateEmployeeSalary,
  type SalaryCalculationSetting,
} from "./salary.calculation";

const decimal = (value: number) => new Prisma.Decimal(value);
const pickupSetting: SalaryCalculationSetting = {
  profileId: "profile-pickup",
  profileCode: "PICKUP",
  profileVersion: 1,
  basicDailySalary: null,
  fixedAllowance: null,
  deliveryPerKgAmount: null,
  deliveryPerKgMinWeight: null,
  deliveryPerKgMaxWeight: null,
  deliveryPerWaybillAmount: null,
  deliveryPerWaybillMinWeight: null,
  deliveryPerWaybillMaxWeight: null,
  pickupRegularRevenuePercentage: decimal(5),
  pickupRegularPerWaybillAmount: null,
  pickupMarketplacePerWaybillAmount: decimal(650),
  dailyFuelMinDeliveryWaybill: null,
  dailyFuelAmount: null,
  dailyExtraMinDeliveryWaybill: null,
  dailyExtraAmount: null,
};

describe("Salary snapshot architecture", () => {
  it.each([
    ["ＤＦＯＤ", "DFOD"],
    ["  tunai  ", "Tunai"],
    ["\nBULANAN\t", "Bulanan"],
    [null, null],
    ["Transfer", null],
  ])("canonicalizes pickup settlement %j", (input, expected) => {
    expect(canonicalizeSalaryPickupSettlement(input)).toBe(expected);
  });

  it("stores canonical settlement from the read-only RawPickup relation", async () => {
    const createPickups = vi.fn().mockResolvedValue({ count: 4 });
    const tx = {
      salaryEmployee: { findMany: vi.fn().mockResolvedValue([]) },
      masterPickup: {
        findMany: vi.fn().mockResolvedValue(
          ["DFOD", " tunai ", "Ｂｕｌａｎａｎ", null].map(
            (settlementRaw, index) => ({
              id: `pickup-${index}`,
              operationalDate: new Date("2026-08-01T00:00:00.000Z"),
              waybillNo: `WB-${index}`,
              staffName: "Team A",
              freightAmount: decimal(10_000),
              syncStatus: "NORMALIZED",
              normalizationVersion: 1,
              sourceSyncedAt: new Date("2026-08-01T12:00:00.000Z"),
              rawPickup: { settlementRaw },
            }),
          ),
        ),
      },
      operationalExpense: { findMany: vi.fn().mockResolvedValue([]) },
      salaryRawPickup: { createMany: createPickups },
      salaryEmployeeSnapshot: { findMany: vi.fn().mockResolvedValue([]) },
      salaryClosing: { update: vi.fn().mockResolvedValue({}) },
      salaryAudit: { create: vi.fn().mockResolvedValue({}) },
    } as unknown as Prisma.TransactionClient;
    await captureSalaryClosingSnapshots(
      tx,
      {
        tenantId: "11111111-1111-4111-8111-111111111111",
        outletId: "22222222-2222-4222-8222-222222222222",
        actorId: "33333333-3333-4333-8333-333333333333",
        outletCode: "SUM001A",
      },
      {
        id: "44444444-4444-4444-8444-444444444444",
        periodStart: new Date("2026-08-01T00:00:00.000Z"),
        periodEnd: new Date("2026-08-01T00:00:00.000Z"),
        snapshotCapturedAt: null,
      },
    );
    expect(createPickups).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ settlement: "DFOD" }),
        expect.objectContaining({ settlement: "Tunai" }),
        expect.objectContaining({ settlement: "Bulanan" }),
        expect.objectContaining({ settlement: null }),
      ]),
    });
  });

  it("calculates regular incentive from canonical snapshot settlement", () => {
    const result = calculateEmployeeSalary({
      pickups: [{
        id: "salary-pickup-1",
        date: "2026-08-01",
        waybill: "WB-1",
        settlement: canonicalizeSalaryPickupSettlement("  DFOD "),
        freight: decimal(100_000),
        setting: pickupSetting,
      }],
      dispatches: [],
    });
    expect(result.components).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sourceType: "PICKUP_REGULAR_PERCENTAGE",
        amount: decimal(5_000),
      }),
    ]));
  });

  it("keeps marketplace pickup out of the regular incentive", () => {
    const result = calculateEmployeeSalary({
      pickups: [{
        id: "salary-pickup-2",
        date: "2026-08-01",
        waybill: "WB-2",
        settlement: canonicalizeSalaryPickupSettlement("Bulanan"),
        freight: decimal(100_000),
        setting: pickupSetting,
      }],
      dispatches: [],
    });
    expect(result.components.find((row) =>
      row.sourceType === "PICKUP_REGULAR_PERCENTAGE"
    )).toBeUndefined();
    expect(result.components).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sourceType: "PICKUP_MARKETPLACE_PER_WAYBILL",
        amount: decimal(650),
      }),
    ]));
  });

  it("keeps Generate Closing isolated from operational RAW and settlement modules", async () => {
    const [closing, snapshots, kasbon] = await Promise.all([
      readFile(new URL("./salary.closing.service.ts", import.meta.url), "utf8"),
      readFile(new URL("./salary.snapshot.service.ts", import.meta.url), "utf8"),
      readFile(new URL("./salary.kasbon.service.ts", import.meta.url), "utf8"),
    ]);
    const production = `${closing}\n${snapshots}\n${kasbon}`;
    expect(production).not.toMatch(/@\/modules\/(delivery-settlement|pickup-settlement|monitoring|cashflow)/);
    expect(production).not.toMatch(
      /\btx\.(rawPickup|rawDispatch|rawCod|masterSetoran)\./,
    );
    expect(snapshots).toContain("tx.masterPickup.findMany");
    expect(snapshots).toContain("tx.operationalExpense.findMany");
    expect(closing).toContain("loadSalaryOperationalSnapshots");
    expect(kasbon).not.toContain("operationalExpense.find");
  });

  it("persists Salary-owned snapshots and never rebuilds an existing snapshot", async () => {
    const snapshots = await readFile(
      new URL("./salary.snapshot.service.ts", import.meta.url),
      "utf8",
    );
    expect(snapshots).toContain("if (closing.snapshotCapturedAt)");
    for (const model of [
      "salaryEmployeeSnapshot",
      "salaryRawPickup",
      "salaryRawDispatch",
      "salaryKasbonSnapshot",
    ]) expect(snapshots).toContain(model);
  });

  it("reuses immutable snapshots without reading operational sources again", async () => {
    const findEmployees = vi.fn().mockResolvedValue([]);
    const masterPickupFindMany = vi.fn();
    const operationalExpenseFindMany = vi.fn();
    const tx = {
      salaryEmployeeSnapshot: { findMany: findEmployees },
      masterPickup: { findMany: masterPickupFindMany },
      operationalExpense: { findMany: operationalExpenseFindMany },
    } as unknown as Prisma.TransactionClient;
    await captureSalaryClosingSnapshots(
      tx,
      {
        tenantId: "11111111-1111-4111-8111-111111111111",
        outletId: "22222222-2222-4222-8222-222222222222",
        actorId: "33333333-3333-4333-8333-333333333333",
        outletCode: "SUM001A",
      },
      {
        id: "44444444-4444-4444-8444-444444444444",
        periodStart: new Date("2026-08-01T00:00:00.000Z"),
        periodEnd: new Date("2026-08-15T00:00:00.000Z"),
        snapshotCapturedAt: new Date("2026-08-01T12:00:00.000Z"),
      },
    );
    expect(findEmployees).toHaveBeenCalledOnce();
    expect(masterPickupFindMany).not.toHaveBeenCalled();
    expect(operationalExpenseFindMany).not.toHaveBeenCalled();
  });

  it("adds only Salary tables and a Salary allocation snapshot link", async () => {
    const migration = await readFile(
      new URL(
        "../../../prisma/migrations/20260801000200_add_salary_snapshot_architecture/migration.sql",
        import.meta.url,
      ),
      "utf8",
    );
    for (const table of [
      "SalaryEmployeeSnapshot",
      "SalaryRawPickup",
      "SalaryRawDispatch",
      "SalaryKasbonSnapshot",
      "SalaryCalculationSnapshot",
      "SalaryAudit",
    ]) expect(migration).toContain(`CREATE TABLE "${table}"`);
    expect(migration).not.toMatch(/\b(TRUNCATE|DELETE FROM)\b/i);
    expect(migration).not.toMatch(/ALTER TABLE "(Raw|Master|OperationalExpense)/);
  });
});
