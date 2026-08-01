import { describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const prismaMocks = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { cashMovement: { findMany: prismaMocks.findMany } },
}));

import {
  cashBalance,
  listCashFlow,
  runningBalances,
  voidAutomaticCashMovements,
} from "./cash-flow.service";
import {
  cashFlowListSchema, manualExpenseSchema, manualIncomeSchema,
} from "./cash-flow.validation";
import {
  canCreateManualCashFlow, canManageManualCashFlow, canReadCashFlow,
} from "./cash-flow.authorization";
import type { SessionContext } from "@/lib/auth/session";
import { jakartaCurrentMonthRange } from "@/lib/dates/jakarta-date";

const amount = (value: number) => new Prisma.Decimal(value);
const movement = (
  direction: "IN" | "OUT",
  channel: "CASH" | "BANK",
  value: number,
  recordStatus: "VALID" | "VOID" = "VALID",
) => ({ direction, channel, amount: amount(value), recordStatus });

describe("Cash Flow Payment formulas", () => {
  it("scopes automatic void queries without leaking actorId into Prisma", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const adjustmentContext = {
      tenantId: "tenant-a",
      outletId: "outlet-a",
      actorId: "actor-a",
    };
    await voidAutomaticCashMovements(
      { cashMovement: { updateMany } } as unknown as Prisma.TransactionClient,
      adjustmentContext,
      "PickupPayment",
      "payment-a",
    );
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        tenantId: "tenant-a",
        outletId: "outlet-a",
        sourceType: "PickupPayment",
        sourceId: "payment-a",
        recordStatus: "VALID",
      },
      data: { recordStatus: "VOID" },
    });
  });

  it("calculates cash on hand and bank balance from valid ledger rows", () => {
    const result = cashBalance([
      movement("IN", "CASH", 1000), movement("OUT", "CASH", 250),
      movement("IN", "BANK", 500), movement("OUT", "BANK", 100),
      movement("IN", "CASH", 999, "VOID"),
    ]);
    expect(result.cash.toString()).toBe("750");
    expect(result.bank.toString()).toBe("400");
  });

  it("calculates running balance without allowing void rows to affect it", () => {
    expect(runningBalances([
      movement("IN", "CASH", 1000),
      movement("OUT", "CASH", 300),
      movement("OUT", "CASH", 200, "VOID"),
      movement("IN", "BANK", 50),
    ]).map(String)).toEqual(["1000", "700", "700", "750"]);
  });

  it("represents bank deposit as equal cash out and bank in", () => {
    const result = cashBalance([
      movement("OUT", "CASH", 500),
      movement("IN", "BANK", 500),
    ]);
    expect(result.cash.toString()).toBe("-500");
    expect(result.bank.toString()).toBe("500");
  });
});

describe("Cash Flow Payment period and cumulative ledger", () => {
  const row = (input: {
    id: string;
    businessDate: string;
    amount: number;
    direction?: "IN" | "OUT";
    channel?: "CASH" | "BANK";
    recordStatus?: "VALID" | "VOID";
    createdAt?: string;
  }) => ({
    id: input.id,
    tenantId: "tenant-a",
    outletId: "outlet-a",
    businessDate: new Date(`${input.businessDate}T00:00:00.000Z`),
    occurredAt: new Date(`${input.businessDate}T03:00:00.000Z`),
    direction: input.direction ?? "IN",
    channel: input.channel ?? "CASH",
    movementType: "MANUAL_INCOME" as const,
    amount: amount(input.amount),
    description: null,
    reference: null,
    sourceType: "MANUAL",
    sourceId: null,
    requestKey: `request-${input.id}`,
    recordStatus: input.recordStatus ?? "VALID",
    createdByUserId: "user-a",
    createdAt: new Date(input.createdAt ?? "2026-08-01T00:00:00.000Z"),
    updatedAt: new Date("2026-08-01T00:00:00.000Z"),
    createdBy: { name: "Operator" },
  });

  it("resolves the current month using Asia/Jakarta at a UTC month boundary", () => {
    expect(jakartaCurrentMonthRange(new Date("2026-07-31T17:30:00.000Z"))).toEqual({
      startDate: "2026-08-01",
      endDate: "2026-08-31",
    });
  });

  it("defaults database filtering to current-month businessDate and carries prior balance", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-15T03:00:00.000Z"));
    const july = row({ id: "july", businessDate: "2026-07-31", amount: 1000 });
    const august = row({ id: "august", businessDate: "2026-08-01", amount: 250 });
    const augustOut = row({ id: "august-out", businessDate: "2026-08-02", amount: 50, direction: "OUT" });
    const voidAugust = { ...row({ id: "august-void", businessDate: "2026-08-03", amount: 999 }), recordStatus: "VOID" as const };
    const september = row({ id: "september", businessDate: "2026-09-01", amount: 100 });
    prismaMocks.findMany.mockImplementation((args) =>
      Promise.resolve(args.include ? [august, augustOut] : [july, august, augustOut, voidAugust, september]));

    const result = await listCashFlow({
      tenantId: "tenant-a", outletId: "outlet-a", page: 1, pageSize: 25,
      startDate: "", endDate: "",
    });

    expect(prismaMocks.findMany.mock.calls[0]![0].where.businessDate).toEqual({
      gte: new Date("2026-08-01T00:00:00.000Z"),
      lte: new Date("2026-08-31T00:00:00.000Z"),
    });
    expect(prismaMocks.findMany.mock.calls[0]![0].where).not.toHaveProperty("createdAt");
    expect(prismaMocks.findMany.mock.calls[0]![0].where).not.toHaveProperty("updatedAt");
    expect(result.data.find((item) => item.id === "august")!.runningBalance).toBe("1250");
    expect(result.data.find((item) => item.id === "august-out")!.runningBalance).toBe("1200");
    expect(result.summary.cashOnHand).toBe("200");
    expect(result.summary.bankBalance).toBe("0");
    expect(result.summary.monthlyIncome).toBe("250");
    expect(result.summary.monthlyExpense).toBe("50");
    expect(prismaMocks.findMany.mock.calls[1]![0]).toMatchObject({
      where: { tenantId: "tenant-a", outletId: "outlet-a" },
    });
    expect(prismaMocks.findMany.mock.calls[1]![0].where).not.toHaveProperty("businessDate");
    vi.useRealTimers();
  });

  it("honors a manual July date range together with existing filters", async () => {
    const july = row({ id: "july-filtered", businessDate: "2026-07-10", amount: 500, channel: "BANK" });
    const julyCash = row({ id: "july-cash", businessDate: "2026-07-11", amount: 300 });
    const julyCashOut = row({ id: "july-cash-out", businessDate: "2026-07-12", amount: 100, direction: "OUT" });
    const june = row({ id: "june", businessDate: "2026-06-30", amount: 9000 });
    const august = row({ id: "august-other", businessDate: "2026-08-01", amount: 8000, channel: "BANK" });
    const julyVoid = row({ id: "july-void", businessDate: "2026-07-15", amount: 7000, recordStatus: "VOID" });
    prismaMocks.findMany.mockImplementation((args) =>
      Promise.resolve(args.include ? [july] : [june, july, julyCash, julyCashOut, julyVoid, august]));

    await listCashFlow({
      tenantId: "tenant-a", outletId: "outlet-a", page: 1, pageSize: 25,
      startDate: "2026-07-01", endDate: "2026-07-31", direction: "IN",
      channel: "BANK", movementType: "MANUAL_INCOME", reference: "REF", search: "manual",
    });

    expect(prismaMocks.findMany.mock.calls.at(-2)![0].where).toMatchObject({
      tenantId: "tenant-a",
      outletId: "outlet-a",
      businessDate: {
        gte: new Date("2026-07-01T00:00:00.000Z"),
        lte: new Date("2026-07-31T00:00:00.000Z"),
      },
      direction: "IN",
      channel: "BANK",
      movementType: "MANUAL_INCOME",
    });
    const result = await listCashFlow({
      tenantId: "tenant-a", outletId: "outlet-a", page: 1, pageSize: 25,
      startDate: "2026-07-01", endDate: "2026-07-31", channel: "BANK",
    });
    expect(result.summary).toEqual({
      cashOnHand: "200",
      bankBalance: "500",
      monthlyIncome: "800",
      monthlyExpense: "100",
    });
  });

  it("supports a manual date range spanning two months", async () => {
    const before = row({ id: "before", businessDate: "2026-06-14", amount: 1000 });
    const julyIn = row({ id: "july-in", businessDate: "2026-07-01", amount: 400 });
    const augustOut = row({ id: "august-out-range", businessDate: "2026-08-15", amount: 150, direction: "OUT", channel: "BANK" });
    const after = row({ id: "after", businessDate: "2026-08-16", amount: 2000 });
    prismaMocks.findMany.mockImplementation((args) =>
      Promise.resolve(args.include ? [julyIn, augustOut] : [before, julyIn, augustOut, after]));
    const result = await listCashFlow({
      tenantId: "tenant-a", outletId: "outlet-a", page: 2, pageSize: 10,
      startDate: "2026-06-15", endDate: "2026-08-15",
    });
    expect(prismaMocks.findMany.mock.calls.at(-2)![0].where.businessDate).toEqual({
      gte: new Date("2026-06-15T00:00:00.000Z"),
      lte: new Date("2026-08-15T00:00:00.000Z"),
    });
    expect(result.summary).toEqual({
      cashOnHand: "400", bankBalance: "-150",
      monthlyIncome: "400", monthlyExpense: "150",
    });
  });

  it("returns zero period cards when the active period has no transactions", async () => {
    const old = row({ id: "old", businessDate: "2026-06-01", amount: 1000 });
    prismaMocks.findMany.mockImplementation((args) =>
      Promise.resolve(args.include ? [] : [old]));
    const result = await listCashFlow({
      tenantId: "tenant-a", outletId: "outlet-a", page: 1, pageSize: 25,
      startDate: "2026-08-01", endDate: "2026-08-31",
    });
    expect(result.summary).toEqual({
      cashOnHand: "0", bankBalance: "0", monthlyIncome: "0", monthlyExpense: "0",
    });
  });
});

describe("Cash Flow Payment validation", () => {
  const base = {
    requestKey: "10000000-0000-4000-8000-000000000001",
    businessDate: "2026-07-30",
    occurredAt: "2026-07-30T03:00:00.000Z",
    channel: "CASH",
    amount: "100000",
    reference: "REF-1",
  };

  it("accepts manual income and manual expense", () => {
    expect(manualIncomeSchema.safeParse({ ...base, category: "Tambahan Modal" }).success).toBe(true);
    expect(manualExpenseSchema.safeParse({ ...base, category: "Tarik Cash Owner" }).success).toBe(true);
  });

  it.each(["0", "-1", "1.5", "1,000", "NaN"])("rejects non-positive or non-integer amount %s", (value) => {
    expect(manualIncomeSchema.safeParse({ ...base, amount: value, category: "Lainnya" }).success).toBe(false);
  });

  it("provides pagination defaults and accepts all filters", () => {
    const parsed = cashFlowListSchema.parse({
      startDate: "", endDate: "", direction: "IN", channel: "BANK",
      movementType: "PICKUP_PAYMENT", reference: "REF", search: "pickup",
    });
    expect(parsed.page).toBe(1);
    expect(parsed.pageSize).toBe(25);
  });
});

describe("Cash Flow Payment RBAC", () => {
  const session = (roles: string[]) => ({ roles, outletId: "outlet" } as SessionContext);

  it("allows Viewer to read only", () => {
    expect(canReadCashFlow(session(["VIEWER"]))).toBe(true);
    expect(canCreateManualCashFlow(session(["VIEWER"]))).toBe(false);
    expect(canManageManualCashFlow(session(["VIEWER"]))).toBe(false);
  });

  it("allows Operational to create but not edit or void", () => {
    expect(canCreateManualCashFlow(session(["OPERATIONAL"]))).toBe(true);
    expect(canManageManualCashFlow(session(["OPERATIONAL"]))).toBe(false);
  });

  it("allows Admin and Owner to manage manual movements", () => {
    expect(canManageManualCashFlow(session(["ADMIN"]))).toBe(true);
    expect(canManageManualCashFlow(session(["OWNER"]))).toBe(true);
  });
});
