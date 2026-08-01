import { describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const prismaMocks = vi.hoisted(() => ({
  groupBy: vi.fn(),
  cashFindMany: vi.fn(),
  pickupFindMany: vi.fn(),
  deliveryFindMany: vi.fn(),
  closingFindMany: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: {
  cashMovement: { groupBy: prismaMocks.groupBy, findMany: prismaMocks.cashFindMany },
  masterPickup: { findMany: prismaMocks.pickupFindMany },
  masterSetoran: { findMany: prismaMocks.deliveryFindMany },
  operationalClosing: { findMany: prismaMocks.closingFindMany },
} }));

import {
  calculateSettlementPeriod, getPaymentSettlement, outstandingAsOf, periodBankDeposit, settlementBalances,
  periodBankBalance, periodOperationalTotals,
} from "./payment-settlement.service";
import { paymentSettlementQuerySchema } from "./payment-settlement.validation";
import { canReadPaymentSettlement } from "./payment-settlement.authorization";
import type { SessionContext } from "@/lib/auth/session";

const d = (value: number) => new Prisma.Decimal(value);
const movement = (
  businessDate: string,
  direction: "IN" | "OUT",
  channel: "CASH" | "BANK",
  movementType: string,
  amount: number,
  recordStatus: "VALID" | "VOID" = "VALID",
) => ({ businessDate, direction, channel, movementType, amount: d(amount), recordStatus });
const receivable = (businessDate: string, obligation: number, payments: Array<[string, number, string]> = []) => ({
  businessDate, obligation: d(obligation),
  payments: payments.map(([paymentDate, amount, status]) => ({ paymentDate, amount: d(amount), status })),
});

describe("Payment Settlement daily cash formulas", () => {
  const result = calculateSettlementPeriod({
    periodStart: "2026-07-01", periodEnd: "2026-07-31", openingCash: d(100),
    movements: [
      movement("2026-07-20", "IN", "CASH", "PICKUP_PAYMENT", 50),
      movement("2026-07-20", "IN", "BANK", "PICKUP_PAYMENT", 999),
      movement("2026-07-20", "OUT", "CASH", "OPERATIONAL_EXPENSE", 10),
      movement("2026-07-20", "OUT", "CASH", "BANK_DEPOSIT", 20),
      movement("2026-07-20", "OUT", "CASH", "CASH_WITHDRAWAL", 5),
      movement("2026-07-20", "OUT", "CASH", "MANUAL_EXPENSE", 3),
      movement("2026-07-20", "IN", "CASH", "MANUAL_INCOME", 1000, "VOID"),
      movement("2026-07-21", "IN", "CASH", "DELIVERY_PAYMENT", 20),
    ],
    pickups: [receivable("2026-07-19", 100, [["2026-07-21", 40, "VALID"]])],
    deliveries: [receivable("2026-07-19", 200, [["2026-07-20", 50, "VALID"]])],
    closings: [{ businessDate: "2026-07-20", status: "CLOSED", physicalCash: d(112), cashVariance: d(0) }],
  });
  const byDate = new Map(result.map((row) => [row.businessDate, row]));

  it("calculates opening, cash in, categorized cash out, and closing balance", () => {
    const row = byDate.get("2026-07-20")!;
    expect(row).toMatchObject({
      businessDate: "2026-07-20", closingStatus: "CLOSED",
    });
    expect(row.openingCash.toString()).toBe("100");
    expect(row.cashIn.toString()).toBe("50");
    expect(row.operationalExpense.toString()).toBe("10");
    expect(row.bankDeposit.toString()).toBe("20");
    expect(row.cashWithdrawal.toString()).toBe("5");
    expect(row.otherCashOut.toString()).toBe("3");
    expect(row.closingCash.toString()).toBe("112");
  });

  it("does not mix BANK or VOID movement into daily cash", () => {
    const row = byDate.get("2026-07-20")!;
    expect(row.cashIn.toString()).toBe("50");
    expect(row.cashInBreakdown.pickupCash.toString()).toBe("50");
  });

  it("uses prior closing cash as next opening and never sums daily closing balances", () => {
    expect(byDate.get("2026-07-21")!.openingCash.toString()).toBe("112");
    expect(byDate.get("2026-07-21")!.closingCash.toString()).toBe("132");
    expect(result.at(-1)?.closingCash.toString()).toBe("132");
  });

  it("provides historical pickup and delivery outstanding as-of each date", () => {
    expect(byDate.get("2026-07-20")!.pickupOutstanding.toString()).toBe("100");
    expect(byDate.get("2026-07-21")!.pickupOutstanding.toString()).toBe("60");
    expect(byDate.get("2026-07-20")!.deliveryOutstanding.toString()).toBe("150");
  });

  it("returns closing detail and BELUM_CLOSING fallback", () => {
    expect(byDate.get("2026-07-20")!.physicalCash?.toString()).toBe("112");
    expect(byDate.get("2026-07-20")!.cashVariance?.toString()).toBe("0");
    expect(byDate.get("2026-07-21")!.closingStatus).toBe("BELUM_CLOSING");
  });
});

describe("Payment Settlement outstanding and period behavior", () => {
  it("calculates global Cash On Hand and Bank Balance without mixing channels", () => {
    const balance = settlementBalances([
      { channel: "CASH", direction: "IN", amount: d(100) },
      { channel: "CASH", direction: "OUT", amount: d(30) },
      { channel: "BANK", direction: "IN", amount: d(500) },
      { channel: "BANK", direction: "OUT", amount: d(25) },
    ]);
    expect(balance.cashOnHand.toString()).toBe("70");
    expect(balance.bankBalance.toString()).toBe("475");
  });

  it("sums only valid CASH OUT bank deposits for the period", () => {
    expect(periodBankDeposit([
      movement("2026-07-20", "OUT", "CASH", "BANK_DEPOSIT", 20),
      movement("2026-07-21", "OUT", "CASH", "BANK_DEPOSIT", 30),
      movement("2026-07-21", "IN", "BANK", "BANK_DEPOSIT", 30),
      movement("2026-07-21", "OUT", "CASH", "BANK_DEPOSIT", 100, "VOID"),
    ]).toString()).toBe("50");
  });

  it("calculates bank balance only from valid BANK movements in the selected period", () => {
    const movements = [
      movement("2026-07-20", "IN", "BANK", "PICKUP_PAYMENT", 5_000_000),
      movement("2026-08-01", "IN", "BANK", "PICKUP_PAYMENT", 1_500_000),
      movement("2026-08-15", "OUT", "BANK", "MANUAL_EXPENSE", 300_000),
      movement("2026-08-20", "IN", "CASH", "PICKUP_PAYMENT", 9_000_000),
      movement("2026-08-21", "IN", "BANK", "PICKUP_PAYMENT", 7_000_000, "VOID"),
      movement("2026-09-01", "IN", "BANK", "PICKUP_PAYMENT", 8_000_000),
    ];
    expect(periodBankBalance(movements, "2026-08-01", "2026-08-31").toString())
      .toBe("1200000");
    expect(periodBankBalance(movements, "2026-07-01", "2026-07-31").toString())
      .toBe("5000000");
    expect(periodBankBalance(movements, "2026-06-01", "2026-06-30").toString())
      .toBe("0");
  });

  it("scopes the backend period query and keeps other summary formulas unchanged", async () => {
    prismaMocks.groupBy
      .mockResolvedValueOnce([
        { channel: "CASH", direction: "IN", movementType: "PICKUP_PAYMENT", _sum: { amount: d(1000) } },
        { channel: "CASH", direction: "OUT", movementType: "OPERATIONAL_EXPENSE", _sum: { amount: d(250) } },
        { channel: "BANK", direction: "IN", movementType: "PICKUP_PAYMENT", _sum: { amount: d(6_500_000) } },
        { channel: "BANK", direction: "OUT", movementType: "MANUAL_EXPENSE", _sum: { amount: d(300_000) } },
      ])
      .mockResolvedValueOnce([]);
    prismaMocks.cashFindMany.mockResolvedValueOnce([
      { businessDate: new Date("2026-08-01T00:00:00.000Z"), direction: "IN", channel: "BANK", movementType: "PICKUP_PAYMENT", amount: d(1_500_000), recordStatus: "VALID" },
      { businessDate: new Date("2026-08-15T00:00:00.000Z"), direction: "OUT", channel: "BANK", movementType: "MANUAL_EXPENSE", amount: d(300_000), recordStatus: "VALID" },
    ]);
    prismaMocks.pickupFindMany.mockResolvedValueOnce([]);
    prismaMocks.deliveryFindMany.mockResolvedValueOnce([]);
    prismaMocks.closingFindMany.mockResolvedValueOnce([]);

    const result = await getPaymentSettlement(
      { tenantId: "tenant-a", outletId: "outlet-a" },
      { month: 8, year: 2026, closingStatus: "CLOSED" },
    );

    expect(prismaMocks.cashFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        tenantId: "tenant-a", outletId: "outlet-a",
        businessDate: {
          gte: new Date("2026-08-01T00:00:00.000Z"),
          lte: new Date("2026-08-31T00:00:00.000Z"),
        },
      },
    }));
    expect(prismaMocks.groupBy.mock.calls[0]![0].where).toEqual({
      tenantId: "tenant-a", outletId: "outlet-a", recordStatus: "VALID", channel: "CASH",
    });
    expect(result.summary.bankBalance).toBe("1200000");
    expect(result.summary.cashOnHand).toBe("750");
    expect(result.summary.operationalTransferReceived).toBe("1500000");
    expect(result.period).toMatchObject({
      month: 8, year: 2026, startDate: "2026-08-01", endDate: "2026-08-31",
    });
  });

  it("summarizes operational cash, transfer, and expense from the same ledger", () => {
    const totals = periodOperationalTotals([
      movement("2026-07-20", "IN", "CASH", "PICKUP_PAYMENT", 100),
      movement("2026-07-20", "IN", "CASH", "DELIVERY_PAYMENT", 200),
      movement("2026-07-20", "IN", "BANK", "DELIVERY_PAYMENT", 50),
      movement("2026-07-20", "OUT", "CASH", "OPERATIONAL_EXPENSE", 25),
      movement("2026-07-20", "IN", "CASH", "MANUAL_INCOME", 999),
    ]);
    expect(totals.cashReceived.toString()).toBe("300");
    expect(totals.transferReceived.toString()).toBe("50");
    expect(totals.operationalExpense.toString()).toBe("25");
  });

  it("excludes superseded payments and clamps overpayment per obligation", () => {
    const rows = [
      receivable("2026-07-01", 100, [["2026-07-02", 90, "SUPERSEDED"], ["2026-07-03", 120, "VALID"]]),
      receivable("2026-07-01", 50),
    ];
    expect(outstandingAsOf(rows, "2026-07-03").toString()).toBe("50");
  });

  it("supports closing filter and empty state", () => {
    const filtered = calculateSettlementPeriod({
      periodStart: "2026-07-01", periodEnd: "2026-07-31", openingCash: d(0),
      movements: [movement("2026-07-01", "IN", "CASH", "MANUAL_INCOME", 1)],
      pickups: [], deliveries: [], closings: [], closingStatus: "CLOSED",
    });
    expect(filtered).toEqual([]);
    expect(calculateSettlementPeriod({
      periodStart: "2026-07-01", periodEnd: "2026-07-31", openingCash: d(0),
      movements: [], pickups: [], deliveries: [], closings: [],
    })).toEqual([]);
  });

  it("validates month, year, outlet, closing status, and period metadata inputs", () => {
    const parsed = paymentSettlementQuerySchema.parse({
      month: "7", year: "2026",
      outletId: "10000000-0000-4000-8000-000000000001",
      closingStatus: "REOPENED",
    });
    expect(parsed).toMatchObject({ month: 7, year: 2026, closingStatus: "REOPENED" });
    expect(paymentSettlementQuerySchema.safeParse({ month: 13, year: 2026 }).success).toBe(false);
  });

  it("allows every requested read-only role", () => {
    const session = (role: string) => ({ roles: [role] } as SessionContext);
    for (const role of ["VIEWER", "OPERATIONAL", "ADMIN", "OWNER"]) {
      expect(canReadPaymentSettlement(session(role))).toBe(true);
    }
    expect(canReadPaymentSettlement(session("HR"))).toBe(false);
  });
});
