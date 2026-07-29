import { describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));

import {
  calculateOperationalSummary,
  normalizeTeamName,
} from "./operational-settlement.service";
import {
  closeOperationalSchema,
  expenseInputSchema,
  operationalListQuerySchema,
  reopenOperationalSchema,
  voidExpenseSchema,
} from "./operational-settlement.validation";

const d = (value: string | number) => new Prisma.Decimal(value);

describe("Operational Settlement calculation", () => {
  it("calculates cash collected from valid pickup and delivery cash", () => {
    const result = calculateOperationalSummary({
      pickupCash: d(400000), deliveryCash: d(600000),
      pickupTransfer: d(0), deliveryTransfer: d(0),
      pickupOutstanding: d(0), deliveryOutstanding: d(0),
      expense: d(0),
    });
    expect(result.cashCollected.toString()).toBe("1000000");
  });

  it("calculates transfer separately without adding it to physical cash", () => {
    const result = calculateOperationalSummary({
      pickupCash: d(100), deliveryCash: d(200),
      pickupTransfer: d(300), deliveryTransfer: d(400),
      pickupOutstanding: d(0), deliveryOutstanding: d(0),
      expense: d(0),
    });
    expect(result.cashCollected.toString()).toBe("300");
    expect(result.transferCollected.toString()).toBe("700");
    expect(result.cashAvailable.toString()).toBe("300");
  });

  it("subtracts only valid operational expense from cash available", () => {
    const result = calculateOperationalSummary({
      pickupCash: d(500000), deliveryCash: d(500000),
      pickupTransfer: d(0), deliveryTransfer: d(0),
      pickupOutstanding: d(0), deliveryOutstanding: d(0),
      expense: d(250000),
    });
    expect(result.operationalExpense.toString()).toBe("250000");
    expect(result.cashAvailable.toString()).toBe("750000");
  });

  it("adds unpaid pickup and delivery as information only", () => {
    const result = calculateOperationalSummary({
      pickupCash: d(0), deliveryCash: d(0),
      pickupTransfer: d(0), deliveryTransfer: d(0),
      pickupOutstanding: d(100), deliveryOutstanding: d(200),
      expense: d(0),
    });
    expect(result.outstanding.toString()).toBe("300");
    expect(result.cashCollected.toString()).toBe("0");
  });

  it.each([
    { physical: "750000", status: "MATCH", variance: "0" },
    { physical: "700000", status: "SHORT", variance: "-50000" },
    { physical: "800000", status: "OVER", variance: "50000" },
  ])("derives variance status $status", ({ physical, status, variance }) => {
    const result = calculateOperationalSummary({
      pickupCash: d(1000000), deliveryCash: d(0),
      pickupTransfer: d(0), deliveryTransfer: d(0),
      pickupOutstanding: d(0), deliveryOutstanding: d(0),
      expense: d(250000), physicalCash: d(physical),
    });
    expect(result.varianceStatus).toBe(status);
    expect(result.cashVariance?.toString()).toBe(variance);
  });

  it("does not invent variance before physical cash is stored", () => {
    const result = calculateOperationalSummary({
      pickupCash: d(0), deliveryCash: d(0), pickupTransfer: d(0),
      deliveryTransfer: d(0), pickupOutstanding: d(0),
      deliveryOutstanding: d(0), expense: d(0),
    });
    expect(result.cashVariance).toBeNull();
    expect(result.varianceStatus).toBe("NOT_SET");
  });

  it("uses Decimal without floating-point drift", () => {
    const result = calculateOperationalSummary({
      pickupCash: d("0.1"), deliveryCash: d("0.2"),
      pickupTransfer: d(0), deliveryTransfer: d(0),
      pickupOutstanding: d(0), deliveryOutstanding: d(0),
      expense: d("0.3"),
    });
    expect(result.cashAvailable.toString()).toBe("0");
  });
});

describe("Operational Settlement validation", () => {
  const base = {
    requestKey: "10000000-0000-4000-8000-000000000001",
    operationalDate: "2026-07-29",
    amount: "100000",
    description: "Test",
  };

  it("requires a vehicle plate for BBM", () => {
    expect(expenseInputSchema.safeParse({ ...base, category: "BBM" }).success).toBe(false);
    expect(expenseInputSchema.safeParse({ ...base, category: "BBM", vehiclePlate: "D8634AB" }).success).toBe(true);
  });

  it("requires normalized team and cash advance category for Kasbon", () => {
    expect(expenseInputSchema.safeParse({ ...base, category: "Kasbon" }).success).toBe(false);
    expect(expenseInputSchema.safeParse({ ...base, category: "Kasbon", teamName: "Ridwan", cashAdvanceCategory: "Transport" }).success).toBe(true);
  });

  it.each(["Parkir", "Tol", "Pembelian POP", "Perawatan Kendaraan", "ATK", "Konsumsi", "Biaya Bongkar Muat", "Lainnya"])(
    "accepts category %s",
    (category) => expect(expenseInputSchema.safeParse({ ...base, category }).success).toBe(true),
  );

  it.each(["-1", "NaN", "1.234"])("rejects invalid nominal %s", (amount) => {
    expect(expenseInputSchema.safeParse({ ...base, category: "Parkir", amount }).success).toBe(false);
  });

  it("validates void, closing, and reopen idempotency payloads", () => {
    expect(voidExpenseSchema.safeParse({ requestKey: base.requestKey, reason: "Salah input" }).success).toBe(true);
    expect(closeOperationalSchema.safeParse({ requestKey: base.requestKey, operationalDate: base.operationalDate, physicalCash: "500000" }).success).toBe(true);
    expect(reopenOperationalSchema.safeParse({ requestKey: base.requestKey, operationalDate: base.operationalDate, reason: "Koreksi biaya" }).success).toBe(true);
    expect(reopenOperationalSchema.safeParse({ requestKey: base.requestKey, operationalDate: base.operationalDate, reason: "" }).success).toBe(false);
  });

  it("supports date, category, team, search, and pagination filters", () => {
    const result = operationalListQuerySchema.safeParse({
      page: "2", pageSize: "50", operationalDate: "2026-07-29",
      category: "Kasbon", team: "RIDWAN", search: "transport",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.pageSize).toBe(50);
  });

  it("normalizes duplicate team spellings into one canonical key", () => {
    expect(normalizeTeamName(" RIDWAN  ")).toBe("RIDWAN");
    expect(normalizeTeamName("Ridwan")).toBe(normalizeTeamName("ridwan"));
  });
});
